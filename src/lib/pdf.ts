/**
 * Extraction du texte des PDF, 100 % côté client (pdf.js) — fonctionne hors-ligne,
 * le fichier ne quitte jamais l'appareil. Ce module est chargé à la demande (import dynamique).
 */
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Polyfill pour les navigateurs plus anciens (Safari < 17.4…)
if (typeof Promise.withResolvers !== 'function') {
  (Promise as unknown as { withResolvers: () => unknown }).withResolvers = function <T>() {
    let resolve!: (v: T | PromiseLike<T>) => void;
    let reject!: (r?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
  width: number;
  height: number;
  transform: number[];
}

export interface PdfExtraction {
  text: string;
  pages: number;
  /** pages sans aucun texte (PDF scanné → OCR nécessaire) */
  emptyPages: number;
}

/** Reconstitue lignes et paragraphes à partir des fragments positionnés de pdf.js. */
function itemsToText(items: PdfTextItem[]): string {
  let out = '';
  let prev: { x: number; y: number; w: number } | null = null;
  for (const it of items) {
    if (typeof it.str !== 'string') continue;
    if (!it.str && !it.hasEOL) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    const h = it.height || Math.abs(it.transform[3]) || 10;
    if (prev) {
      const dy = prev.y - y;
      if (Math.abs(dy) > h * 0.6) {
        out += dy > h * 1.9 ? '\n\n' : '\n';
      } else {
        const gap = x - (prev.x + prev.w);
        if (gap > h * 0.15 && !out.endsWith(' ') && !it.str.startsWith(' ')) out += ' ';
      }
    }
    out += it.str;
    prev = { x, y, w: it.width };
    if (it.hasEOL) {
      out += '\n';
      prev = null;
    }
  }
  return out;
}

/** Nettoyage : césures de fin de ligne, espaces, lignes vides multiples. */
export function cleanExtractedText(text: string): string {
  return text
    .replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractPdfText(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<PdfExtraction> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    const pages: string[] = [];
    let emptyPages = 0;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const txt = itemsToText(content.items as unknown as PdfTextItem[]).trim();
      if (!txt) emptyPages += 1;
      else pages.push(txt);
      page.cleanup();
      onProgress?.(p, doc.numPages);
    }
    return { text: cleanExtractedText(pages.join('\n\n')), pages: doc.numPages, emptyPages };
  } finally {
    void doc.destroy();
  }
}
