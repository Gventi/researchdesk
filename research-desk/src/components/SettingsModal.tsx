import { useState } from "react";
import { useStore } from "../lib/store";
import { testConnection } from "../lib/gemini";

export default function SettingsModal() {
  const { settingsOpen, setSettingsOpen, apiKey, setApiKey, activeModel, setActiveModel, clearLibrary } = useStore();
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");

  if (!settingsOpen) return null;

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      setTestStatus("error");
      return;
    }
    setTestStatus("testing");
    const ok = await testConnection(apiKey);
    setTestStatus(ok ? "success" : "error");
  };

  const handleClearLibrary = () => {
    if (confirm("Clear all papers from your library? This cannot be undone.")) {
      clearLibrary();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-bg-secondary border border-border rounded-lg w-[480px] max-h-[80vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-ui font-semibold text-text-primary">Settings</h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="text-text-muted hover:text-text-primary transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* API Key */}
        <div className="mb-6">
          <label className="block font-ui text-sm text-text-secondary mb-2">
            Google API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your Gemini API key"
            className="w-full bg-bg-tertiary border border-border rounded px-3 py-2 font-ui text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold"
          />
          <p className="mt-2 font-ui text-xs text-text-muted">
            Get a free key at{" "}
            <span className="text-gold">aistudio.google.com</span>
          </p>
        </div>

        {/* Default Model */}
        <div className="mb-6">
          <label className="block font-ui text-sm text-text-secondary mb-2">
            Default Model
          </label>
          <select
            value={activeModel}
            onChange={(e) => setActiveModel(e.target.value as "quick" | "deep")}
            className="w-full bg-bg-tertiary border border-border rounded px-3 py-2 font-ui text-sm text-text-primary focus:outline-none focus:border-gold"
          >
            <option value="quick">Quick Desk — Fast Q&A</option>
            <option value="deep">Deep Research — Cross-paper synthesis</option>
          </select>
        </div>

        {/* Test Connection */}
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={handleTestConnection}
            disabled={testStatus === "testing"}
            className="font-ui text-sm px-4 py-2 rounded bg-bg-tertiary border border-border text-text-secondary hover:text-text-primary hover:border-gold transition-colors disabled:opacity-50"
          >
            {testStatus === "testing" ? "Testing..." : "Test Connection"}
          </button>
          {testStatus === "success" && (
            <span className="font-ui text-sm text-green-400">&#10003; Connected</span>
          )}
          {testStatus === "error" && (
            <span className="font-ui text-sm text-danger">&#10007; Error</span>
          )}
        </div>

        {/* Clear Library */}
        <div className="pt-4 border-t border-border">
          <button
            onClick={handleClearLibrary}
            className="font-ui text-sm px-4 py-2 rounded bg-bg-tertiary border border-danger/30 text-danger hover:border-danger transition-colors"
          >
            Clear Library
          </button>
        </div>
      </div>
    </div>
  );
}
