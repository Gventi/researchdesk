import { useState, useRef, useEffect } from "react";
import { useStore } from "../lib/store";
import { sendMessage, resolveSlashCommand, SPECIAL_PROMPTS } from "../lib/gemini";
import { queryRAG, formatContextChunks } from "../lib/rag";

const COMMAND_CHIPS = Object.keys(SPECIAL_PROMPTS) as Array<keyof typeof SPECIAL_PROMPTS>;

export default function InputBar() {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { activeModel, isGenerating, apiKey, selectedPaperIds, papers, addMessage, updateMessage, setIsGenerating, pendingQuery, setPendingQuery, activeProjectId, projects } = useStore();

  // When a project is active, scope chat to only that project's papers
  const activeProject = activeProjectId ? projects.find((p) => p.id === activeProjectId) : null;
  const effectiveSelectedIds = activeProject ? activeProject.paperIds : selectedPaperIds;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  useEffect(() => {
    if (pendingQuery) {
      setPendingQuery(null);
      handleSend(pendingQuery);
    }
  }, [pendingQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async (overrideQuery?: string) => {
    const rawQuery = (overrideQuery || input).trim();
    if (!rawQuery || isGenerating) return;

    if (!apiKey.trim()) {
      addMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Please set your Google API key in Settings first.",
        model: activeModel,
        timestamp: Date.now(),
      });
      return;
    }

    const { query, isCommand } = resolveSlashCommand(rawQuery);

    setInput("");
    setIsGenerating(true);

    // Add user message (show original command if slash command)
    addMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: rawQuery,
      timestamp: Date.now(),
    });

    // Create assistant message placeholder
    const assistantId = crypto.randomUUID();
    addMessage({
      id: assistantId,
      role: "assistant",
      content: "",
      model: activeModel,
      timestamp: Date.now(),
    });

    try {
      // Use tools via sendMessage
      let contextChunks = "";
      if (effectiveSelectedIds.length > 0) {
        const searchQuery = isCommand ? query : rawQuery;
        const retrieved = await queryRAG(searchQuery, effectiveSelectedIds, apiKey);
        contextChunks = formatContextChunks(retrieved);
      }

      await sendMessage(
        query,
        contextChunks,
        activeModel,
        apiKey,
        effectiveSelectedIds,
        papers,
        (token) => {
          updateMessage(assistantId, token);
        },
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "An error occurred";
      updateMessage(assistantId, `Error: ${errorMsg}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const buttonColor = "bg-accent hover:bg-accent-dim";

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="flex items-end gap-3 bg-bg-secondary border border-border rounded-xl px-4 py-3">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your research papers..."
          rows={1}
          disabled={isGenerating}
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none"
        />
        <button
          onClick={() => handleSend()}
          disabled={!input.trim() || isGenerating}
          className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-bg font-ui text-sm font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${buttonColor}`}
        >
          &#8593;
        </button>
      </div>
      {/* Slash command chips */}
      <div className="flex items-center justify-center gap-2 mt-2">
        {COMMAND_CHIPS.map((cmd) => (
          <button
            key={cmd}
            onClick={() => handleSend(cmd)}
            disabled={isGenerating}
            className="font-ui text-[11px] px-2.5 py-1 rounded-full bg-bg-secondary border border-border text-text-muted hover:text-text-primary hover:border-gold/40 transition-colors disabled:opacity-30"
          >
            {cmd}
          </button>
        ))}
      </div>
      <p className="font-ui text-[10px] text-text-muted text-center mt-1.5">
        Shift+Enter for new line &middot; Enter to send
      </p>
    </div>
  );
}
