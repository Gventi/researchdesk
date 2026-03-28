import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../lib/store";
import PaperAnalysisPanel from "./PaperAnalysis";

type Tab = "pdf" | "analysis" | "notes";

export default function PdfViewer() {
  const { viewingPaperId, papers, setViewingPaperId, updatePaper } = useStore();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("pdf");

  const paper = papers.find((p) => p.id === viewingPaperId);

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

  // Reset tab when switching papers
  useEffect(() => {
    setActiveTab("pdf");
  }, [viewingPaperId]);

  if (!paper) return null;

  return (
    <div className="flex-1 flex flex-col bg-bg min-w-0">
      {/* Header with tabs */}
      <div className="min-h-10 flex items-center justify-between px-4 border-b border-border bg-bg-secondary">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab("pdf")}
            className={`font-ui text-xs px-3 py-1.5 rounded-t transition-colors ${
              activeTab === "pdf"
                ? "text-text-primary bg-bg border-b-2 border-gold"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            PDF
          </button>
          <button
            onClick={() => setActiveTab("analysis")}
            className={`font-ui text-xs px-3 py-1.5 rounded-t transition-colors ${
              activeTab === "analysis"
                ? "text-text-primary bg-bg border-b-2 border-gold"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            Analysis
          </button>
          <button
            onClick={() => setActiveTab("notes")}
            className={`font-ui text-xs px-3 py-1.5 rounded-t transition-colors ${
              activeTab === "notes"
                ? "text-text-primary bg-bg border-b-2 border-gold"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            Notes
          </button>
          <span className="text-text-muted mx-2">|</span>
          <p className="text-sm text-text-primary truncate max-w-[300px]">{paper.filename}</p>
        </div>
        <button
          onClick={() => setViewingPaperId(null)}
          className="font-ui text-xs px-3 py-1 rounded bg-bg-tertiary border border-border text-text-muted hover:text-text-primary hover:border-gold/40 transition-colors"
        >
          Close
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "pdf" ? (
        <div className="flex-1 overflow-hidden">
          {error ? (
            <div className="flex items-center justify-center h-full">
              <p className="font-ui text-sm text-text-muted">{error}</p>
            </div>
          ) : blobUrl ? (
            <iframe
              src={blobUrl}
              className="w-full h-full border-none"
              title={paper.filename}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="font-ui text-sm text-text-muted">Loading PDF...</p>
            </div>
          )}
        </div>
      ) : activeTab === "analysis" ? (
        <PaperAnalysisPanel paperId={paper.id} />
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            <h3 className="text-lg text-text-primary mb-1">Notes</h3>
            <p className="font-ui text-xs text-text-muted mb-4">
              Your personal notes on this paper. These are saved automatically.
            </p>
            <textarea
              value={paper.notes || ""}
              onChange={(e) => updatePaper(paper.id, { notes: e.target.value })}
              placeholder="Write your notes here — key quotes, observations, how this connects to other papers, things to follow up on..."
              className="w-full min-h-[400px] bg-bg-secondary border border-border rounded-lg px-5 py-4 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50 resize-y leading-relaxed"
            />
          </div>
        </div>
      )}
    </div>
  );
}
