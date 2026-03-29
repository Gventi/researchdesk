import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { loadVectorStore, loadAnalyses, loadMetas, loadPaperManifest, loadChatHistory, loadProjectAnalyses, getAnalysis, getMeta, getChatHistory } from "./lib/rag";
import { extractText } from "./lib/pdf";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "./lib/store";
import "./index.css";

async function restoreLibrary() {
  const [manifest] = await Promise.all([
    loadPaperManifest(),
    loadVectorStore(),
    loadAnalyses(),
    loadMetas(),
    loadChatHistory(),
    loadProjectAnalyses(),
  ]);

  // Restore papers from manifest
  const { addPaper, updatePaper } = useStore.getState();
  for (const entry of manifest) {
    // Add paper shell immediately so UI shows it
    addPaper({
      id: entry.id,
      filename: entry.filename,
      filePath: entry.filePath,
      pageCount: entry.pageCount,
      pages: [],
      isProcessing: true,
      isEmbedded: entry.isEmbedded,
      progress: 0,
      notes: entry.notes || "",
      quotes: entry.quotes || [],
      analysis: getAnalysis(entry.id),
      meta: getMeta(entry.id),
    });

    // Re-extract text in background
    try {
      const bytes: number[] = await invoke("read_file_bytes", { path: entry.filePath });
      const data = new Uint8Array(bytes).buffer;
      const pages = await extractText(data);
      updatePaper(entry.id, { pages, pageCount: pages.length, isProcessing: false, progress: 100 });
    } catch (err) {
      console.error(`Failed to re-extract ${entry.filename}:`, err);
      updatePaper(entry.id, { isProcessing: false, progress: 0 });
    }
  }

  // Restore active conversation's chat history
  const { activeConversationId } = useStore.getState();
  const savedMessages = getChatHistory(activeConversationId);
  if (savedMessages.length > 0) {
    useStore.setState({ messages: savedMessages });
  }
}

// Defer Tauri filesystem calls until IPC is ready
window.addEventListener("DOMContentLoaded", () => {
  restoreLibrary().catch(console.error);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
