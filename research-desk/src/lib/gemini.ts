import type { ModelMode, PaperAnalysis, PaperMeta, Paper, ProjectModelMode } from "./store";
import { queryRAG, formatContextChunks, getAnalysis, getMeta } from "./rag";
import type { ThemeMapTheme, MethodsRow } from "./rag";

export const MODELS = {
  quick: "gemini-3.1-flash-lite-preview",
  deep: "gemma-3-27b-it",
  capable: "gemini-2.5-flash",
} as const;

export const TOOLS = [
  {
    function_declarations: [
      {
        name: "search_library",
        description: "Search the uploaded research papers for specific information using semantic search. Use this for general questions or when looking for specific themes across multiple papers.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "string",
              description: "The search query to find relevant excerpts from the papers.",
            },
            paper_ids: {
              type: "array",
              items: { type: "string" },
              description: "Optional: List of paper IDs to restrict the search to. If omitted, searches all selected papers.",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "read_paper_page",
        description: "Read the full text of a specific page from a paper. Use this when you need precise details or need to see the context around a citation.",
        parameters: {
          type: "OBJECT",
          properties: {
            paper_id: {
              type: "string",
              description: "The ID of the paper to read.",
            },
            page_num: {
              type: "number",
              description: "The page number to read (1-indexed).",
            },
          },
          required: ["paper_id", "page_num"],
        },
      },
      {
        name: "get_paper_analysis",
        description: "Get the structured AI analysis of a paper, including summary, key findings, methodology, and limitations.",
        parameters: {
          type: "OBJECT",
          properties: {
            paper_id: {
              type: "string",
              description: "The ID of the paper.",
            },
          },
          required: ["paper_id"],
        },
      },
    ],
  },
];

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

You have access to a library of research papers. You can search them, read specific pages, or get pre-calculated analyses.

Rules:
- Ground every claim in the excerpts you find. If the answer isn't in the library, say so clearly.
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
  selectedPaperIds: string[],
  papers: Paper[],
  onToken: (text: string) => void,
): Promise<void> {
  const modelId = MODELS[model];
  const url = `${BASE_URL}/${modelId}:generateContent?key=${apiKey}`;

  // gemma models don't support tools or system_instruction in the same way
  const isGemma = modelId.includes("gemma");
  const supportsTools = !isGemma;
  const supportsSystemInstruction = !isGemma;

  const contents: any[] = [
    {
      role: "user",
      parts: [{ text: isGemma ? `${SYSTEM_PROMPT}\n\n---\n\nUser question: ${query}` : query }],
    },
  ];

  if (contextChunks) {
    contents[0].parts.push({ text: `\n\nInitial context:\n${contextChunks}` });
  }

  let turnLimit = supportsTools ? 5 : 1;
  while (turnLimit-- > 0) {
    const body: any = {
      contents,
      generationConfig: { maxOutputTokens: 4096, temperature: 0.2 },
    };

    if (supportsSystemInstruction) {
      body.system_instruction = { parts: [{ text: SYSTEM_PROMPT }] };
    }

    if (supportsTools) {
      body.tools = TOOLS;
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

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const message = candidate?.content;
    if (!message) break;

    contents.push(message);

    const toolCalls = message.parts.filter((p: any) => p.functionCall);
    if (toolCalls.length === 0) {
      const text = message.parts.map((p: any) => p.text).join("");
      onToken(text);
      break;
    }

    const toolResults = await Promise.all(
      toolCalls.map(async (tc: any) => {
        const { name, args } = tc.functionCall;
        let result: any;

        try {
          if (name === "search_library") {
            const searchResults = await queryRAG(
              args.query,
              args.paper_ids || selectedPaperIds,
              apiKey,
            );
            result = formatContextChunks(searchResults);
          } else if (name === "read_paper_page") {
            const paper = papers.find((p) => p.id === args.paper_id);
            const page = paper?.pages.find((pg) => pg.pageNum === args.page_num);
            result = page ? page.text : "Page not found.";
          } else if (name === "get_paper_analysis") {
            const analysis = getAnalysis(args.paper_id);
            result = analysis ? JSON.stringify(analysis) : "Analysis not found.";
          } else {
            result = "Unknown tool.";
          }
        } catch (err: any) {
          result = `Error executing tool: ${err.message}`;
        }

        return {
          functionResponse: {
            name,
            response: { content: result },
          },
        };
      }),
    );

    contents.push({
      role: "function",
      parts: toolResults,
    });
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

// --- Project-Level Analysis Functions ---

export function buildProjectContext(papers: Paper[]): string {
  const blocks: string[] = [];
  for (let i = 0; i < papers.length; i++) {
    const p = papers[i];
    const meta = getMeta(p.id);
    const analysis = getAnalysis(p.id);
    if (!analysis) continue;

    const title = meta?.title && meta.title !== "Unknown" ? meta.title : p.filename.replace(/\.pdf$/i, "");
    const authors = meta?.authors && meta.authors !== "Unknown" ? meta.authors : "Unknown";
    const year = meta?.year && meta.year !== "Unknown" ? meta.year : "n.d.";
    const journal = meta?.journal && meta.journal !== "Unknown" ? meta.journal : "";

    blocks.push(
      `--- Paper ${i + 1} [ID: ${p.id}] ---
Title: ${title}
Authors: ${authors} (${year})${journal ? `\nJournal: ${journal}` : ""}
Summary: ${analysis.summary}
Key Findings: ${analysis.keyFindings}
Methodology: ${analysis.methodology}
Synthesis Notes: ${analysis.synthesisNotes}
Limitations: ${analysis.limitations}`
    );
  }

  // Truncate if needed to stay within token limits
  let combined = blocks.join("\n\n");
  if (combined.length > 50000) {
    combined = combined.slice(0, 50000) + "\n\n[Truncated due to length]";
  }
  return combined;
}

function resolveProjectModel(model: ProjectModelMode): string {
  return model === "capable" ? MODELS.capable : MODELS.quick;
}

export async function generateLitReview(
  projectContext: string,
  model: ProjectModelMode,
  apiKey: string,
): Promise<string> {
  const modelId = resolveProjectModel(model);
  const url = `${BASE_URL}/${modelId}:generateContent?key=${apiKey}`;

  const prompt = `You are an expert academic writing assistant helping a graduate student in counselling psychology and addiction studies write a literature review.

Based on the following paper analyses, write a comprehensive thematic literature review (1500-3000 words).

Requirements:
- Open with an introduction establishing the broader topic and scope
- Organize into 3-5 thematic sections with clear headings
- Within each theme, synthesize across multiple papers — compare, contrast, and connect findings
- Use APA 7th edition in-text citations throughout (Author, Year)
- Include transitional sentences between themes for narrative flow
- Add a "Methodological Considerations" section comparing research approaches
- Close with "Gaps and Future Directions" identifying what is missing from this body of literature
- Maintain formal academic tone appropriate for a graduate thesis
- Do NOT simply summarize papers one by one — weave them together thematically

Paper analyses:

${projectContext}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: "You are an expert academic writer producing a polished literature review section for a graduate thesis." }],
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.3 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Literature review generation failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
}

export async function generateThemeMap(
  projectContext: string,
  model: ProjectModelMode,
  apiKey: string,
): Promise<ThemeMapTheme[]> {
  const modelId = resolveProjectModel(model);
  const url = `${BASE_URL}/${modelId}:generateContent?key=${apiKey}`;

  const prompt = `You are an expert qualitative researcher performing thematic analysis across multiple research papers.

Analyze the following paper summaries and identify 5-8 recurring themes across them. For each theme, evaluate every paper's relevance and extract supporting excerpts.

Return ONLY valid JSON in this exact format (no markdown fences):

[
  {
    "name": "Theme Name",
    "description": "A 2-3 sentence description of this theme and why it matters",
    "papers": [
      {
        "paperId": "the-paper-id-from-above",
        "title": "Paper Title",
        "relevance": "high",
        "excerpts": ["Key quote or finding from this paper relating to this theme"]
      }
    ]
  }
]

Relevance levels: "high" = central to the paper, "medium" = addressed but not primary, "low" = tangentially mentioned.
Only include papers that actually relate to each theme (skip papers with no connection).

Paper analyses:

${projectContext}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: "You are a qualitative research analyst. Always respond with valid JSON only." }],
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Theme map generation failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const jsonStr = rawText.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    throw new Error("Failed to parse theme map response. Please try again.");
  }
}

export async function generateMethodsTable(
  projectContext: string,
  model: ProjectModelMode,
  apiKey: string,
): Promise<MethodsRow[]> {
  const modelId = resolveProjectModel(model);
  const url = `${BASE_URL}/${modelId}:generateContent?key=${apiKey}`;

  const prompt = `You are an expert research methodologist. Extract methodology details and key findings from each paper into a structured comparison table.

Return ONLY valid JSON in this exact format (no markdown fences):

[
  {
    "paperId": "the-paper-id-from-above",
    "title": "Paper Title",
    "design": "Research design (e.g., qualitative phenomenological, quantitative RCT, mixed methods, systematic review)",
    "sampleSize": "Sample size and description (e.g., 'N=234 undergraduate students', 'N/A - systematic review of 42 studies')",
    "population": "Target population and demographics (e.g., 'Adults 18-65 with alcohol use disorder, 68% male, urban US')",
    "measures": "Key instruments, measures, or data collection methods (e.g., 'AUDIT, BDI-II, semi-structured interviews')",
    "analysisMethod": "Data analysis approach (e.g., 'thematic analysis', 'hierarchical regression', 'IPA')",
    "findings": "The 2-4 most important findings, results, or conclusions (e.g., 'Significant reduction in substance use (p<.01); CBT group showed 40% greater improvement than control; qualitative themes: recovery identity, social support')"
  }
]

Be specific and precise. Use standard abbreviations where appropriate. If information is not available, write "Not reported".

Paper analyses:

${projectContext}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: "You are a research methodology expert. Always respond with valid JSON only." }],
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 4096, temperature: 0.1 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Methods table generation failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const jsonStr = rawText.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    throw new Error("Failed to parse methods table response. Please try again.");
  }
}

export async function generateBatchBibliography(
  projectContext: string,
  model: ProjectModelMode,
  apiKey: string,
): Promise<string[]> {
  const modelId = resolveProjectModel(model);
  const url = `${BASE_URL}/${modelId}:generateContent?key=${apiKey}`;

  const prompt = `You are an expert academic writing assistant specializing in APA 7th edition format.

For each paper below, generate a complete annotated bibliography entry. Each entry should include:

1. **APA 7th Edition Reference** — Full citation
2. **Summary** (~150 words) — Purpose, methods, key findings, conclusions
3. **Assessment** (~50 words) — Source reliability, strengths, relevance
4. **Reflection** (~50 words) — How it fits into the broader literature

Return ONLY valid JSON as an array of strings. Each string is one complete annotated bibliography entry (with the APA reference, summary, assessment, and reflection as formatted text). No markdown fences.

Example format:
["First entry full text here...", "Second entry full text here..."]

Order entries alphabetically by first author's last name.

Paper analyses:

${projectContext}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: "You are an APA formatting expert. Always respond with valid JSON only." }],
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Bibliography generation failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const jsonStr = rawText.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    throw new Error("Failed to parse bibliography response. Please try again.");
  }
}

export async function generateCompareContrast(
  projectContext: string,
  model: ProjectModelMode,
  apiKey: string,
): Promise<string> {
  const modelId = resolveProjectModel(model);
  const url = `${BASE_URL}/${modelId}:generateContent?key=${apiKey}`;

  const prompt = `You are an expert academic research analyst helping a graduate student in counselling psychology and addiction studies write a compare-and-contrast analysis.

Based on the following paper analyses, write a detailed compare-and-contrast analysis (1500-2500 words) that explicitly examines how these papers relate to each other.

Structure your analysis with these sections:

## Shared Findings & Agreements
Where do these papers converge? What findings, conclusions, or theoretical positions do multiple papers support? Cite specific papers using (Author, Year) format.

## Contradictions & Disagreements
Where do these papers diverge? Are there conflicting findings, opposing theoretical frameworks, or incompatible conclusions? Explain the nature of each disagreement.

## Complementary Perspectives
How do these papers build on or extend each other? Where does one paper fill a gap left by another? How do different methodological approaches illuminate different aspects of the same phenomenon?

## Methodological Differences & Implications
Compare research designs, sample characteristics, and analytical approaches. How do methodological choices affect the findings? Which approaches are most rigorous for the research questions asked?

## Synthesis: The Bigger Picture
What story emerges when these papers are read together? What does the collective body of evidence suggest? Where is the field heading?

Requirements:
- Directly compare specific papers to each other — don't just summarize them individually
- Use APA 7th edition in-text citations (Author, Year) throughout
- Be specific about what is similar and what differs
- Maintain formal academic tone appropriate for a graduate thesis
- Include at least one direct comparison in every paragraph

Paper analyses:

${projectContext}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: "You are an expert academic analyst producing a compare-and-contrast section for a graduate thesis." }],
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.3 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Compare & contrast generation failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
}
