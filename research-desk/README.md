# Research Desk

A desktop AI Librarian for academic research. Drop in PDF papers and ask questions across your entire library, powered by Google's Gemini API.

## Features

- **PDF Library** — Drag-and-drop PDF papers, auto-extract text and index for search
- **RAG-powered Q&A** — Ask questions grounded in your uploaded papers with inline citations
- **Two AI modes** — Quick Desk (fast Q&A) and Deep Research (cross-paper synthesis)
- **Special commands** — `/summarize`, `/themes`, `/apa`, `/gaps` for common research tasks
- **Local-first** — All data stored locally, only API calls go to Google

## Getting Started

1. Download the latest release for your platform from [Releases](../../releases)
2. Install and launch Research Desk
3. Open Settings and enter your [Google API key](https://aistudio.google.com)
4. Drop PDF papers into the sidebar
5. Select papers and start asking questions

## Development

```bash
npm install
cargo tauri dev
```

## Build

```bash
cargo tauri build
```

## Stack

- Tauri 2.0 + React + TypeScript
- Tailwind CSS
- pdfjs-dist for PDF parsing
- Google Gemini API (text-embedding-004 + gemini-3.1-flash-lite-preview / gemma-3-27b-it)
