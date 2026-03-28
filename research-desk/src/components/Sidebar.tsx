import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../lib/store";
import { extractText } from "../lib/pdf";
import { ingestPaper, removeVectorsForPaper, saveVectorStore, getMeta, saveMeta } from "../lib/rag";
import { extractPaperMeta } from "../lib/gemini";

async function loadPdf(path: string): Promise<{ filename: string; data: ArrayBuffer }> {
  const filename = path.split(/[/\\]/).pop() || path;
  const bytes: number[] = await invoke("read_file_bytes", { path });
  const data = new Uint8Array(bytes).buffer;
  return { filename, data };
}

type SidebarTab = "library" | "projects";

export default function Sidebar() {
  const {
    papers, selectedPaperIds, togglePaperSelection, selectAllPapers, deselectAllPapers,
    addPaper, removePaper, updatePaper, sidebarOpen, apiKey, setViewingPaperId, setDetailPaperId,
    projects, addProject, removeProject, addPaperToProject,
    setActiveView, activeProjectId, setActiveProjectId,
  } = useStore();

  const processingRef = useRef(new Set<string>());
  const [isDragOver, setIsDragOver] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("library");
  const [newProjectName, setNewProjectName] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [dropTargetProject, setDropTargetProject] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [metaGenerating, setMetaGenerating] = useState<Set<string>>(new Set());
  const [reindexing, setReindexing] = useState(false);

  const totalPages = papers.reduce((sum, p) => sum + p.pageCount, 0);
  const unindexedPapers = papers.filter((p) => !p.isEmbedded && !p.isProcessing && p.pages.length > 0);

  // Filter papers by search query (searches filename, metadata title/authors/keywords/abstract)
  const filteredPapers = searchQuery.trim()
    ? papers.filter((p) => {
        const q = searchQuery.toLowerCase();
        const meta = getMeta(p.id);
        return (
          p.filename.toLowerCase().includes(q) ||
          (meta?.title?.toLowerCase().includes(q)) ||
          (meta?.authors?.toLowerCase().includes(q)) ||
          (meta?.year?.includes(q)) ||
          (meta?.journal?.toLowerCase().includes(q)) ||
          (meta?.abstract?.toLowerCase().includes(q)) ||
          (meta?.keywords?.some((k) => k.toLowerCase().includes(q))) ||
          (p.notes?.toLowerCase().includes(q))
        );
      })
    : papers;

  const handleGenerateAllMeta = async () => {
    if (!apiKey.trim()) return;
    const papersNeedingMeta = papers.filter((p) => !getMeta(p.id) && p.pages.length > 0);
    for (const paper of papersNeedingMeta) {
      setMetaGenerating((prev) => new Set(prev).add(paper.id));
      try {
        const fullText = paper.pages.map((pg) => pg.text).join("\n\n");
        const meta = await extractPaperMeta(fullText, apiKey);
        await saveMeta(paper.id, meta);
        updatePaper(paper.id, { meta });
      } catch (err) {
        console.error("Meta extraction failed for", paper.filename, err);
      } finally {
        setMetaGenerating((prev) => { const next = new Set(prev); next.delete(paper.id); return next; });
      }
    }
  };

  const handleReindexAll = async () => {
    if (!apiKey.trim() || unindexedPapers.length === 0) return;
    setReindexing(true);
    for (const paper of unindexedPapers) {
      updatePaper(paper.id, { isProcessing: true, progress: 10 });
      try {
        await ingestPaper(paper, apiKey, (pct) => updatePaper(paper.id, { progress: pct }));
        updatePaper(paper.id, { isEmbedded: true, isProcessing: false, progress: 100 });
      } catch (err) {
        console.error("Re-index failed for", paper.filename, err);
        updatePaper(paper.id, { isProcessing: false });
      }
    }
    setReindexing(false);
  };

  const ingestFile = async (path: string) => {
    if (processingRef.current.has(path)) return;
    processingRef.current.add(path);

    const id = crypto.randomUUID();
    try {
      const { filename, data } = await loadPdf(path);

      addPaper({
        id,
        filename,
        filePath: path,
        pageCount: 0,
        pages: [],
        isProcessing: true,
        isEmbedded: false,
        progress: 10,
        notes: "",
        quotes: [],
      });

      const pages = await extractText(data);

      const paperObj = {
        id,
        filename: filename,
        filePath: path,
        pageCount: pages.length,
        pages,
        isProcessing: false,
        isEmbedded: false,
        progress: 50,
        notes: "",
        quotes: [],
      };
      updatePaper(id, { pageCount: pages.length, pages, progress: 50 });

      if (apiKey.trim()) {
        updatePaper(id, { isProcessing: true, progress: 50 });
        try {
          await ingestPaper(
            { ...paperObj, isProcessing: true },
            apiKey,
            (pct) => updatePaper(id, { progress: 50 + Math.round(pct * 0.5) }),
          );
          updatePaper(id, { isEmbedded: true, isProcessing: false, progress: 100 });
        } catch (embedErr) {
          console.error("Embedding failed:", embedErr);
          updatePaper(id, { isProcessing: false, progress: 100 });
        }
      } else {
        updatePaper(id, { isProcessing: false, progress: 100 });
      }
    } catch (err) {
      console.error("Failed to ingest PDF:", err);
      updatePaper(id, { isProcessing: false, progress: 0 });
    } finally {
      processingRef.current.delete(path);
    }
  };

  useEffect(() => {
    const webview = getCurrentWebview();
    const unlisten = webview.onDragDropEvent(async (event) => {
      if (event.payload.type === "enter") {
        setIsDragOver(true);
      } else if (event.payload.type === "leave") {
        setIsDragOver(false);
      } else if (event.payload.type === "drop") {
        setIsDragOver(false);
        const pdfPaths = event.payload.paths.filter((p) =>
          p.toLowerCase().endsWith(".pdf"),
        );
        for (const path of pdfPaths) {
          await ingestFile(path);
        }
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleClickUpload = async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    for (const path of paths) {
      await ingestFile(path);
    }
  };

  const handleCreateProject = () => {
    const name = newProjectName.trim();
    if (!name) return;
    addProject(name);
    setNewProjectName("");
    setShowNewProject(false);
  };

  if (!sidebarOpen) return null;

  return (
    <aside className="w-72 min-w-72 h-full bg-bg-secondary border-r border-border flex flex-col">
      {/* Upload Zone */}
      <div className="p-3 border-b border-border">
        <div
          onClick={handleClickUpload}
          className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${isDragOver ? "drag-over" : "border-border hover:border-gold/50"}`}
        >
          <div className="text-xl mb-1 text-text-muted">+</div>
          <p className="font-ui text-xs text-text-muted">
            Drop PDFs here or click to upload
          </p>
        </div>
      </div>

      {/* Sidebar Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => { setSidebarTab("library"); setActiveView("home"); setActiveProjectId(null); }}
          className={`flex-1 font-ui text-xs py-2.5 transition-colors ${
            sidebarTab === "library"
              ? "text-text-primary border-b-2 border-gold"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          Library
        </button>
        <button
          onClick={() => setSidebarTab("projects")}
          className={`flex-1 font-ui text-xs py-2.5 transition-colors ${
            sidebarTab === "projects"
              ? "text-text-primary border-b-2 border-gold"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          Projects
        </button>
      </div>

      {sidebarTab === "library" ? (
        <>
          {/* Search + Controls */}
          {papers.length > 0 && (
            <div className="border-b border-border">
              <div className="px-3 pt-2 pb-1.5">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search papers..."
                  className="w-full bg-bg-tertiary border border-border rounded px-2.5 py-1.5 font-ui text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50"
                />
              </div>
              <div className="px-3 py-1.5 flex items-center justify-between">
                <div className="flex gap-2">
                  <button
                    onClick={selectAllPapers}
                    className="font-ui text-[10px] text-text-muted hover:text-text-primary transition-colors"
                  >
                    Select All
                  </button>
                  <span className="text-text-muted text-[10px]">&middot;</span>
                  <button
                    onClick={deselectAllPapers}
                    className="font-ui text-[10px] text-text-muted hover:text-text-primary transition-colors"
                  >
                    Deselect All
                  </button>
                </div>
                <div className="flex gap-1.5">
                  {unindexedPapers.length > 0 && (
                    <button
                      onClick={handleReindexAll}
                      disabled={reindexing || !apiKey.trim()}
                      className="font-ui text-[10px] px-2 py-0.5 rounded bg-bg-tertiary border border-border text-text-muted hover:text-text-primary hover:border-gold/40 transition-colors disabled:opacity-40"
                      title={`Index ${unindexedPapers.length} unindexed paper(s)`}
                    >
                      {reindexing ? "Indexing..." : `Index (${unindexedPapers.length})`}
                    </button>
                  )}
                  <button
                    onClick={handleGenerateAllMeta}
                    disabled={metaGenerating.size > 0 || !apiKey.trim()}
                    className="font-ui text-[10px] px-2 py-0.5 rounded bg-bg-tertiary border border-border text-text-muted hover:text-text-primary hover:border-gold/40 transition-colors disabled:opacity-40"
                    title="Generate AI metadata & summaries for all papers"
                  >
                    {metaGenerating.size > 0 ? `Generating (${metaGenerating.size})...` : "Metadata"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Paper List */}
          <div className="flex-1 overflow-y-auto p-2">
            {papers.length === 0 ? (
              <p className="font-ui text-sm text-text-muted text-center mt-8 px-4">
                Your library is empty. Drop some PDF papers to get started.
              </p>
            ) : filteredPapers.length === 0 ? (
              <p className="font-ui text-sm text-text-muted text-center mt-8 px-4">
                No papers match "{searchQuery}"
              </p>
            ) : (
              filteredPapers.map((paper) => {
                const meta = getMeta(paper.id);
                const isGenMeta = metaGenerating.has(paper.id);
                return (
                  <div
                    key={paper.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("paper-id", paper.id);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className="flex items-start gap-3 p-3 rounded-lg hover:bg-bg-hover transition-colors cursor-pointer"
                    onClick={() => setDetailPaperId(paper.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setViewingPaperId(paper.id);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPaperIds.includes(paper.id)}
                      onChange={() => togglePaperSelection(paper.id)}
                      className="mt-1 accent-gold"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text-primary truncate">
                        {meta?.title && meta.title !== "Unknown" ? meta.title : paper.filename}
                      </p>
                      {meta && meta.authors !== "Unknown" && (
                        <p className="font-ui text-[11px] text-text-secondary truncate mt-0.5">
                          {meta.authors}{meta.year !== "Unknown" ? ` (${meta.year})` : ""}
                        </p>
                      )}
                      <p className="font-ui text-xs text-text-muted mt-0.5">
                        {paper.pageCount} pages
                        {paper.isEmbedded && " \u00B7 Indexed"}
                        {isGenMeta && " \u00B7 Getting metadata..."}
                        {paper.isProcessing && " \u00B7 Processing..."}
                      </p>
                      {meta?.keywords && meta.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {meta.keywords.slice(0, 3).map((kw) => (
                            <span key={kw} className="font-ui text-[9px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted">
                              {kw}
                            </span>
                          ))}
                        </div>
                      )}
                      {paper.isProcessing && (
                        <div className="mt-1.5 h-1 bg-bg-tertiary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gold rounded-full transition-all duration-300"
                            style={{ width: `${paper.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeVectorsForPaper(paper.id);
                        removePaper(paper.id);
                        saveVectorStore();
                      }}
                      className="shrink-0 mt-1 text-text-muted hover:text-danger transition-colors text-xs"
                      title="Remove paper"
                    >
                      &times;
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-border">
            <p className="font-ui text-xs text-text-muted">
              {papers.length} paper{papers.length !== 1 ? "s" : ""} &middot; {totalPages} pages
            </p>
          </div>
        </>
      ) : (
        <>
          {/* Projects List */}
          <div className="flex-1 overflow-y-auto p-2">
            {projects.length === 0 && !showNewProject && (
              <p className="font-ui text-sm text-text-muted text-center mt-8 px-4">
                No projects yet. Create one to organize your papers.
              </p>
            )}

            {projects.map((project) => {
              const isActive = activeProjectId === project.id;
              const isDrop = dropTargetProject === project.id;
              return (
                <div
                  key={project.id}
                  onClick={() => setActiveProjectId(isActive ? null : project.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    setDropTargetProject(project.id);
                  }}
                  onDragLeave={() => setDropTargetProject(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDropTargetProject(null);
                    const paperId = e.dataTransfer.getData("paper-id");
                    if (paperId) {
                      addPaperToProject(project.id, paperId);
                    }
                  }}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-colors cursor-pointer mb-1 ${
                    isDrop
                      ? "bg-gold/10 border border-gold/40"
                      : isActive
                        ? "bg-bg-hover border border-border"
                        : "hover:bg-bg-hover border border-transparent"
                  }`}
                >
                  <span className="text-lg">{"\u{1F4C1}"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text-primary truncate">{project.name}</p>
                    <p className="font-ui text-xs text-text-muted">
                      {project.paperIds.length} paper{project.paperIds.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeProject(project.id);
                    }}
                    className="shrink-0 text-text-muted hover:text-danger transition-colors text-xs"
                    title="Delete project"
                  >
                    &times;
                  </button>
                </div>
              );
            })}

            {/* New Project Form */}
            {showNewProject ? (
              <div className="p-3 mt-1">
                <input
                  autoFocus
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateProject();
                    if (e.key === "Escape") { setShowNewProject(false); setNewProjectName(""); }
                  }}
                  placeholder="Project name..."
                  className="w-full bg-bg-tertiary border border-border rounded px-3 py-2 font-ui text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleCreateProject}
                    className="font-ui text-xs px-3 py-1.5 rounded bg-gold text-bg font-medium hover:bg-gold-dim transition-colors"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => { setShowNewProject(false); setNewProjectName(""); }}
                    className="font-ui text-xs px-3 py-1.5 rounded bg-bg-tertiary text-text-muted hover:text-text-primary transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowNewProject(true)}
                className="w-full mt-2 p-3 rounded-lg border border-dashed border-border text-center font-ui text-xs text-text-muted hover:text-text-primary hover:border-gold/40 transition-colors"
              >
                + New Project
              </button>
            )}
          </div>

          {/* Project footer hint */}
          <div className="px-4 py-3 border-t border-border">
            <p className="font-ui text-[10px] text-text-muted">
              Drag papers from Library or Home onto a project folder
            </p>
          </div>
        </>
      )}
    </aside>
  );
}
