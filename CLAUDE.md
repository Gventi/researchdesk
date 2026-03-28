# Research Desk — Claude Code Build Prompt

## Project Overview

Build a desktop app called **Research Desk** — a local AI Librarian for academic research. The user drops in PDF papers and asks questions across their entire library. It is powered by Google's Gemini API (no local models, no backend server required).

---

## Stack

- **Framework:** Tauri 2.0 + React + TypeScript
- **Styling:** Tailwind CSS
- **PDF parsing:** `pdf-parse` (Node.js side-car via Tauri command) or `pdfjs-dist` on the frontend
- **Vector search:** `vectra` (pure JS, no native deps) for local in-memory semantic search
- **Embeddings:** Google `text-embedding-004` model via Gemini API
- **AI chat:** Google Gemini API (REST) — no SDK needed, plain fetch
- **Storage:** Tauri's local filesystem + `localStorage` for API key and settings

---

## Target Platforms

Configure `tauri.conf.json` bundles for:

| Platform | Target |
|---|---|
| Windows ARM (Surface Pro 11) | `aarch64-pc-windows-msvc` → `.msi` |
| Windows x64 (Mini PC) | `x86_64-pc-windows-msvc` → `.msi` |
| macOS Universal | `universal-apple-darwin` → `.dmg` |
| Linux / Pop!_OS | `x86_64-unknown-linux-gnu` → `.AppImage` |

---

## AI Models

Both use the **same Google API key**. The user selects the mode in the UI.

| Mode | Model ID | Use Case |
|---|---|---|
| **Quick Desk** (default) | `gemini-3.1-flash-lite-preview` | Fast Q&A on single papers, summaries, APA citations |
| **Deep Research** | `gemma-3-27b-it` | Cross-paper synthesis, thematic coding, complex reasoning |

All API calls go to:
```
https://generativelanguage.googleapis.com/v1beta/models/{MODEL_ID}:generateContent?key={API_KEY}
```

Embeddings for RAG use `text-embedding-004`:
```
https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={API_KEY}
```

---

## UI Layout

### Header Bar
- Left: wordmark "Research Desk" with a book icon
- Center: model toggle pill — `[ Quick Desk | Deep Research ]`
- Right: sidebar toggle button + settings gear button

### Left Sidebar — Library
- Drag-and-drop / click-to-upload zone for PDF files
- List of uploaded papers — each showing title (parsed from PDF metadata or filename), page count, and a checkbox for selection
- "Select All" / "Deselect All" controls
- Footer showing total papers and total pages loaded

### Main Area — The Desk
- **Context bar** at top: shows which papers are currently selected for context (shown as chips)
- **Message thread**: chat history with user and assistant messages
  - Each assistant message shows which model was used as a small badge
  - Welcome screen when no messages yet, showing 3–4 starter prompt suggestions
- **Input area** at bottom:
  - Multiline textarea (auto-grows, max 5 lines)
  - Send button (changes color based on active model)
  - Hint text: `Shift+Enter for new line · Enter to send`

### Settings Modal
- Google API key input (password field, stored in `localStorage`)
- Link to get a free key at aistudio.google.com
- Default model selector
- API connection test button — sends a minimal test request and shows ✓ Connected or ✗ Error
- Clear library button

---

## Core Features

### 1. PDF Ingestion
- User drops or selects PDF files
- Extract full text using `pdfjs-dist` in the renderer, or a Tauri Rust command using `pdf-extract`
- Chunk text into ~500 token segments with 50 token overlap
- Embed each chunk using `text-embedding-004`
- Store chunks + embeddings in a `vectra` local index (persisted to app data dir via Tauri's filesystem API)
- Show a progress bar per file during ingestion

### 2. RAG Query Pipeline
When the user sends a message:
1. Embed the user's query using `text-embedding-004`
2. Search the `vectra` index for the top 8 most relevant chunks — filtered to only the **selected papers** in the sidebar
3. Build a context block from the retrieved chunks, each labeled with `[Paper: filename, Page: N]`
4. Send to the active Gemini model with the system prompt below

### 3. System Prompt (inject for every request)

```
You are Research Desk, an academic librarian AI assisting a graduate student in counselling psychology and addiction studies.

You have access to the following excerpts from the user's uploaded research papers:

{CONTEXT_CHUNKS}

Rules:
- Ground every claim in the provided excerpts. If the answer isn't in the excerpts, say so clearly.
- Always cite your sources inline as [Paper: filename, p. N].
- When synthesizing across multiple papers, explicitly compare and contrast perspectives.
- For APA formatting requests, produce a complete APA 7th edition reference.
- Be precise and academic in tone, but clear and readable.
- If the user asks to find themes across papers, structure your response with labeled thematic headings.
```

### 4. Special Modes (trigger via UI buttons or slash commands)

| Trigger | Behaviour |
|---|---|
| `/summarize` | Summarize the selected paper(s) in 200 words each |
| `/themes` | Identify and compare 3–5 recurring themes across all selected papers |
| `/apa` | Generate full APA 7th edition references for all selected papers |
| `/gaps` | Identify research gaps across the selected papers |

Show these as clickable suggestion chips in the welcome screen and below the input area.

---

## GitHub Actions CI/CD

Create `.github/workflows/release.yml` that triggers on `git push --tags` (e.g. `v1.0.0`).

The workflow should:
1. Build for all 4 targets using matrix strategy
2. Use `tauri-action` for each platform
3. Upload artifacts to GitHub Releases automatically

```yaml
# Targets matrix:
# - windows-latest  → aarch64-pc-windows-msvc + x86_64-pc-windows-msvc
# - macos-latest    → universal-apple-darwin
# - ubuntu-22.04    → x86_64-unknown-linux-gnu
```

Outputs per release:
- `Research.Desk_x.x.x_arm64.msi` (Surface)
- `Research.Desk_x.x.x_x64.msi` (Mini PC)
- `Research.Desk_x.x.x_universal.dmg` (Mac)
- `Research.Desk_x.x.x_amd64.AppImage` (Linux)

---

## File Structure

```
research-desk/
├── src/                        # React frontend
│   ├── App.tsx
│   ├── components/
│   │   ├── Sidebar.tsx         # Library panel
│   │   ├── Desk.tsx            # Chat area
│   │   ├── MessageList.tsx
│   │   ├── InputBar.tsx
│   │   ├── ContextBar.tsx
│   │   └── SettingsModal.tsx
│   ├── lib/
│   │   ├── gemini.ts           # API calls (chat + embeddings)
│   │   ├── rag.ts              # Vectra index, chunk, search
│   │   ├── pdf.ts              # PDF text extraction
│   │   └── store.ts            # App state (Zustand or React context)
│   └── main.tsx
├── src-tauri/
│   ├── src/main.rs             # Tauri commands (file I/O, PDF parsing fallback)
│   └── tauri.conf.json
├── .github/
│   └── workflows/
│       └── release.yml
├── package.json
└── README.md
```

---

## Design Direction

- **Dark theme only** — deep charcoal background (`#0d0d0f`), warm off-white text
- **Serif typography** — Georgia or similar for body text to feel like a reading/research environment
- **Gold accent** (`#c8b87a`) for Quick Desk mode, **steel blue** (`#7aaccb`) for Deep Research mode
- Minimal, calm UI — no loud gradients, no clutter. It should feel like a library, not a dashboard
- Smooth transitions on model switching, paper selection, and message appearance

---

## Start Here

1. Scaffold the Tauri + React + TypeScript + Tailwind project
2. Build the Settings modal with API key input and connection test first — nothing works without the key
3. Build PDF upload and text extraction
4. Implement the RAG pipeline (embed → store → retrieve)
5. Wire up the Gemini chat with retrieved context
6. Polish the UI and add the special mode commands
7. Add the GitHub Actions release workflow last
