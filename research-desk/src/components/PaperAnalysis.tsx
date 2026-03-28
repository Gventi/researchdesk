import { useState, useEffect } from "react";
import { useStore } from "../lib/store";
import { analyzePaper, generateAnnotatedBib } from "../lib/gemini";
import { getAnalysis, saveAnalysis } from "../lib/rag";
import type { PaperAnalysis as PaperAnalysisType } from "../lib/store";

const SECTIONS: { key: keyof Omit<PaperAnalysisType, "generatedAt" | "annotatedBibliography">; label: string; icon: string }[] = [
  { key: "summary", label: "Summary", icon: "\u{1F4CB}" },
  { key: "keyFindings", label: "Key Findings", icon: "\u{1F4A1}" },
  { key: "methodology", label: "Methodology", icon: "\u{1F52C}" },
  { key: "dataExtraction", label: "Data Extraction", icon: "\u{1F4CA}" },
  { key: "synthesisNotes", label: "Synthesis Notes", icon: "\u{1F517}" },
  { key: "limitations", label: "Limitations", icon: "\u{26A0}" },
];

export default function PaperAnalysisPanel({ paperId }: { paperId: string }) {
  const { papers, apiKey } = useStore();
  const paper = papers.find((p) => p.id === paperId);
  const [analysis, setAnalysis] = useState<PaperAnalysisType | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBibGenerating, setIsBibGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = getAnalysis(paperId);
    if (saved) setAnalysis(saved);
    else setAnalysis(null);
  }, [paperId]);

  const handleGenerate = async () => {
    if (!paper || !apiKey.trim()) {
      setError("API key required. Set it in Settings.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const fullText = paper.pages.map((p) => p.text).join("\n\n");
      const result = await analyzePaper(fullText, apiKey);
      setAnalysis(result);
      await saveAnalysis(paperId, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAnnotatedBib = async () => {
    if (!paper || !apiKey.trim()) {
      setError("API key required. Set it in Settings.");
      return;
    }

    setIsBibGenerating(true);
    setError(null);

    try {
      const fullText = paper.pages.map((p) => p.text).join("\n\n");
      const bib = await generateAnnotatedBib(fullText, apiKey);
      const updated = { ...(analysis || {} as PaperAnalysisType), annotatedBibliography: bib, generatedAt: analysis?.generatedAt || Date.now() };
      setAnalysis(updated);
      await saveAnalysis(paperId, updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Annotated bibliography generation failed");
    } finally {
      setIsBibGenerating(false);
    }
  };

  const handleCopyBib = () => {
    if (analysis?.annotatedBibliography) {
      navigator.clipboard.writeText(analysis.annotatedBibliography);
    }
  };

  const [exportCopied, setExportCopied] = useState(false);

  const handleExportAll = async () => {
    if (!analysis) return;
    const sections = SECTIONS.map(
      ({ key, label }) => `## ${label}\n\n${analysis[key] || "N/A"}`,
    ).join("\n\n");
    const bib = analysis.annotatedBibliography
      ? `\n\n## Annotated Bibliography\n\n${analysis.annotatedBibliography}`
      : "";
    const text = `# Analysis: ${paper?.filename || "Paper"}\n\n${sections}${bib}`;
    await navigator.clipboard.writeText(text);
    setExportCopied(true);
    setTimeout(() => setExportCopied(false), 2000);
  };

  if (!paper) return null;

  if (!analysis && !isGenerating) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="text-4xl mb-4">{"\u{1F9EA}"}</div>
        <h3 className="text-lg text-text-primary mb-2">Paper Analysis</h3>
        <p className="text-sm text-text-secondary text-center mb-6 max-w-sm">
          Generate a deep AI analysis of this paper including key findings,
          methodology, data extraction, and synthesis notes.
        </p>
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="font-ui text-sm px-5 py-2.5 rounded-lg bg-gold text-bg font-medium hover:bg-gold-dim transition-colors disabled:opacity-50"
        >
          Generate Analysis
        </button>
        {error && (
          <p className="font-ui text-sm text-danger mt-4">{error}</p>
        )}
      </div>
    );
  }

  if (isGenerating) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-2xl mb-4 animate-pulse">{"\u{1F9EA}"}</div>
        <p className="font-ui text-sm text-text-secondary">Analyzing paper...</p>
        <p className="font-ui text-xs text-text-muted mt-2">This may take 15-30 seconds</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base text-text-primary font-semibold">Analysis</h3>
          {analysis?.generatedAt && (
            <p className="font-ui text-[10px] text-text-muted mt-0.5">
              Generated {new Date(analysis.generatedAt).toLocaleDateString()} at{" "}
              {new Date(analysis.generatedAt).toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportAll}
            className="font-ui text-xs px-3 py-1.5 rounded bg-bg-tertiary border border-border text-text-muted hover:text-text-primary hover:border-gold/40 transition-colors"
          >
            {exportCopied ? "Copied!" : "Export All"}
          </button>
          <button
            onClick={handleAnnotatedBib}
            disabled={isBibGenerating}
            className="font-ui text-xs px-3 py-1.5 rounded bg-steel/15 border border-steel/30 text-steel hover:bg-steel/25 transition-colors disabled:opacity-50"
          >
            {isBibGenerating ? "Generating..." : analysis?.annotatedBibliography ? "Regenerate Bib" : "Annotated Bibliography"}
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="font-ui text-xs px-3 py-1.5 rounded bg-bg-tertiary border border-border text-text-muted hover:text-text-primary hover:border-gold/40 transition-colors disabled:opacity-50"
          >
            Regenerate
          </button>
        </div>
      </div>

      {error && (
        <p className="font-ui text-sm text-danger">{error}</p>
      )}

      {/* Annotated Bibliography */}
      {analysis?.annotatedBibliography && (
        <div className="bg-bg-secondary border border-steel/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2.5">
            <h4 className="font-ui text-sm font-medium text-text-primary flex items-center gap-2">
              <span>{"\u{1F4D6}"}</span> Annotated Bibliography
            </h4>
            <button
              onClick={handleCopyBib}
              className="font-ui text-[10px] px-2 py-1 rounded bg-bg-tertiary border border-border text-text-muted hover:text-text-primary transition-colors"
            >
              Copy
            </button>
          </div>
          <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
            {analysis.annotatedBibliography}
          </div>
        </div>
      )}

      {/* Sections */}
      {analysis && SECTIONS.map(({ key, label, icon }) => (
        <div key={key} className="bg-bg-secondary border border-border rounded-lg p-4">
          <h4 className="font-ui text-sm font-medium text-text-primary mb-2.5 flex items-center gap-2">
            <span>{icon}</span> {label}
          </h4>
          <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
            {analysis[key] || "No data available."}
          </div>
        </div>
      ))}
    </div>
  );
}
