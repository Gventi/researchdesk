import { useEffect, useRef, useMemo, useState } from "react";
import { marked } from "marked";
import { useStore } from "../lib/store";

// Configure marked for clean output
marked.setOptions({
  breaks: true,
  gfm: true,
});

function MarkdownContent({ content }: { content: string }) {
  const html = useMemo(() => marked.parse(content) as string, [content]);
  return (
    <div
      className="prose-response"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const SUGGESTIONS = [
  "Summarize the key findings of the selected papers",
  "What are the main themes across these papers?",
  "Generate APA references for the selected papers",
  "Identify research gaps in the literature",
];

export default function MessageList() {
  const { messages, setPendingQuery, clearMessages } = useStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyConversation = async () => {
    const text = messages
      .map((m) => {
        const label = m.role === "user" ? "You" : `Research Desk (${m.model === "quick" ? "Quick" : "Deep"})`;
        return `${label}:\n${m.content}`;
      })
      .join("\n\n---\n\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="text-4xl mb-4">&#128218;</div>
        <h2 className="text-xl text-text-primary mb-2">Welcome to Research Desk</h2>
        <p className="text-text-secondary text-sm text-center mb-8 max-w-md">
          Upload papers to your library, select the ones you want to explore,
          and ask questions across your research.
        </p>
        <div className="grid grid-cols-2 gap-3 max-w-lg w-full">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => setPendingQuery(suggestion)}
              className="text-left p-3 bg-bg-secondary border border-border rounded-lg font-ui text-sm text-text-secondary hover:text-text-primary hover:border-gold/40 transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
      {/* Conversation actions */}
      {messages.length > 0 && (
        <div className="flex justify-end gap-2 px-2">
          <button
            onClick={handleCopyConversation}
            className="font-ui text-[10px] px-2.5 py-1 rounded bg-bg-tertiary border border-border text-text-muted hover:text-text-primary hover:border-gold/40 transition-colors"
          >
            {copied ? "Copied!" : "Copy Conversation"}
          </button>
          <button
            onClick={clearMessages}
            className="font-ui text-[10px] px-2.5 py-1 rounded bg-bg-tertiary border border-border text-text-muted hover:text-danger transition-colors"
          >
            Clear Chat
          </button>
        </div>
      )}
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex animate-message-in ${msg.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[75%] rounded-xl px-5 py-4 ${
              msg.role === "user"
                ? "bg-bg-tertiary text-text-primary"
                : "bg-bg-secondary border border-border text-text-primary"
            }`}
          >
            {msg.role === "assistant" && msg.model && (
              <span
                className={`inline-block font-ui text-[10px] font-medium px-1.5 py-0.5 rounded mb-3 ${
                  msg.model === "quick"
                    ? "bg-gold/15 text-gold"
                    : "bg-steel/15 text-steel"
                }`}
              >
                {msg.model === "quick" ? "Quick Desk" : "Deep Research"}
              </span>
            )}
            {msg.role === "assistant" ? (
              <MarkdownContent content={msg.content} />
            ) : (
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {msg.content}
              </div>
            )}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
