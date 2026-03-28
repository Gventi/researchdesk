import { mkdir, writeTextFile, readTextFile, exists } from "@tauri-apps/plugin-fs";
import { appDataDir } from "@tauri-apps/api/path";
import { BASE_URL } from "./gemini";
import type { Paper, PaperPage, PaperAnalysis, PaperMeta, SavedQuote } from "./store";

// --- Types ---

export interface Chunk {
  id: string;
  paperId: string;
  filename: string;
  pageNum: number;
  text: string;
}

interface VectorEntry {
  chunk: Chunk;
  vector: number[];
}

// --- Chunking ---

const CHUNK_SIZE = 500; // ~tokens (approx by words)
const CHUNK_OVERLAP = 50;

export function chunkText(pages: PaperPage[], paperId: string, filename: string): Chunk[] {
  const chunks: Chunk[] = [];

  for (const page of pages) {
    const words = page.text.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    for (let i = 0; i < words.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
      const slice = words.slice(i, i + CHUNK_SIZE);
      if (slice.length < 20) continue; // skip tiny tail chunks
      chunks.push({
        id: crypto.randomUUID(),
        paperId,
        filename,
        pageNum: page.pageNum,
        text: slice.join(" "),
      });
    }
  }

  return chunks;
}

// --- Embeddings ---

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_URL = `${BASE_URL}/${EMBED_MODEL}:embedContent`;
const BATCH_SIZE = 5;

async function embedSingle(text: string, apiKey: string, retries = 3): Promise<number[]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${EMBED_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text }] },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.embedding.values;
    }
    if (res.status === 429 && attempt < retries) {
      // Rate limited — wait with exponential backoff
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    const err = await res.text();
    throw new Error(`Embedding failed: ${res.status} ${err}`);
  }
  throw new Error("Embedding failed after retries");
}

async function embedBatch(
  texts: string[],
  apiKey: string,
  onProgress?: (done: number, total: number) => void,
): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((t) => embedSingle(t, apiKey)));
    vectors.push(...results);
    onProgress?.(Math.min(i + BATCH_SIZE, texts.length), texts.length);
    // Small delay between batches to avoid rate limits
    if (i + BATCH_SIZE < texts.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return vectors;
}

// --- Vector Store ---

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

let vectorStore: VectorEntry[] = [];
let storeDir = "";

async function getStoreDir(): Promise<string> {
  if (!storeDir) {
    const appDir = await appDataDir();
    storeDir = `${appDir}/research-desk`;
  }
  return storeDir;
}

export async function loadVectorStore(): Promise<void> {
  try {
    const dir = await getStoreDir();
    const path = `${dir}/vectors.json`;
    if (await exists(path)) {
      const json = await readTextFile(path);
      vectorStore = JSON.parse(json);
    }
  } catch (err) {
    console.error("Failed to load vector store:", err);
    vectorStore = [];
  }
}

export async function saveVectorStore(): Promise<void> {
  try {
    const dir = await getStoreDir();
    await mkdir(dir, { recursive: true });
    await writeTextFile(`${dir}/vectors.json`, JSON.stringify(vectorStore));
  } catch (err) {
    console.error("Failed to save vector store:", err);
  }
}

export function removeVectorsForPaper(paperId: string): void {
  vectorStore = vectorStore.filter((e) => e.chunk.paperId !== paperId);
}

// --- Ingest ---

export async function ingestPaper(
  paper: Paper,
  apiKey: string,
  onProgress?: (progress: number) => void,
): Promise<void> {
  onProgress?.(5);

  const chunks = chunkText(paper.pages, paper.id, paper.filename);
  if (chunks.length === 0) return;

  onProgress?.(15);

  const vectors = await embedBatch(
    chunks.map((c) => c.text),
    apiKey,
    (done, total) => {
      const pct = 15 + Math.round((done / total) * 80);
      onProgress?.(pct);
    },
  );

  for (let i = 0; i < chunks.length; i++) {
    vectorStore.push({ chunk: chunks[i], vector: vectors[i] });
  }

  await saveVectorStore();
  onProgress?.(100);
}

// --- Query ---

export interface RetrievedChunk {
  chunk: Chunk;
  score: number;
}

export async function queryRAG(
  query: string,
  selectedPaperIds: string[],
  apiKey: string,
  topK = 8,
): Promise<RetrievedChunk[]> {
  const queryVec = await embedSingle(query, apiKey);

  const scored = vectorStore
    .filter((e) => selectedPaperIds.includes(e.chunk.paperId))
    .map((e) => ({
      chunk: e.chunk,
      score: cosineSimilarity(queryVec, e.vector),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}

export function formatContextChunks(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (c) =>
        `[Paper: ${c.chunk.filename}, Page: ${c.chunk.pageNum}]\n${c.chunk.text}`,
    )
    .join("\n\n---\n\n");
}

// --- Analysis Persistence ---

let analysisCache: Record<string, PaperAnalysis> = {};

export async function loadAnalyses(): Promise<Record<string, PaperAnalysis>> {
  try {
    const dir = await getStoreDir();
    const path = `${dir}/analyses.json`;
    if (await exists(path)) {
      const json = await readTextFile(path);
      analysisCache = JSON.parse(json);
    }
  } catch (err) {
    console.error("Failed to load analyses:", err);
  }
  return analysisCache;
}

export async function saveAnalysis(paperId: string, analysis: PaperAnalysis): Promise<void> {
  analysisCache[paperId] = analysis;
  try {
    const dir = await getStoreDir();
    await mkdir(dir, { recursive: true });
    await writeTextFile(`${dir}/analyses.json`, JSON.stringify(analysisCache));
  } catch (err) {
    console.error("Failed to save analysis:", err);
  }
}

export function getAnalysis(paperId: string): PaperAnalysis | undefined {
  return analysisCache[paperId];
}

export function deleteAnalysis(paperId: string): void {
  delete analysisCache[paperId];
}

// --- Metadata Persistence ---

let metaCache: Record<string, PaperMeta> = {};

export async function loadMetas(): Promise<Record<string, PaperMeta>> {
  try {
    const dir = await getStoreDir();
    const path = `${dir}/metas.json`;
    if (await exists(path)) {
      const json = await readTextFile(path);
      metaCache = JSON.parse(json);
    }
  } catch (err) {
    console.error("Failed to load metas:", err);
  }
  return metaCache;
}

export async function saveMeta(paperId: string, meta: PaperMeta): Promise<void> {
  metaCache[paperId] = meta;
  try {
    const dir = await getStoreDir();
    await mkdir(dir, { recursive: true });
    await writeTextFile(`${dir}/metas.json`, JSON.stringify(metaCache));
  } catch (err) {
    console.error("Failed to save meta:", err);
  }
}

export function getMeta(paperId: string): PaperMeta | undefined {
  return metaCache[paperId];
}

export function deleteMeta(paperId: string): void {
  delete metaCache[paperId];
}

// --- Paper Manifest Persistence ---
// Stores lightweight paper info (no pages text) so library survives restart

interface PaperManifestEntry {
  id: string;
  filename: string;
  filePath: string;
  pageCount: number;
  isEmbedded: boolean;
  notes: string;
  quotes: SavedQuote[];
}

export async function loadPaperManifest(): Promise<PaperManifestEntry[]> {
  try {
    const dir = await getStoreDir();
    const path = `${dir}/papers.json`;
    if (await exists(path)) {
      const json = await readTextFile(path);
      return JSON.parse(json);
    }
  } catch (err) {
    console.error("Failed to load paper manifest:", err);
  }
  return [];
}

export async function savePaperManifest(papers: PaperManifestEntry[]): Promise<void> {
  try {
    const dir = await getStoreDir();
    await mkdir(dir, { recursive: true });
    await writeTextFile(`${dir}/papers.json`, JSON.stringify(papers));
  } catch (err) {
    console.error("Failed to save paper manifest:", err);
  }
}

// --- Chat History Persistence ---

import type { Message } from "./store";

let chatCache: Record<string, Message[]> = {};

export async function loadChatHistory(): Promise<Record<string, Message[]>> {
  try {
    const dir = await getStoreDir();
    const path = `${dir}/chats.json`;
    if (await exists(path)) {
      const json = await readTextFile(path);
      chatCache = JSON.parse(json);
    }
  } catch (err) {
    console.error("Failed to load chat history:", err);
  }
  return chatCache;
}

export async function saveChatHistory(conversationId: string, messages: Message[]): Promise<void> {
  chatCache[conversationId] = messages;
  try {
    const dir = await getStoreDir();
    await mkdir(dir, { recursive: true });
    await writeTextFile(`${dir}/chats.json`, JSON.stringify(chatCache));
  } catch (err) {
    console.error("Failed to save chat history:", err);
  }
}

export function getChatHistory(conversationId: string): Message[] {
  return chatCache[conversationId] || [];
}
