import { useStore } from "../lib/store";
import { getAnalysis, getMeta } from "../lib/rag";

export default function Home() {
  const { papers, setViewingPaperId, setDetailPaperId, activeProjectId, projects } = useStore();

  const project = activeProjectId
    ? projects.find((p) => p.id === activeProjectId)
    : null;

  const displayPapers = project
    ? papers.filter((p) => project.paperIds.includes(p.id))
    : papers;

  const title = project ? project.name : "Library";
  const subtitle = project
    ? `${displayPapers.length} paper${displayPapers.length !== 1 ? "s" : ""}`
    : `${papers.length} paper${papers.length !== 1 ? "s" : ""} in your library`;

  return (
    <main className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto">
      <div className="px-8 py-6">
        <h1 className="text-xl text-text-primary mb-1">{title}</h1>
        <p className="font-ui text-sm text-text-muted mb-6">{subtitle}</p>

        {displayPapers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="text-4xl mb-4">{"\u{1F4DA}"}</div>
            <p className="text-text-secondary text-sm text-center max-w-sm">
              {project
                ? "No papers in this project yet. Drag papers from the library to add them."
                : "Your library is empty. Drop PDF papers onto the sidebar to get started."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayPapers.map((paper) => {
              const analysis = getAnalysis(paper.id);
              const meta = getMeta(paper.id);
              return (
                <div
                  key={paper.id}
                  onClick={() => setDetailPaperId(paper.id)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setViewingPaperId(paper.id);
                  }}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("paper-id", paper.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className="bg-bg-secondary border border-border rounded-lg p-4 cursor-pointer hover:border-gold/40 hover:bg-bg-hover transition-colors group"
                >
                  {/* Icon + status */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="text-2xl">{"\u{1F4C4}"}</div>
                    <div className="flex gap-1.5">
                      {paper.isEmbedded && (
                        <span className="font-ui text-[9px] px-1.5 py-0.5 rounded bg-gold/15 text-gold">
                          Indexed
                        </span>
                      )}
                      {analysis && (
                        <span className="font-ui text-[9px] px-1.5 py-0.5 rounded bg-steel/15 text-steel">
                          Analyzed
                        </span>
                      )}
                      {paper.isProcessing && (
                        <span className="font-ui text-[9px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted">
                          Processing...
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title — use AI title if available */}
                  <h3 className="text-sm text-text-primary font-medium leading-snug mb-1.5 line-clamp-2 group-hover:text-gold transition-colors">
                    {meta?.title && meta.title !== "Unknown" ? meta.title : paper.filename.replace(/\.pdf$/i, "")}
                  </h3>

                  {/* Authors + year */}
                  {meta && meta.authors !== "Unknown" && (
                    <p className="font-ui text-[11px] text-text-secondary truncate mb-1">
                      {meta.authors}{meta.year !== "Unknown" ? ` (${meta.year})` : ""}
                    </p>
                  )}

                  {/* Journal */}
                  {meta && meta.journal !== "Unknown" && (
                    <p className="font-ui text-[10px] text-text-muted italic truncate mb-1.5">
                      {meta.journal}
                    </p>
                  )}

                  {/* Page count */}
                  <p className="font-ui text-xs text-text-muted">
                    {paper.pageCount} page{paper.pageCount !== 1 ? "s" : ""}
                  </p>

                  {/* Keywords */}
                  {meta?.keywords && meta.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {meta.keywords.slice(0, 4).map((kw) => (
                        <span key={kw} className="font-ui text-[9px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted">
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Progress bar if processing */}
                  {paper.isProcessing && (
                    <div className="mt-2 h-1 bg-bg-tertiary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gold rounded-full transition-all duration-300"
                        style={{ width: `${paper.progress}%` }}
                      />
                    </div>
                  )}

                  {/* Abstract preview */}
                  {meta?.abstract ? (
                    <p className="font-ui text-[11px] text-text-muted mt-2 line-clamp-3 leading-relaxed">
                      {meta.abstract}
                    </p>
                  ) : analysis ? (
                    <p className="font-ui text-[11px] text-text-muted mt-2 line-clamp-2 leading-relaxed">
                      {analysis.summary.slice(0, 120)}...
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
