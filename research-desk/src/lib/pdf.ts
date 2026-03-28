import type { PaperPage } from "./store";

let initialized = false;
let pdfjsLib: typeof import("pdfjs-dist");

async function init() {
  if (initialized) return;
  pdfjsLib = await import("pdfjs-dist");
  const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
  initialized = true;
}

export async function extractText(
  data: ArrayBuffer,
): Promise<PaperPage[]> {
  await init();

  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: PaperPage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: any) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push({ pageNum: i, text });
  }

  return pages;
}
