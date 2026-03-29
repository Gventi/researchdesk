import { useEffect } from "react";
import { useStore } from "./lib/store";
import Sidebar from "./components/Sidebar";
import Desk from "./components/Desk";
import Home from "./components/Home";
import PdfSplitView from "./components/PdfSplitView";
import PaperDetail from "./components/PaperDetail";
import SynthesisMatrix from "./components/SynthesisMatrix";
import ProjectDashboard from "./components/ProjectDashboard";
import SettingsModal from "./components/SettingsModal";

export default function App() {
  const { activeModel, setActiveModel, toggleSidebar, setSettingsOpen, viewingPaperId, detailPaperId, activeView, setActiveView } = useStore();

  useEffect(() => {
    document.documentElement.setAttribute("data-mode", activeModel);
  }, [activeModel]);

  const showHome = activeView === "home";
  const showProject = activeView === "project";
  const showChat = activeView === "chat";
  const showSynthesis = activeView === "synthesis";

  return (
    <>
      {/* Header */}
      <header className="h-12 min-h-12 bg-bg-secondary border-b border-border flex items-center justify-between px-4">
        {/* Left — Wordmark + Nav */}
        <div className="flex items-center gap-4">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setActiveView("home")}
          >
            <span className="text-lg">&#128214;</span>
            <span className="font-semibold text-text-primary text-sm tracking-wide">
              Research Desk
            </span>
          </div>
          <div className="flex items-center gap-1 font-ui text-xs">
            <button
              onClick={() => setActiveView("home")}
              className={`px-2.5 py-1 rounded transition-colors ${
                showHome || showProject ? "text-text-primary" : "text-text-muted hover:text-text-secondary"
              }`}
            >
              Home
            </button>
            <button
              onClick={() => setActiveView("chat")}
              className={`px-2.5 py-1 rounded transition-colors ${
                showChat ? "text-text-primary" : "text-text-muted hover:text-text-secondary"
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setActiveView("synthesis")}
              className={`px-2.5 py-1 rounded transition-colors ${
                showSynthesis ? "text-text-primary" : "text-text-muted hover:text-text-secondary"
              }`}
            >
              Synthesis
            </button>
          </div>
        </div>

        {/* Center — Model Toggle */}
        <div className="flex items-center bg-bg-tertiary rounded-full p-0.5 font-ui text-xs">
          <button
            onClick={() => setActiveModel("quick")}
            className={`px-3 py-1 rounded-full transition-colors ${
              activeModel === "quick"
                ? "bg-gold text-bg font-medium"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            Quick Desk
          </button>
          <button
            onClick={() => setActiveModel("deep")}
            className={`px-3 py-1 rounded-full transition-colors ${
              activeModel === "deep"
                ? "bg-steel text-bg font-medium"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            Deep Research
          </button>
        </div>

        {/* Right — Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSidebar}
            className="text-text-muted hover:text-text-primary transition-colors p-1"
            title="Toggle sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-text-muted hover:text-text-primary transition-colors p-1"
            title="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        {viewingPaperId ? (
          <PdfSplitView />
        ) : showProject ? (
          <ProjectDashboard />
        ) : showHome ? (
          <Home />
        ) : showSynthesis ? (
          <SynthesisMatrix />
        ) : (
          <Desk />
        )}
        {detailPaperId && !viewingPaperId && <PaperDetail />}
      </div>

      {/* Modal */}
      <SettingsModal />
    </>
  );
}
