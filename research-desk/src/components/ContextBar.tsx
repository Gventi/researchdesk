import { useStore } from "../lib/store";

export default function ContextBar() {
  const { papers, selectedPaperIds, togglePaperSelection } = useStore();

  const selectedPapers = papers.filter((p) =>
    selectedPaperIds.includes(p.id),
  );

  if (selectedPapers.length === 0) return null;

  return (
    <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-wrap">
      <span className="font-ui text-xs text-text-muted shrink-0">Context:</span>
      {selectedPapers.map((paper) => (
        <span
          key={paper.id}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-bg-tertiary border border-border rounded-full font-ui text-xs text-text-secondary"
        >
          {paper.filename.replace(/\.pdf$/i, "")}
          <button
            onClick={() => togglePaperSelection(paper.id)}
            className="text-text-muted hover:text-text-primary transition-colors leading-none"
          >
            &times;
          </button>
        </span>
      ))}
    </div>
  );
}
