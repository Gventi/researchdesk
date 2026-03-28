import type { ModelMode, PaperAnalysis, PaperMeta } from "./store";

export const MODELS = {
  quick: "gemini-3.1-flash-lite-preview",
  deep: "gemma-3-27b-it",
} as const;

export const BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

export async function testConnection(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${BASE_URL}/${MODELS.quick}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "ping" }] }],
        }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

const SYSTEM_PROMPT = `You are Research Desk, an academic librarian AI assisting a graduate student in counselling psychology and addiction studies.

You have access to the following excerpts from the user's uploaded research papers:

{CONTEXT_CHUNKS}

Rules:
- Ground every claim in the provided excerpts. If the answer isn't in the excerpts, say so clearly.
- Always cite your sources inline as [Paper: filename, p. N].
- When synthesizing across multiple papers, explicitly compare and contrast perspectives.
- For APA formatting requests, produce a complete APA 7th edition reference.
- Be precise and academic in tone, but clear and readable.
- If the user asks to find themes across papers, structure your response with labeled thematic headings.`;

export const SPECIAL_PROMPTS: Record<string, string> = {
  "/summarize":
    "Summarize each of the selected papers in approximately 200 words each. Structure each summary with the paper title, key objectives, methodology, and main findings. Cite page numbers.",
  "/themes":
    "Identify and compare 3–5 recurring themes across all of the selected papers. For each theme, explain how different papers address it, noting similarities and differences. Use labeled thematic headings.",
  "/apa":
    "Generate complete APA 7th edition references for each of the selected papers. Use the metadata and content from the excerpts to construct accurate citations.",
  "/gaps":
    "Analyze the selected papers and identify research gaps — areas that are under-explored, contradictions between findings, populations not studied, or methodological limitations that future research could address.",
  "/lit-review":
    `Write a cohesive literature review section (1000–2000 words) based on the selected papers. Structure the review thematically, not paper-by-paper. Requirements:
- Open with a brief introduction establishing the broader topic and scope of the review
- Organize the body into 3–5 thematic sections with clear headings
- Within each theme, synthesize across multiple papers — compare, contrast, and connect findings
- Use APA 7th edition in-text citations throughout (Author, Year) format
- Include transitional sentences between themes to maintain narrative flow
- Close with a synthesis paragraph summarizing the state of the literature and identifying where further research is needed
- Maintain a formal academic tone appropriate for a graduate thesis`,
};

export function resolveSlashCommand(input: string): { query: string; isCommand: boolean } {
  const trimmed = input.trim();
  const command = Object.keys(SPECIAL_PROMPTS).find((cmd) =>
    trimmed.toLowerCase().startsWith(cmd),
  );
  if (command) {
    return { query: SPECIAL_PROMPTS[command], isCommand: true };
  }
  return { query: trimmed, isCommand: false };
}

export async function sendMessage(
  query: string,
  contextChunks: string,
  model: ModelMode,
  apiKey: string,
  onToken: (text: string) => void,
): Promise<void> {
  const systemText = SYSTEM_PROMPT.replace("{CONTEXT_CHUNKS}", contextChunks || "No excerpts available — the user hasn't selected any papers or no relevant chunks were found.");

  const modelId = MODELS[model];
  const url = `${BASE_URL}/${modelId}:streamGenerateContent?alt=sse&key=${apiKey}`;

  // gemma models don't support system_instruction — inline it into the user message
  const supportsSystemInstruction = model === "quick";

  const body: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: supportsSystemInstruction
              ? query
              : `${systemText}\n\n---\n\nUser question: ${query}`,
          },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: 4096,
    },
  };

  if (supportsSystemInstruction) {
    body.system_instruction = { parts: [{ text: systemText }] };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr || jsonStr === "[DONE]") continue;

      try {
        const parsed = JSON.parse(jsonStr);
        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) onToken(text);
      } catch {
        // skip malformed SSE lines
      }
    }
  }
}

const ANALYSIS_PROMPT = `You are an expert academic research analyst. Analyze the following research paper text and produce a structured analysis in EXACTLY this JSON format. Return ONLY valid JSON, no markdown fences, no extra text.

{
  "summary": "A 150-200 word overview of the paper including its purpose, context, and main contribution.",
  "keyFindings": "The 3-5 most important findings or arguments, each as a bullet point (use \\n- for each).",
  "methodology": "Research design, methods, sample/participants, data collection and analysis approaches.",
  "dataExtraction": "Key variables, measures, statistical results, effect sizes, sample demographics — the concrete data points a researcher would need for a synthesis table.",
  "synthesisNotes": "Theoretical framework used, how this paper connects to broader literature, themes it contributes to, and how it could be positioned in a literature review or meta-synthesis.",
  "limitations": "Stated and unstated limitations, potential biases, generalizability concerns, and what future research could address."
}

Paper text:
`;

export async function analyzePaper(
  paperText: string,
  apiKey: string,
): Promise<PaperAnalysis> {
  const modelId = MODELS.quick;
  const url = `${BASE_URL}/${modelId}:generateContent?key=${apiKey}`;

  // Truncate to ~30k chars to stay within context limits
  const truncated = paperText.slice(0, 30000);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: "You are a research analysis assistant. Always respond with valid JSON only." }],
      },
      contents: [
        { role: "user", parts: [{ text: ANALYSIS_PROMPT + truncated }] },
      ],
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.2,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Analysis failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Strip markdown fences if present
  const jsonStr = rawText.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      summary: parsed.summary || "",
      keyFindings: parsed.keyFindings || "",
      methodology: parsed.methodology || "",
      dataExtraction: parsed.dataExtraction || "",
      synthesisNotes: parsed.synthesisNotes || "",
      limitations: parsed.limitations || "",
      generatedAt: Date.now(),
    };
  } catch {
    throw new Error("Failed to parse analysis response. Please try again.");
  }
}

const ANNOTATED_BIB_PROMPT = `You are an expert academic writing assistant specializing in APA 7th edition. Given the following research paper text, produce a complete annotated bibliography entry.

Format your response as follows:

1. **APA 7th Edition Reference** — Construct the full reference from the paper's metadata (authors, year, title, journal, volume, issue, pages, DOI). Use the information available in the text; if some metadata is missing, note it with [details not available].

2. **Summary** (approximately 250 words) — Describe the paper's purpose, theoretical framework, methodology, key findings, and main conclusions in detail.

3. **Assessment** (50-75 words) — Evaluate the source's reliability, relevance, authority, and currency. Note the research design's strengths.

4. **Reflection** (50-75 words) — Explain how this source fits into a broader literature review. How does it relate to other research in the field? What unique perspective does it offer?

Write in formal academic prose. Do NOT use JSON format — write it as a properly formatted annotated bibliography entry ready to paste into a document.

Paper text:
`;

export async function generateAnnotatedBib(
  paperText: string,
  apiKey: string,
): Promise<string> {
  const modelId = MODELS.quick;
  const url = `${BASE_URL}/${modelId}:generateContent?key=${apiKey}`;

  const truncated = paperText.slice(0, 30000);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: "You are an academic writing assistant. Produce a complete annotated bibliography entry in APA 7th edition format." }],
      },
      contents: [
        { role: "user", parts: [{ text: ANNOTATED_BIB_PROMPT + truncated }] },
      ],
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.2,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Annotated bibliography generation failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
}

const META_PROMPT = `You are an expert academic librarian. Extract metadata from the following research paper text. Return ONLY valid JSON, no markdown fences, no extra text.

{
  "title": "The full title of the paper",
  "authors": "All authors in 'Last, F. M., Last, F. M.' format",
  "year": "Publication year (4 digits)",
  "journal": "Journal or publication name",
  "abstract": "A 2-3 sentence summary of the paper's purpose, methods, and key findings",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}

Extract as accurately as possible from the text. If a field cannot be determined, use "Unknown" for strings or [] for keywords.

Paper text (first ~5000 chars):
`;

export async function extractPaperMeta(
  paperText: string,
  apiKey: string,
): Promise<PaperMeta> {
  const modelId = MODELS.quick;
  const url = `${BASE_URL}/${modelId}:generateContent?key=${apiKey}`;

  // Only need the beginning of the paper for metadata
  const truncated = paperText.slice(0, 5000);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: "You are a metadata extraction assistant. Always respond with valid JSON only." }],
      },
      contents: [
        { role: "user", parts: [{ text: META_PROMPT + truncated }] },
      ],
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.1,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Metadata extraction failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const jsonStr = rawText.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      title: parsed.title || "Unknown",
      authors: parsed.authors || "Unknown",
      year: parsed.year || "Unknown",
      journal: parsed.journal || "Unknown",
      abstract: parsed.abstract || "",
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      generatedAt: Date.now(),
    };
  } catch {
    throw new Error("Failed to parse metadata response. Please try again.");
  }
}
