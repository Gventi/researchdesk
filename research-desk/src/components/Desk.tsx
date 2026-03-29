import { useState } from "react";
import { useStore } from "../lib/store";
import ContextBar from "./ContextBar";
import MessageList from "./MessageList";
import InputBar from "./InputBar";

export default function Desk() {
  const { conversations, activeConversationId, switchConversation, addConversation, removeConversation, renameConversation } = useStore();
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleCreate = () => {
    const name = newName.trim() || "New Chat";
    addConversation(name);
    setNewName("");
    setShowNew(false);
  };

  const handleRename = (id: string) => {
    if (editName.trim()) {
      renameConversation(id, editName.trim());
    }
    setEditingId(null);
  };

  return (
    <main className="flex-1 flex flex-col min-w-0 h-full">
      {/* Conversation tabs */}
      <div className="min-h-9 flex items-center gap-1 px-3 border-b border-border bg-bg-secondary overflow-x-auto">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-t font-ui text-[11px] cursor-pointer transition-colors shrink-0 group ${
              conv.id === activeConversationId
                ? "text-text-primary bg-bg border-b-2 border-accent"
                : "text-text-muted hover:text-text-secondary"
            }`}
            onClick={() => switchConversation(conv.id)}
            onDoubleClick={() => {
              setEditingId(conv.id);
              setEditName(conv.name);
            }}
          >
            {editingId === conv.id ? (
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename(conv.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                onBlur={() => handleRename(conv.id)}
                className="bg-transparent border-none outline-none text-text-primary w-24 font-ui text-[11px]"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="truncate max-w-[100px]">{conv.name}</span>
            )}
            {conversations.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeConversation(conv.id);
                }}
                className="text-text-muted hover:text-danger transition-colors opacity-0 group-hover:opacity-100 text-[10px] ml-0.5"
              >
                &times;
              </button>
            )}
          </div>
        ))}

        {showNew ? (
          <div className="flex items-center gap-1 shrink-0">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") { setShowNew(false); setNewName(""); }
              }}
              placeholder="Chat name..."
              className="bg-bg-tertiary border border-border rounded px-2 py-0.5 font-ui text-[11px] text-text-primary placeholder:text-text-muted w-24 outline-none focus:border-gold/50"
            />
          </div>
        ) : (
          <button
            onClick={() => setShowNew(true)}
            className="font-ui text-[11px] text-text-muted hover:text-text-primary px-2 py-1 shrink-0 transition-colors"
            title="New conversation"
          >
            +
          </button>
        )}
      </div>

      <ContextBar />
      <MessageList />
      <InputBar />
    </main>
  );
}
