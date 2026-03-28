import { useState } from "react";
import { useStore } from "../lib/store";
import type { SavedQuote } from "../lib/store";
import { getMeta, saveMeta, getAnalysis } from "../lib/rag";
import { extractPaperMeta } from "../lib/gemini";

export default function PaperDetail() {
  const { papers, detailPaperId, setDetailPaperId, setViewingPaperId, apiKey, updatePaper, projects, addPaperToProject, removePaperFromProject } = useStore();
  const [generating, setGenerating] = useState(false);
  const [newQuoteText, setNewQuoteText] = useState("");
  const [newQuotePage, setNewQuotePage] = useState("");

  const paper = papers.find((p) => p.id === detailPaperId);
  if (!paper) return null;

  const meta = getMeta(paper.id);
  const analysis = getAnalysis(paper.id);

  const handleGenerateMeta = async () => {
    if (!apiKey.trim() || paper.pages.length === 0) return;
    setGenerating(true);
    try {
      const fullText = paper.pages.map((pg) => pg.text).join("\n\n");
      const newMeta = await extractPaperMeta(fullText, apiKey);
      await saveMeta(paper.id, newMeta);
      updatePaper(paper.id, { meta: newMeta });
    } catch (err) {
      console.error("Meta extraction failed:", err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <aside className="w-80 min-w-80 h-full bg-bg-secondary border-l border-border flex flex-col animate-slide-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="font-ui text-xs text-text-muted uppercase tracking-wider">Paper Details</h2>
        <button
          onClick={() => setDetailPaperId(null)}
          className="text-text-muted hover:text-text-primary transition-colors text-lg leading-none"
        >
          &times;
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Title */}
        <div>
          <h3 className="text-base text-text-primary font-medium leading-snug">
            {meta?.title && meta.title !== "Unknown" ? meta.title : paper.filename.replace(/\.pdf$/i, "")}
          </h3>
          <p className="font-ui text-[11px] text-text-muted mt-1">{paper.filename}</p>
        </div>

        {/* Quick stats */}
        <div className="flex flex-wrap gap-1.5">
          <span className="font-ui text-[10px] px-2 py-0.5 rounded bg-bg-tertiary text-text-muted">
            {paper.pageCount} page{paper.pageCount !== 1 ? "s" : ""}
          </span>
          {paper.isEmbedded && (
            <span className="font-ui text-[10px] px-2 py-0.5 rounded bg-gold/15 text-gold">
              Indexed
            </span>
          )}
          {analysis && (
            <span className="font-ui text-[10px] px-2 py-0.5 rounded bg-steel/15 text-steel">
              Analyzed
            </span>
          )}
        </div>

        {/* Authors & Year */}
        {meta && meta.authors !== "Unknown" && (
          <div>
            <h4 className="font-ui text-[10px] text-text-muted uppercase tracking-wider mb-1">Authors</h4>
            <p className="text-sm text-text-secondary leading-relaxed">
              {meta.authors}
            </p>
            {meta.year !== "Unknown" && (
              <p className="font-ui text-xs text-text-muted mt-0.5">{meta.year}</p>
            )}
          </div>
        )}

        {/* Journal */}
        {meta && meta.journal !== "Unknown" && (
          <div>
            <h4 className="font-ui text-[10px] text-text-muted uppercase tracking-wider mb-1">Journal</h4>
            <p className="text-sm text-text-secondary italic">{meta.journal}</p>
          </div>
        )}

        {/* Keywords */}
        {meta?.keywords && meta.keywords.length > 0 && (
          <div>
            <h4 className="font-ui text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Keywords</h4>
            <div className="flex flex-wrap gap-1.5">
              {meta.keywords.map((kw) => (
                <span key={kw} className="font-ui text-[10px] px-2 py-0.5 rounded bg-bg-tertiary text-text-muted">
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Abstract / Summary */}
        {meta?.abstract ? (
          <div>
            <h4 className="font-ui text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Summary</h4>
            <p className="text-sm text-text-secondary leading-relaxed">{meta.abstract}</p>
          </div>
        ) : analysis ? (
          <div>
            <h4 className="font-ui text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Summary</h4>
            <p className="text-sm text-text-secondary leading-relaxed">{analysis.summary}</p>
          </div>
        ) : null}

        {/* Generate metadata button if none exists */}
        {!meta && (
          <button
            onClick={handleGenerateMeta}
            disabled={generating || !apiKey.trim()}
            className="w-full font-ui text-xs py-2 rounded bg-bg-tertiary border border-border text-text-muted hover:text-text-primary hover:border-gold/40 transition-colors disabled:opacity-40"
          >
            {generating ? "Generating metadata..." : "Generate Metadata"}
          </button>
        )}

        {/* Notes */}
        <div>
          <h4 className="font-ui text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Notes</h4>
          <textarea
            value={paper.notes || ""}
            onChange={(e) => updatePaper(paper.id, { notes: e.target.value })}
            placeholder="Add your notes about this paper..."
            className="w-full bg-bg-tertiary border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50 resize-none leading-relaxed"
            rows={4}
          />
        </div>

        {/* Quotes */}
        <div>
          <h4 className="font-ui text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
            Saved Quotes {paper.quotes?.length > 0 && `(${paper.quotes.length})`}
          </h4>

          {/* Existing quotes */}
          {paper.quotes?.length > 0 && (
            <div className="space-y-2 mb-2">
              {paper.quotes.map((q) => {
                const meta = getMeta(paper.id);
                const authorCite = meta?.authors && meta.authors !== "Unknown"
                  ? meta.authors.split(",")[0].trim()
                  : paper.filename.replace(/\.pdf$/i, "");
                const year = meta?.year && meta.year !== "Unknown" ? meta.year : "n.d.";
                const citation = `(${authorCite}, ${year}${q.pageNum ? `, p. ${q.pageNum}` : ""})`;

                return (
                  <div key={q.id} className="bg-bg-tertiary border border-border rounded px-3 py-2 group">
                    <p className="text-xs text-text-secondary italic leading-relaxed">"{q.text}"</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="font-ui text-[10px] text-text-muted">{citation}</span>
                      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => navigator.clipboard.writeText(`"${q.text}" ${citation}`)}
                          className="font-ui text-[9px] text-text-muted hover:text-text-primary transition-colors"
                        >
                          Copy
                        </button>
                        <button
                          onClick={() => {
                            const updated = paper.quotes.filter((quote) => quote.id !== q.id);
                            updatePaper(paper.id, { quotes: updated });
                          }}
                          className="font-ui text-[9px] text-text-muted hover:text-danger transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add new quote */}
          <div className="space-y-1.5">
            <textarea
              value={newQuoteText}
              onChange={(e) => setNewQuoteText(e.target.value)}
              placeholder="Paste or type a quote..."
              className="w-full bg-bg-tertiary border border-border rounded px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50 resize-none"
              rows={2}
            />
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newQuotePage}
                onChange={(e) => setNewQuotePage(e.target.value)}
                placeholder="Page #"
                className="w-16 bg-bg-tertiary border border-border rounded px-2 py-1 font-ui text-[11px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50"
              />
              <button
                onClick={() => {
                  if (!newQuoteText.trim()) return;
                  const newQuote: SavedQuote = {
                    id: crypto.randomUUID(),
                    text: newQuoteText.trim(),
                    pageNum: newQuotePage ? parseInt(newQuotePage, 10) || null : null,
                    createdAt: Date.now(),
                  };
                  updatePaper(paper.id, { quotes: [...(paper.quotes || []), newQuote] });
                  setNewQuoteText("");
                  setNewQuotePage("");
                }}
                disabled={!newQuoteText.trim()}
                className="font-ui text-[11px] px-2.5 py-1 rounded bg-bg-tertiary border border-border text-text-muted hover:text-text-primary hover:border-gold/40 transition-colors disabled:opacity-30"
              >
                Save Quote
              </button>
            </div>
          </div>
        </div>

        {/* Projects */}
        {projects.length > 0 && (
          <div>
            <h4 className="font-ui text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Projects</h4>
            <div className="space-y-1">
              {projects.map((project) => {
                const isIn = project.paperIds.includes(paper.id);
                return (
                  <button
                    key={project.id}
                    onClick={() =>
                      isIn
                        ? removePaperFromProject(project.id, paper.id)
                        : addPaperToProject(project.id, paper.id)
                    }
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left font-ui text-xs transition-colors ${
                      isIn
                        ? "bg-gold/10 text-gold border border-gold/30"
                        : "bg-bg-tertiary text-text-muted hover:text-text-primary border border-transparent hover:border-border"
                    }`}
                  >
                    <span>{isIn ? "\u2713" : "+"}</span>
                    <span className="truncate">{project.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer — Open PDF button */}
      <div className="px-4 py-3 border-t border-border">
        <button
          onClick={() => setViewingPaperId(paper.id)}
          className="w-full font-ui text-xs py-2.5 rounded bg-gold text-bg font-medium hover:bg-gold-dim transition-colors"
        >
          Open PDF
        </button>
      </div>
    </aside>
  );
}
