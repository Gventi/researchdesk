import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";

export type ModelMode = "quick" | "deep";

export interface PaperPage {
  pageNum: number;
  text: string;
}

export interface PaperAnalysis {
  summary: string;
  keyFindings: string;
  methodology: string;
  dataExtraction: string;
  synthesisNotes: string;
  limitations: string;
  annotatedBibliography?: string;
  generatedAt: number;
}

export interface PaperMeta {
  title: string;
  authors: string;
  year: string;
  journal: string;
  abstract: string;
  keywords: string[];
  generatedAt: number;
}

export interface SavedQuote {
  id: string;
  text: string;
  pageNum: number | null;
  createdAt: number;
}

export interface Paper {
  id: string;
  filename: string;
  filePath: string;
  pageCount: number;
  pages: PaperPage[];
  isProcessing: boolean;
  isEmbedded: boolean;
  progress: number;
  notes: string;
  quotes: SavedQuote[];
  analysis?: PaperAnalysis;
  meta?: PaperMeta;
}

export interface Project {
  id: string;
  name: string;
  paperIds: string[];
  createdAt: number;
}

export type View = "home" | "chat" | "project" | "synthesis";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: ModelMode;
  timestamp: number;
}

export interface Conversation {
  id: string;
  name: string;
  createdAt: number;
}

interface AppState {
  // Settings
  apiKey: string;
  activeModel: ModelMode;
  settingsOpen: boolean;

  // Library
  papers: Paper[];
  selectedPaperIds: string[];

  // Chat
  messages: Message[];
  isGenerating: boolean;
  pendingQuery: string | null;
  conversations: Conversation[];
  activeConversationId: string;

  // Sidebar
  sidebarOpen: boolean;

  // Viewer
  viewingPaperId: string | null;
  detailPaperId: string | null;

  // Navigation
  activeView: View;
  activeProjectId: string | null;

  // Projects
  projects: Project[];

  // Actions — Settings
  setApiKey: (key: string) => void;
  setActiveModel: (model: ModelMode) => void;
  setSettingsOpen: (open: boolean) => void;

  // Actions — Library
  addPaper: (paper: Paper) => void;
  removePaper: (id: string) => void;
  updatePaper: (id: string, updates: Partial<Paper>) => void;
  togglePaperSelection: (id: string) => void;
  selectAllPapers: () => void;
  deselectAllPapers: () => void;
  clearLibrary: () => void;

  // Actions — Chat
  addMessage: (message: Message) => void;
  updateMessage: (id: string, content: string) => void;
  setIsGenerating: (generating: boolean) => void;
  clearMessages: () => void;
  setPendingQuery: (query: string | null) => void;
  addConversation: (name: string) => void;
  removeConversation: (id: string) => void;
  renameConversation: (id: string, name: string) => void;
  switchConversation: (id: string) => void;

  // Actions — Sidebar
  toggleSidebar: () => void;

  // Actions — Viewer
  setViewingPaperId: (id: string | null) => void;
  setDetailPaperId: (id: string | null) => void;

  // Actions — Navigation
  setActiveView: (view: View) => void;
  setActiveProjectId: (id: string | null) => void;

  // Actions — Projects
  addProject: (name: string) => void;
  removeProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  addPaperToProject: (projectId: string, paperId: string) => void;
  removePaperFromProject: (projectId: string, paperId: string) => void;
}

export const useStore = create<AppState>()(
  subscribeWithSelector(
  persist(
    (set) => ({
      // Initial state
      apiKey: "",
      activeModel: "quick",
      settingsOpen: false,
      papers: [],
      selectedPaperIds: [],
      messages: [],
      isGenerating: false,
      pendingQuery: null,
      conversations: [{ id: "default", name: "General", createdAt: Date.now() }],
      activeConversationId: "default",
      sidebarOpen: true,
      viewingPaperId: null,
      detailPaperId: null,
      activeView: "home",
      activeProjectId: null,
      projects: [],

      // Settings
      setApiKey: (key) => set({ apiKey: key }),
      setActiveModel: (model) => set({ activeModel: model }),
      setSettingsOpen: (open) => set({ settingsOpen: open }),

      // Library
      addPaper: (paper) =>
        set((s) => ({
          papers: [...s.papers, paper],
          selectedPaperIds: [...s.selectedPaperIds, paper.id],
        })),
      removePaper: (id) =>
        set((s) => ({
          papers: s.papers.filter((p) => p.id !== id),
          selectedPaperIds: s.selectedPaperIds.filter((pid) => pid !== id),
        })),
      updatePaper: (id, updates) =>
        set((s) => ({
          papers: s.papers.map((p) =>
            p.id === id ? { ...p, ...updates } : p,
          ),
        })),
      togglePaperSelection: (id) =>
        set((s) => ({
          selectedPaperIds: s.selectedPaperIds.includes(id)
            ? s.selectedPaperIds.filter((pid) => pid !== id)
            : [...s.selectedPaperIds, id],
        })),
      selectAllPapers: () =>
        set((s) => ({
          selectedPaperIds: s.papers.map((p) => p.id),
        })),
      deselectAllPapers: () => set({ selectedPaperIds: [] }),
      clearLibrary: () => set({ papers: [], selectedPaperIds: [] }),

      // Chat
      addMessage: (message) =>
        set((s) => ({ messages: [...s.messages, message] })),
      updateMessage: (id, content) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, content } : m,
          ),
        })),
      setIsGenerating: (generating) => set({ isGenerating: generating }),
      clearMessages: () => set({ messages: [] }),
      setPendingQuery: (query) => set({ pendingQuery: query }),
      addConversation: (name) => {
        const id = crypto.randomUUID();
        set((s) => ({
          conversations: [...s.conversations, { id, name, createdAt: Date.now() }],
          activeConversationId: id,
          messages: [],
        }));
      },
      removeConversation: (id) =>
        set((s) => {
          const remaining = s.conversations.filter((c) => c.id !== id);
          if (remaining.length === 0) {
            remaining.push({ id: "default", name: "General", createdAt: Date.now() });
          }
          const newActive = s.activeConversationId === id ? remaining[0].id : s.activeConversationId;
          return { conversations: remaining, activeConversationId: newActive, messages: newActive !== s.activeConversationId ? [] : s.messages };
        }),
      renameConversation: (id, name) =>
        set((s) => ({
          conversations: s.conversations.map((c) => (c.id === id ? { ...c, name } : c)),
        })),
      switchConversation: (id) => {
        // Save current messages first (triggered by subscribe), then load new ones
        // Messages for the new conversation will be loaded asynchronously
        set({ activeConversationId: id, messages: [] });
        // Load from cache async
        import("./rag").then(({ getChatHistory }) => {
          const msgs = getChatHistory(id);
          set({ messages: msgs });
        });
      },

      // Sidebar
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      // Viewer
      setViewingPaperId: (id) => set({ viewingPaperId: id }),
      setDetailPaperId: (id) => set({ detailPaperId: id }),

      // Navigation
      setActiveView: (view) => set({ activeView: view, viewingPaperId: null }),
      setActiveProjectId: (id) => set({ activeProjectId: id, activeView: id ? "project" : "home" }),

      // Projects
      addProject: (name) =>
        set((s) => ({
          projects: [
            ...s.projects,
            { id: crypto.randomUUID(), name, paperIds: [], createdAt: Date.now() },
          ],
        })),
      removeProject: (id) =>
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== id),
          activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
          activeView: s.activeProjectId === id ? "home" : s.activeView,
        })),
      renameProject: (id, name) =>
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, name } : p)),
        })),
      addPaperToProject: (projectId, paperId) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId && !p.paperIds.includes(paperId)
              ? { ...p, paperIds: [...p.paperIds, paperId] }
              : p,
          ),
        })),
      removePaperFromProject: (projectId, paperId) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? { ...p, paperIds: p.paperIds.filter((id) => id !== paperId) }
              : p,
          ),
        })),
    }),
    {
      name: "research-desk-storage",
      partialize: (state) => ({
        apiKey: state.apiKey,
        activeModel: state.activeModel,
        sidebarOpen: state.sidebarOpen,
        projects: state.projects,
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
      }),
    },
  ),
  ),
);

// --- Auto-save papers and messages to disk ---

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSavePapers() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    const { savePaperManifest } = await import("./rag");
    const papers = useStore.getState().papers;
    await savePaperManifest(
      papers.map((p) => ({
        id: p.id,
        filename: p.filename,
        filePath: p.filePath,
        pageCount: p.pageCount,
        isEmbedded: p.isEmbedded,
        notes: p.notes || "",
        quotes: p.quotes || [],
      })),
    );
  }, 500);
}

let chatSaveTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSaveChat() {
  if (chatSaveTimeout) clearTimeout(chatSaveTimeout);
  chatSaveTimeout = setTimeout(async () => {
    const { saveChatHistory } = await import("./rag");
    const { messages, activeConversationId } = useStore.getState();
    await saveChatHistory(activeConversationId, messages);
  }, 1000);
}

useStore.subscribe((s) => s.papers, debouncedSavePapers);
useStore.subscribe((s) => s.messages, debouncedSaveChat);
