import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../lib/store";

interface PdfViewerProps {
  paperId: string;
}

export default function PdfViewer({ paperId }: PdfViewerProps) {
  const { papers } = useStore();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const paper = papers.find((p) => p.id === paperId);

  useEffect(() => {
    if (!paper?.filePath) return;

    let url: string | null = null;

    (async () => {
      try {
        const bytes: number[] = await invoke("read_file_bytes", { path: paper.filePath });
        const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setError(null);
      } catch (err) {
        setError("Failed to load PDF file. It may have been moved or deleted.");
        console.error("PDF viewer error:", err);
      }
    })();

    return () => {
      if (url) URL.revokeObjectURL(url);
      setBlobUrl(null);
      setError(null);
    };
  }, [paper?.filePath]);

  if (!paper) return null;

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-ui text-sm text-text-muted">{error}</p>
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-ui text-sm text-text-muted">Loading PDF...</p>
      </div>
    );
  }

  return (
    <iframe
      src={blobUrl}
      className="w-full h-full border-none"
      title={paper.filename}
    />
  );
}
