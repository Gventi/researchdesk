import { useState } from "react";
import { useStore } from "../lib/store";
import { getAnalysis, getMeta } from "../lib/rag";

const COLUMNS = [
  { key: "title", label: "Paper" },
  { key: "year", label: "Year" },
  { key: "methodology", label: "Methodology" },
  { key: "keyFindings", label: "Key Findings" },
  { key: "synthesisNotes", label: "Framework / Themes" },
  { key: "limitations", label: "Limitations" },
] as const;

export default function SynthesisMatrix() {
  const { papers, selectedPaperIds } = useStore();
  const [copied, setCopied] = useState(false);

  const selectedPapers = papers.filter((p) => selectedPaperIds.includes(p.id));

  const rows = selectedPapers.map((paper) => {
    const analysis = getAnalysis(paper.id);
    const meta = getMeta(paper.id);
    return {
      id: paper.id,
      title: meta?.title && meta.title !== "Unknown" ? meta.title : paper.filename.replace(/\.pdf$/i, ""),
      year: meta?.year && meta.year !== "Unknown" ? meta.year : "—",
      methodology: analysis?.methodology || "Not analyzed",
      keyFindings: analysis?.keyFindings || "Not analyzed",
      synthesisNotes: analysis?.synthesisNotes || "Not analyzed",
      limitations: analysis?.limitations || "Not analyzed",
    };
  });

  const handleExport = async () => {
    // Export as tab-separated values for pasting into Word/Excel
    const header = COLUMNS.map((c) => c.label).join("\t");
    const body = rows
      .map((row) =>
        COLUMNS.map((c) => {
          const val = row[c.key] || "";
          // Replace newlines and tabs for clean TSV
          return val.replace(/[\t\n\r]+/g, " ").trim();
        }).join("\t"),
      )
      .join("\n");
    await navigator.clipboard.writeText(`${header}\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (selectedPapers.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="text-4xl mb-4">{"\u{1F4CA}"}</div>
        <h2 className="text-xl text-text-primary mb-2">Synthesis Matrix</h2>
        <p className="text-text-secondary text-sm text-center max-w-md">
          Select papers in the library sidebar to compare them in a structured table.
          Papers need to be analyzed first for full data.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full">
      {/* Header */}
      <div className="min-h-10 flex items-center justify-between px-4 border-b border-border bg-bg-secondary">
        <div>
          <h2 className="text-sm text-text-primary font-medium">Synthesis Matrix</h2>
          <p className="font-ui text-[10px] text-text-muted">
            {selectedPapers.length} paper{selectedPapers.length !== 1 ? "s" : ""} selected
          </p>
        </div>
        <button
          onClick={handleExport}
          className="font-ui text-[10px] px-3 py-1.5 rounded bg-bg-tertiary border border-border text-text-muted hover:text-text-primary hover:border-gold/40 transition-colors"
        >
          {copied ? "Copied to clipboard!" : "Copy as Table"}
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-4">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="text-left font-ui text-[10px] uppercase tracking-wider text-text-muted px-3 py-2 border-b border-border bg-bg-secondary sticky top-0"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border hover:bg-bg-hover transition-colors">
                {COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-3 align-top ${
                      col.key === "title"
                        ? "text-text-primary font-medium min-w-[180px] max-w-[220px]"
                        : col.key === "year"
                          ? "text-text-secondary font-ui text-xs min-w-[60px]"
                          : "text-text-secondary min-w-[200px] max-w-[300px]"
                    }`}
                  >
                    <div className={col.key === "title" || col.key === "year" ? "" : "line-clamp-6 text-xs leading-relaxed"}>
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
  );
}
