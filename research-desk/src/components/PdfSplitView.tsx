import { useStore } from "../lib/store";
import PdfViewer from "./PdfViewer";
import PaperDetail from "./PaperDetail";
import PaperAnalysisPanel from "./PaperAnalysis";
import { getMeta } from "../lib/rag";

export default function PdfSplitView() {
  const { viewingPaperId, papers, setViewingPaperId } = useStore();

  const paper = papers.find((p) => p.id === viewingPaperId);
  if (!paper || !viewingPaperId) return null;

  const meta = getMeta(paper.id);
  const displayTitle = meta?.title && meta.title !== "Unknown"
    ? meta.title
    : paper.filename.replace(/\.pdf$/i, "");

  return (
    <div className="flex-1 flex flex-col bg-bg min-w-0">
      {/* Header */}
      <div className="min-h-10 flex items-center justify-between px-4 border-b border-border bg-bg-secondary">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm shrink-0">{"\u{1F4C4}"}</span>
          <p className="text-sm text-text-primary truncate">{displayTitle}</p>
          <span className="font-ui text-[10px] text-text-muted shrink-0">{paper.filename}</span>
        </div>
        <button
          onClick={() => setViewingPaperId(null)}
          className="font-ui text-xs px-3 py-1 rounded bg-bg-tertiary border border-border text-text-muted hover:text-text-primary hover:border-gold/40 transition-colors shrink-0 ml-4"
        >
          Close
        </button>
      </div>

      {/* Split content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left — PDF */}
        <div className="flex-[3] min-w-[400px] overflow-hidden">
          <PdfViewer paperId={viewingPaperId} />
        </div>

        {/* Right — Details + Analysis */}
        <div className="flex-[2] border-l border-border bg-bg-secondary overflow-y-auto px-5 py-5 space-y-6">
          {/* Paper details */}
          <PaperDetail paperId={viewingPaperId} embedded />

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Analysis */}
          <div>
            <h2 className="font-ui text-xs text-text-muted uppercase tracking-wider mb-4">Analysis</h2>
            <PaperAnalysisPanel paperId={viewingPaperId} />
          </div>
        </div>
      </div>
    </div>
  );
}
