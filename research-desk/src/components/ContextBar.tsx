import { useStore } from "../lib/store";

export default function ContextBar() {
  const { papers, selectedPaperIds, togglePaperSelection, activeProjectId, projects } = useStore();

  const activeProject = activeProjectId ? projects.find((p) => p.id === activeProjectId) : null;

  // Show project badge when project is active
  if (activeProject) {
    const projectPaperCount = activeProject.paperIds.length;
    return (
      <div className="px-4 py-2 border-b border-border flex items-center gap-2">
        <span className="font-ui text-xs text-text-muted shrink-0">Context:</span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-steel/15 border border-steel/30 rounded-full font-ui text-xs text-steel">
          {activeProject.name} ({projectPaperCount} paper{projectPaperCount !== 1 ? "s" : ""})
        </span>
      </div>
    );
  }

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
