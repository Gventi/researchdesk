import { useState, useCallback, useMemo } from "react";
import { marked } from "marked";
import { useStore } from "../lib/store";
import {
  getAnalysis,
  getMeta,
  getProjectAnalysis,
  saveProjectAnalysis,
} from "../lib/rag";
import type { ThemeMapTheme, MethodsRow, ProjectAnalysisData } from "../lib/rag";
import {
  buildProjectContext,
  generateLitReview,
  generateThemeMap,
  generateMethodsTable,
  generateBatchBibliography,
  generateCompareContrast,
  analyzePaper,
} from "../lib/gemini";
import { saveAnalysis } from "../lib/rag";

type Tab = "papers" | "litReview" | "themes" | "methods" | "compare" | "bibliography";

const TABS: { key: Tab; label: string }[] = [
  { key: "papers", label: "Papers" },
  { key: "litReview", label: "Literature Review" },
  { key: "themes", label: "Themes" },
  { key: "methods", label: "Methods" },
  { key: "compare", label: "Compare & Contrast" },
  { key: "bibliography", label: "Bibliography" },
];

export default function ProjectDashboard() {
  const { papers, projects, activeProjectId, apiKey, setProjectModel, setViewingPaperId, setDetailPaperId, updatePaper } = useStore();
  const [activeTab, setActiveTab] = useState<Tab>("papers");
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  // Force re-render after generation completes
  const [, setGenCounter] = useState(0);

  const project = projects.find((p) => p.id === activeProjectId);
  if (!project || !activeProjectId) return null;

  const projectPapers = papers.filter((p) => project.paperIds.includes(p.id));
  const unanalyzedPapers = projectPapers.filter((p) => !getAnalysis(p.id));
  const projectAnalysis = getProjectAnalysis(activeProjectId);
  const model = project.analysisModel || "quick";

  const setLoaded = (key: string, val: boolean) => setLoading((prev) => ({ ...prev, [key]: val }));

  const handleBatchAnalyze = useCallback(async () => {
    if (!apiKey.trim()) return;
    setBatchAnalyzing(true);
    setBatchProgress({ done: 0, total: unanalyzedPapers.length });

    for (let i = 0; i < unanalyzedPapers.length; i++) {
      const p = unanalyzedPapers[i];
      try {
        const fullText = p.pages.map((pg) => pg.text).join("\n\n");
        const analysis = await analyzePaper(fullText, apiKey);
        await saveAnalysis(p.id, analysis);
        updatePaper(p.id, { analysis });
      } catch (err) {
        console.error(`Failed to analyze ${p.filename}:`, err);
      }
      setBatchProgress({ done: i + 1, total: unanalyzedPapers.length });
    }

    setBatchAnalyzing(false);
    setGenCounter((c) => c + 1);
  }, [apiKey, unanalyzedPapers, updatePaper]);

  const generate = useCallback(async (tab: string, fn: () => Promise<Partial<ProjectAnalysisData>>) => {
    setLoaded(tab, true);
    setError(null);
    try {
      const result = await fn();
      await saveProjectAnalysis(activeProjectId, result);
      setGenCounter((c) => c + 1);
    } catch (err: any) {
      setError(err.message || "Generation failed");
    } finally {
      setLoaded(tab, false);
    }
  }, [activeProjectId]);

  const handleGenerateLitReview = () => {
    const ctx = buildProjectContext(projectPapers);
    generate("litReview", async () => ({
      litReview: { content: await generateLitReview(ctx, model, apiKey), generatedAt: Date.now() },
    }));
  };

  const handleGenerateThemes = () => {
    const ctx = buildProjectContext(projectPapers);
    generate("themes", async () => ({
      themeMap: { themes: await generateThemeMap(ctx, model, apiKey), generatedAt: Date.now() },
    }));
  };

  const handleGenerateMethods = () => {
    const ctx = buildProjectContext(projectPapers);
    generate("methods", async () => ({
      methodsTable: { rows: await generateMethodsTable(ctx, model, apiKey), generatedAt: Date.now() },
    }));
  };

  const handleGenerateBibliography = () => {
    const ctx = buildProjectContext(projectPapers);
    generate("bibliography", async () => ({
      bibliography: { entries: await generateBatchBibliography(ctx, model, apiKey), generatedAt: Date.now() },
    }));
  };

  const handleGenerateCompare = () => {
    const ctx = buildProjectContext(projectPapers);
    generate("compare", async () => ({
      compareContrast: { content: await generateCompareContrast(ctx, model, apiKey), generatedAt: Date.now() },
    }));
  };

  const handleExportAll = async () => {
    const pa = projectAnalysis;
    if (!pa) return;

    const sections: string[] = [`# ${project.name} — Research Analysis\n`];

    if (pa.litReview) {
      sections.push(`## Literature Review\n\n${pa.litReview.content}`);
    }

    if (pa.themeMap) {
      const themesText = pa.themeMap.themes.map((t) => {
        const paperList = t.papers
          .map((p) => `  - **${p.title}** (${p.relevance}): ${p.excerpts.join("; ")}`)
          .join("\n");
        return `### ${t.name}\n\n${t.description}\n\n${paperList}`;
      }).join("\n\n");
      sections.push(`## Thematic Analysis\n\n${themesText}`);
    }

    if (pa.methodsTable) {
      const header = "| Paper | Design | Sample Size | Population | Measures | Analysis Method | Findings |";
      const divider = "|-------|--------|------------|------------|----------|----------------|----------|";
      const rows = pa.methodsTable.rows.map((r) =>
        `| ${r.title} | ${r.design} | ${r.sampleSize} | ${r.population} | ${r.measures} | ${r.analysisMethod} | ${r.findings || "N/A"} |`
      ).join("\n");
      sections.push(`## Methodology Comparison\n\n${header}\n${divider}\n${rows}`);
    }

    if (pa.compareContrast) {
      sections.push(`## Compare & Contrast\n\n${pa.compareContrast.content}`);
    }

    if (pa.bibliography) {
      sections.push(`## Annotated Bibliography\n\n${pa.bibliography.entries.join("\n\n---\n\n")}`);
    }

    sections.push(`\n---\n*Generated by Research Desk on ${new Date().toLocaleDateString()}*`);

    await navigator.clipboard.writeText(sections.join("\n\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasAnyGenerated = projectAnalysis && (
    projectAnalysis.litReview || projectAnalysis.themeMap || projectAnalysis.methodsTable || projectAnalysis.compareContrast || projectAnalysis.bibliography
  );

  return (
    <main className="flex-1 flex flex-col min-w-0 h-full">
      {/* Header */}
      <div className="min-h-12 flex items-center justify-between px-6 border-b border-border bg-bg-secondary">
        <div>
          <h1 className="text-base text-text-primary font-medium">{project.name}</h1>
          <p className="font-ui text-[10px] text-text-muted">
            {projectPapers.length} paper{projectPapers.length !== 1 ? "s" : ""}
            {unanalyzedPapers.length > 0 && ` · ${unanalyzedPapers.length} unanalyzed`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Model toggle */}
          <div className="flex items-center bg-bg-tertiary rounded-full p-0.5 font-ui text-[10px]">
            <button
              onClick={() => setProjectModel(project.id, "quick")}
              className={`px-2.5 py-1 rounded-full transition-colors ${
                model === "quick"
                  ? "bg-gold text-bg font-medium"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              Flash Lite
            </button>
            <button
              onClick={() => setProjectModel(project.id, "capable")}
              className={`px-2.5 py-1 rounded-full transition-colors ${
                model === "capable"
                  ? "bg-steel text-bg font-medium"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              2.5 Flash
            </button>
          </div>
          {/* Export all */}
          {hasAnyGenerated && (
            <button
              onClick={handleExportAll}
              className="font-ui text-[10px] px-3 py-1.5 rounded bg-bg-tertiary border border-border text-text-muted hover:text-text-primary hover:border-gold/40 transition-colors"
            >
              {copied ? "Copied!" : "Export All"}
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-6 py-1.5 border-b border-border bg-bg-secondary">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`font-ui text-xs px-3 py-1.5 rounded transition-colors ${
              activeTab === tab.key
                ? "text-text-primary bg-bg border border-border"
                : "text-text-muted hover:text-text-secondary border border-transparent"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-6 py-2 bg-danger/10 border-b border-danger/30">
          <p className="font-ui text-xs text-danger">{error}</p>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "papers" && (
          <PapersTab
            papers={projectPapers}
            onClickPaper={setDetailPaperId}
            onDoubleClickPaper={setViewingPaperId}
          />
        )}
        {activeTab === "litReview" && (
          <GenerationTab
            title="Literature Review"
            description="Generate a comprehensive thematic literature review synthesizing all papers in this project."
            content={projectAnalysis?.litReview?.content}
            generatedAt={projectAnalysis?.litReview?.generatedAt}
            isLoading={loading.litReview}
            unanalyzedCount={unanalyzedPapers.length}
            batchAnalyzing={batchAnalyzing}
            batchProgress={batchProgress}
            onBatchAnalyze={handleBatchAnalyze}
            onGenerate={handleGenerateLitReview}
            onCopy={() => projectAnalysis?.litReview?.content && navigator.clipboard.writeText(projectAnalysis.litReview.content)}
            renderContent={(content) => <MarkdownBlock text={content} />}
          />
        )}
        {activeTab === "themes" && (
          <ThemesTab
            themes={projectAnalysis?.themeMap?.themes}
            generatedAt={projectAnalysis?.themeMap?.generatedAt}
            isLoading={loading.themes}
            unanalyzedCount={unanalyzedPapers.length}
            batchAnalyzing={batchAnalyzing}
            batchProgress={batchProgress}
            onBatchAnalyze={handleBatchAnalyze}
            onGenerate={handleGenerateThemes}
            projectPapers={projectPapers}
          />
        )}
        {activeTab === "methods" && (
          <MethodsTab
            rows={projectAnalysis?.methodsTable?.rows}
            generatedAt={projectAnalysis?.methodsTable?.generatedAt}
            isLoading={loading.methods}
            unanalyzedCount={unanalyzedPapers.length}
            batchAnalyzing={batchAnalyzing}
            batchProgress={batchProgress}
            onBatchAnalyze={handleBatchAnalyze}
            onGenerate={handleGenerateMethods}
          />
        )}
        {activeTab === "compare" && (
          <GenerationTab
            title="Compare & Contrast"
            description="Generate a detailed analysis comparing and contrasting findings, methods, and perspectives across all papers in this project."
            content={projectAnalysis?.compareContrast?.content}
            generatedAt={projectAnalysis?.compareContrast?.generatedAt}
            isLoading={loading.compare}
            unanalyzedCount={unanalyzedPapers.length}
            batchAnalyzing={batchAnalyzing}
            batchProgress={batchProgress}
            onBatchAnalyze={handleBatchAnalyze}
            onGenerate={handleGenerateCompare}
            onCopy={() => projectAnalysis?.compareContrast?.content && navigator.clipboard.writeText(projectAnalysis.compareContrast.content)}
            renderContent={(content) => <MarkdownBlock text={content} />}
          />
        )}
        {activeTab === "bibliography" && (
          <GenerationTab
            title="Annotated Bibliography"
            description="Generate APA 7th edition annotated bibliography entries for all papers in this project."
            content={projectAnalysis?.bibliography?.entries ? projectAnalysis.bibliography.entries.join("\n\n---\n\n") : undefined}
            generatedAt={projectAnalysis?.bibliography?.generatedAt}
            isLoading={loading.bibliography}
            unanalyzedCount={unanalyzedPapers.length}
            batchAnalyzing={batchAnalyzing}
            batchProgress={batchProgress}
            onBatchAnalyze={handleBatchAnalyze}
            onGenerate={handleGenerateBibliography}
            onCopy={() => projectAnalysis?.bibliography?.entries && navigator.clipboard.writeText(projectAnalysis.bibliography.entries.join("\n\n---\n\n"))}
            renderContent={(content) => <MarkdownBlock text={content} />}
          />
        )}
      </div>
    </main>
  );
}

// --- Sub-components ---

function PapersTab({
  papers,
  onClickPaper,
  onDoubleClickPaper,
}: {
  papers: ReturnType<typeof useStore.getState>["papers"];
  onClickPaper: (id: string) => void;
  onDoubleClickPaper: (id: string) => void;
}) {
  if (papers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="text-4xl mb-4">{"\u{1F4DA}"}</div>
        <p className="text-text-secondary text-sm text-center max-w-sm">
          No papers in this project yet. Drag papers from the library to add them.
        </p>
      </div>
    );
  }

  return (
    <div className="px-6 py-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {papers.map((paper) => {
          const analysis = getAnalysis(paper.id);
          const meta = getMeta(paper.id);
          return (
            <div
              key={paper.id}
              onClick={() => onClickPaper(paper.id)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onDoubleClickPaper(paper.id);
              }}
              className="bg-bg-secondary border border-border rounded-lg p-4 cursor-pointer hover:border-gold/40 hover:bg-bg-hover transition-colors group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="text-2xl">{"\u{1F4C4}"}</div>
                <div className="flex gap-1.5">
                  {paper.isEmbedded && (
                    <span className="font-ui text-[9px] px-1.5 py-0.5 rounded bg-gold/15 text-gold">Indexed</span>
                  )}
                  {analysis && (
                    <span className="font-ui text-[9px] px-1.5 py-0.5 rounded bg-steel/15 text-steel">Analyzed</span>
                  )}
                </div>
              </div>
              <h3 className="text-sm text-text-primary font-medium leading-snug mb-1.5 line-clamp-2 group-hover:text-gold transition-colors">
                {meta?.title && meta.title !== "Unknown" ? meta.title : paper.filename.replace(/\.pdf$/i, "")}
              </h3>
              {meta && meta.authors !== "Unknown" && (
                <p className="font-ui text-[11px] text-text-secondary truncate mb-1">
                  {meta.authors}{meta.year !== "Unknown" ? ` (${meta.year})` : ""}
                </p>
              )}
              <p className="font-ui text-xs text-text-muted">
                {paper.pageCount} page{paper.pageCount !== 1 ? "s" : ""}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UnanalyzedBanner({
  count,
  batchAnalyzing,
  batchProgress,
  onBatchAnalyze,
}: {
  count: number;
  batchAnalyzing: boolean;
  batchProgress: { done: number; total: number };
  onBatchAnalyze: () => void;
}) {
  if (count === 0 && !batchAnalyzing) return null;

  return (
    <div className="bg-gold/10 border border-gold/30 rounded-lg px-4 py-3 mb-5 flex items-center justify-between">
      <div>
        <p className="font-ui text-xs text-gold font-medium">
          {batchAnalyzing
            ? `Analyzing papers... ${batchProgress.done}/${batchProgress.total}`
            : `${count} paper${count !== 1 ? "s" : ""} need analysis before generating`}
        </p>
        <p className="font-ui text-[10px] text-text-muted mt-0.5">
          Individual paper analysis is required to build project-level insights.
        </p>
      </div>
      {!batchAnalyzing && (
        <button
          onClick={onBatchAnalyze}
          className="font-ui text-xs px-3 py-1.5 rounded bg-gold text-bg font-medium hover:bg-gold-dim transition-colors shrink-0 ml-4"
        >
          Analyze All
        </button>
      )}
      {batchAnalyzing && (
        <div className="w-24 h-1.5 bg-bg-tertiary rounded-full overflow-hidden ml-4">
          <div
            className="h-full bg-gold rounded-full transition-all duration-300"
            style={{ width: `${batchProgress.total > 0 ? (batchProgress.done / batchProgress.total) * 100 : 0}%` }}
          />
        </div>
      )}
    </div>
  );
}

function GenerationTab({
  title,
  description,
  content,
  generatedAt,
  isLoading,
  unanalyzedCount,
  batchAnalyzing,
  batchProgress,
  onBatchAnalyze,
  onGenerate,
  onCopy,
  renderContent,
}: {
  title: string;
  description: string;
  content?: string;
  generatedAt?: number;
  isLoading?: boolean;
  unanalyzedCount: number;
  batchAnalyzing: boolean;
  batchProgress: { done: number; total: number };
  onBatchAnalyze: () => void;
  onGenerate: () => void;
  onCopy?: () => void;
  renderContent: (content: string) => React.ReactNode;
}) {
  return (
    <div className="px-6 py-5 max-w-4xl">
      <UnanalyzedBanner
        count={unanalyzedCount}
        batchAnalyzing={batchAnalyzing}
        batchProgress={batchProgress}
        onBatchAnalyze={onBatchAnalyze}
      />

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="text-2xl mb-4 animate-pulse">{"\u{2728}"}</div>
          <p className="font-ui text-sm text-text-secondary">Generating {title.toLowerCase()}...</p>
          <p className="font-ui text-xs text-text-muted mt-2">This may take 30-60 seconds</p>
        </div>
      ) : content ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm text-text-primary font-medium">{title}</h2>
              {generatedAt && (
                <p className="font-ui text-[10px] text-text-muted mt-0.5">
                  Generated {new Date(generatedAt).toLocaleDateString()} at {new Date(generatedAt).toLocaleTimeString()}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {onCopy && (
                <CopyButton onClick={onCopy} />
              )}
              <button
                onClick={onGenerate}
                disabled={unanalyzedCount > 0 && !batchAnalyzing}
                className="font-ui text-[10px] px-3 py-1.5 rounded bg-bg-tertiary border border-border text-text-muted hover:text-text-primary hover:border-gold/40 transition-colors disabled:opacity-40"
              >
                Regenerate
              </button>
            </div>
          </div>
          {renderContent(content)}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16">
          <h2 className="text-lg text-text-primary mb-2">{title}</h2>
          <p className="text-sm text-text-secondary text-center max-w-md mb-6">{description}</p>
          <button
            onClick={onGenerate}
            disabled={unanalyzedCount > 0 || batchAnalyzing}
            className="font-ui text-sm px-5 py-2.5 rounded-lg bg-gold text-bg font-medium hover:bg-gold-dim transition-colors disabled:opacity-40"
          >
            Generate {title}
          </button>
        </div>
      )}
    </div>
  );
}

function ThemesTab({
  themes,
  generatedAt,
  isLoading,
  unanalyzedCount,
  batchAnalyzing,
  batchProgress,
  onBatchAnalyze,
  onGenerate,
  projectPapers,
}: {
  themes?: ThemeMapTheme[];
  generatedAt?: number;
  isLoading?: boolean;
  unanalyzedCount: number;
  batchAnalyzing: boolean;
  batchProgress: { done: number; total: number };
  onBatchAnalyze: () => void;
  onGenerate: () => void;
  projectPapers: ReturnType<typeof useStore.getState>["papers"];
}) {
  const [copiedThemes, setCopiedThemes] = useState(false);

  const handleCopyThemes = async () => {
    if (!themes) return;
    const text = themes.map((t) => {
      const papers = t.papers.map((p) => `  - ${p.title} (${p.relevance}): ${p.excerpts.join("; ")}`).join("\n");
      return `## ${t.name}\n${t.description}\n\n${papers}`;
    }).join("\n\n");
    await navigator.clipboard.writeText(text);
    setCopiedThemes(true);
    setTimeout(() => setCopiedThemes(false), 2000);
  };

  // Get short titles for column headers
  const paperTitles = projectPapers.map((p) => {
    const meta = getMeta(p.id);
    const full = meta?.title && meta.title !== "Unknown" ? meta.title : p.filename.replace(/\.pdf$/i, "");
    return { id: p.id, short: full.length > 25 ? full.slice(0, 22) + "..." : full, full };
  });

  return (
    <div className="px-6 py-5">
      <UnanalyzedBanner
        count={unanalyzedCount}
        batchAnalyzing={batchAnalyzing}
        batchProgress={batchProgress}
        onBatchAnalyze={onBatchAnalyze}
      />

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="text-2xl mb-4 animate-pulse">{"\u{1F3AF}"}</div>
          <p className="font-ui text-sm text-text-secondary">Identifying themes across papers...</p>
          <p className="font-ui text-xs text-text-muted mt-2">This may take 30-60 seconds</p>
        </div>
      ) : themes && themes.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm text-text-primary font-medium">Thematic Coding Map</h2>
              <p className="font-ui text-[10px] text-text-muted mt-0.5">
                {themes.length} themes identified across {projectPapers.length} papers
                {generatedAt && ` · Generated ${new Date(generatedAt).toLocaleDateString()}`}
              </p>
            </div>
            <div className="flex gap-2">
              <CopyButton onClick={handleCopyThemes} copied={copiedThemes} />
              <button
                onClick={onGenerate}
                disabled={unanalyzedCount > 0}
                className="font-ui text-[10px] px-3 py-1.5 rounded bg-bg-tertiary border border-border text-text-muted hover:text-text-primary hover:border-gold/40 transition-colors disabled:opacity-40"
              >
                Regenerate
              </button>
            </div>
          </div>

          {/* Theme descriptions */}
          <div className="space-y-3 mb-6">
            {themes.map((theme, i) => (
              <div key={i} className="bg-bg-secondary border border-border rounded-lg px-4 py-3">
                <h3 className="text-sm text-text-primary font-medium mb-1">{theme.name}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{theme.description}</p>
              </div>
            ))}
          </div>

          {/* Theme × Paper grid */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="text-left font-ui text-xs uppercase tracking-wider text-text-muted px-3 py-2 border-b border-border bg-bg-secondary sticky top-0 min-w-[160px]">
                    Theme
                  </th>
                  {paperTitles.map((p) => (
                    <th
                      key={p.id}
                      className="text-left font-ui text-xs uppercase tracking-wider text-text-muted px-3 py-2 border-b border-border bg-bg-secondary sticky top-0 min-w-[140px] max-w-[200px]"
                      title={p.full}
                    >
                      {p.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {themes.map((theme, ti) => (
                  <tr key={ti} className="border-b border-border hover:bg-bg-hover transition-colors">
                    <td className="px-3 py-3 align-top font-medium text-text-primary min-w-[160px]">
                      {theme.name}
                    </td>
                    {paperTitles.map((pt) => {
                      const match = theme.papers.find((tp) => tp.paperId === pt.id);
                      return (
                        <td key={pt.id} className="px-3 py-3 align-top min-w-[140px] max-w-[200px]">
                          {match ? (
                            <div>
                              <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
                                match.relevance === "high" ? "bg-gold" :
                                match.relevance === "medium" ? "bg-steel" : "bg-text-muted"
                              }`} />
                              <span className="font-ui text-xs uppercase text-text-muted">{match.relevance}</span>
                              <div className="max-h-28 overflow-y-auto mt-1">
                                {match.excerpts.map((ex, ei) => (
                                  <p key={ei} className="text-sm text-text-secondary leading-relaxed mt-1 italic">
                                    "{ex}"
                                  </p>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span className="text-text-muted text-[10px]">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16">
          <h2 className="text-lg text-text-primary mb-2">Thematic Coding Map</h2>
          <p className="text-sm text-text-secondary text-center max-w-md mb-6">
            Identify 5-8 recurring themes across all papers and see which papers contribute to each theme with supporting excerpts.
          </p>
          <button
            onClick={onGenerate}
            disabled={unanalyzedCount > 0 || batchAnalyzing}
            className="font-ui text-sm px-5 py-2.5 rounded-lg bg-gold text-bg font-medium hover:bg-gold-dim transition-colors disabled:opacity-40"
          >
            Generate Theme Map
          </button>
        </div>
      )}
    </div>
  );
}

function MethodsTab({
  rows,
  generatedAt,
  isLoading,
  unanalyzedCount,
  batchAnalyzing,
  batchProgress,
  onBatchAnalyze,
  onGenerate,
}: {
  rows?: MethodsRow[];
  generatedAt?: number;
  isLoading?: boolean;
  unanalyzedCount: number;
  batchAnalyzing: boolean;
  batchProgress: { done: number; total: number };
  onBatchAnalyze: () => void;
  onGenerate: () => void;
}) {
  const [copiedMethods, setCopiedMethods] = useState(false);

  const handleCopy = async () => {
    if (!rows) return;
    const header = "Paper\tDesign\tSample Size\tPopulation\tMeasures\tAnalysis Method\tFindings";
    const body = rows.map((r) =>
      `${r.title}\t${r.design}\t${r.sampleSize}\t${r.population}\t${r.measures}\t${r.analysisMethod}\t${r.findings || "N/A"}`
    ).join("\n");
    await navigator.clipboard.writeText(`${header}\n${body}`);
    setCopiedMethods(true);
    setTimeout(() => setCopiedMethods(false), 2000);
  };

  const COLS = [
    { key: "title" as const, label: "Paper", minW: "min-w-[180px]", maxW: "max-w-[220px]" },
    { key: "design" as const, label: "Design", minW: "min-w-[150px]", maxW: "max-w-[200px]" },
    { key: "sampleSize" as const, label: "Sample Size", minW: "min-w-[120px]", maxW: "max-w-[180px]" },
    { key: "population" as const, label: "Population", minW: "min-w-[150px]", maxW: "max-w-[220px]" },
    { key: "measures" as const, label: "Measures / Instruments", minW: "min-w-[180px]", maxW: "max-w-[260px]" },
    { key: "analysisMethod" as const, label: "Analysis Method", minW: "min-w-[150px]", maxW: "max-w-[220px]" },
    { key: "findings" as const, label: "Findings", minW: "min-w-[200px]", maxW: "max-w-[300px]" },
  ];

  return (
    <div className="px-6 py-5">
      <UnanalyzedBanner
        count={unanalyzedCount}
        batchAnalyzing={batchAnalyzing}
        batchProgress={batchProgress}
        onBatchAnalyze={onBatchAnalyze}
      />

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="text-2xl mb-4 animate-pulse">{"\u{1F52C}"}</div>
          <p className="font-ui text-sm text-text-secondary">Extracting methodology details...</p>
          <p className="font-ui text-xs text-text-muted mt-2">This may take 30-60 seconds</p>
        </div>
      ) : rows && rows.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm text-text-primary font-medium">Methodology Comparison</h2>
              <p className="font-ui text-[10px] text-text-muted mt-0.5">
                {rows.length} papers compared
                {generatedAt && ` · Generated ${new Date(generatedAt).toLocaleDateString()}`}
              </p>
            </div>
            <div className="flex gap-2">
              <CopyButton onClick={handleCopy} copied={copiedMethods} />
              <button
                onClick={onGenerate}
                disabled={unanalyzedCount > 0}
                className="font-ui text-[10px] px-3 py-1.5 rounded bg-bg-tertiary border border-border text-text-muted hover:text-text-primary hover:border-gold/40 transition-colors disabled:opacity-40"
              >
                Regenerate
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {COLS.map((col) => (
                    <th
                      key={col.key}
                      className={`text-left font-ui text-[10px] uppercase tracking-wider text-text-muted px-3 py-2 border-b border-border bg-bg-secondary sticky top-0 ${col.minW}`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-border hover:bg-bg-hover transition-colors">
                    {COLS.map((col) => (
                      <td
                        key={col.key}
                        className={`px-3 py-3 align-top ${col.minW} ${col.maxW} ${
                          col.key === "title" ? "text-text-primary font-medium" : "text-text-secondary"
                        }`}
                      >
                        <div className={col.key === "title" ? "" : "max-h-40 overflow-y-auto text-sm leading-relaxed"}>
                          {row[col.key]}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16">
          <h2 className="text-lg text-text-primary mb-2">Methodology Comparison</h2>
          <p className="text-sm text-text-secondary text-center max-w-md mb-6">
            Auto-generate a structured comparison of research designs, sample sizes, populations, measures, and analysis methods across all papers.
          </p>
          <button
            onClick={onGenerate}
            disabled={unanalyzedCount > 0 || batchAnalyzing}
            className="font-ui text-sm px-5 py-2.5 rounded-lg bg-gold text-bg font-medium hover:bg-gold-dim transition-colors disabled:opacity-40"
          >
            Generate Methods Table
          </button>
        </div>
      )}
    </div>
  );
}

function MarkdownBlock({ text }: { text: string }) {
  const html = useMemo(() => marked.parse(text) as string, [text]);
  return (
    <div
      className="prose-response"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function CopyButton({ onClick, copied: copiedProp }: { onClick: () => void; copied?: boolean }) {
  const [internalCopied, setInternalCopied] = useState(false);
  const isCopied = copiedProp ?? internalCopied;

  const handleClick = () => {
    onClick();
    if (copiedProp === undefined) {
      setInternalCopied(true);
      setTimeout(() => setInternalCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="font-ui text-[10px] px-3 py-1.5 rounded bg-bg-tertiary border border-border text-text-muted hover:text-text-primary hover:border-gold/40 transition-colors"
    >
      {isCopied ? "Copied!" : "Copy"}
    </button>
  );
}
