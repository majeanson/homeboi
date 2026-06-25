// On-device OCR for "read a recipe from a photo". A real OCR engine (Tesseract,
// WASM) — NOT a generative vision model — so it can return blanks or garble but it
// NEVER turns a "3/4" into a "1/4" or invents an ingredient. That faithfulness is
// the whole point: the generative vision read (functions/_lib/ai.ts recipeFromImage)
// stays only as a low-confidence fallback. The transcribed text then flows through
// the SAME structuring path paste-import uses (/api/recipe-import { text }).
//
// tesseract.js bundles a WASM core + per-language traineddata, so it's a DYNAMIC
// import (the bytes only download on the first read) — exactly the heic2any pattern
// in lib/image.ts. One worker is reused for the session. The recipe image never
// leaves the device (Loi 25): OCR runs entirely in the browser.

import type { Page, Word, Worker } from 'tesseract.js'

// Below this per-word confidence (0–100) a token is "shaky" and gets surfaced to
// the verify panel so the cook glances at the photo — the 3/4↔1/4 failure points.
const LOW_CONFIDENCE = 70

export interface OcrResult {
  /** The transcribed text, newline-preserving, ready for parsePastedRecipe. */
  text: string
  /** Mean page confidence, 0–100. The caller gates the no-AI path on this. */
  confidence: number
  /** Distinct shaky words (low per-word confidence) — the verify panel flags any
   *  ingredient/step line containing one. Lowercased, deduped. */
  lowConfidenceWords: string[]
}

const EMPTY: OcrResult = { text: '', confidence: 0, lowConfidenceWords: [] }

// Singleton worker, created lazily on first read and kept for the session (creating
// one downloads the core + traineddata, so we never pay that twice). FR + EN both,
// since a household's recipes are bilingual. A failed create resolves the promise to
// null so ocrImage degrades to the AI fallback instead of throwing.
let workerPromise: Promise<Worker | null> | null = null

function getWorker(onProgress?: (fraction: number) => void): Promise<Worker | null> {
  if (!workerPromise) {
    workerPromise = (async () => {
      try {
        const { createWorker } = await import('tesseract.js')
        const worker = await createWorker(['fra', 'eng'], 1, {
          logger: (m) => {
            // Only the recognize phase carries a meaningful 0..1 for the "Lecture…"
            // progress; download/init phases just spin.
            if (m.status === 'recognizing text' && typeof m.progress === 'number') onProgress?.(m.progress)
          },
        })
        // Recipe-tuned recognition. A recipe card almost never prints a literal "%",
        // yet "%" is Tesseract's most common misread of a vulgar fraction (¾/½/¼ share
        // its diagonal-with-circles shape) — blacklisting it nudges the engine to its
        // next-best guess (often the real fraction). user_defined_dpi steadies digit/
        // punctuation calls (a dropped comma turns "1,25 ml" into "125 ml").
        await worker.setParameters({ tessedit_char_blacklist: '%', user_defined_dpi: '300' })
        return worker
      } catch {
        return null
      }
    })()
  }
  return workerPromise
}

// Tesseract's vulgar-fraction recognition is shaky; when it DOES emit a glyph, fold
// it to the ASCII form the rest of the app expects ("¾"→"3/4", "1½"→"1 1/2"). Pure;
// empty in → empty out. (It can't recover a fraction already lost to "%" — that's
// what the blacklist above + the verify panel's flagging are for.)
const VULGAR: Record<string, string> = {
  '¼': '1/4', '½': '1/2', '¾': '3/4', '⅐': '1/7', '⅑': '1/9', '⅒': '1/10',
  '⅓': '1/3', '⅔': '2/3', '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5',
  '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
}
const VULGAR_CLASS = /[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g
export function normalizeOcrText(text: string): string {
  if (!text) return text
  return text
    // A whole number glued to a fraction glyph ("1½" / "1 ½") → mixed "1 1/2".
    .replace(/(\d)\s*([¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, (_, d, g) => `${d} ${VULGAR[g]}`)
    .replace(VULGAR_CLASS, (g) => VULGAR[g])
}

// Walk the OCR page tree (blocks → paragraphs → lines → words) collecting words
// whose confidence is below LOW_CONFIDENCE. Tolerant of a null/odd shape (older or
// trimmed outputs) — never throws.
function collectLowConfidence(page: Page): string[] {
  const seen = new Set<string>()
  const words: Word[] = []
  for (const block of page.blocks ?? []) {
    for (const para of block?.paragraphs ?? []) {
      for (const line of para?.lines ?? []) {
        for (const w of line?.words ?? []) words.push(w)
      }
    }
  }
  for (const w of words) {
    const text = typeof w?.text === 'string' ? w.text.trim() : ''
    // Skip lone punctuation; keep shaky numbers (length 1 is fine if it's a digit)
    // and shaky words (length ≥ 2). These are exactly what a cook should re-check.
    const keep = /\d/.test(text) || text.length >= 2
    if (!keep || typeof w.confidence !== 'number' || w.confidence >= LOW_CONFIDENCE) continue
    const key = text.toLowerCase()
    if (!seen.has(key)) seen.add(key)
  }
  return [...seen]
}

// Transcribe one image to text. Defensive: any failure (worker create, recognize)
// resolves to EMPTY so the caller falls back to the AI vision read — the same
// "never block the flow" posture as resizeImage.
export async function ocrImage(image: Blob, onProgress?: (fraction: number) => void): Promise<OcrResult> {
  try {
    const worker = await getWorker(onProgress)
    if (!worker) return EMPTY
    const { data } = await worker.recognize(image)
    const text = normalizeOcrText(typeof data.text === 'string' ? data.text.trim() : '')
    return {
      text,
      confidence: typeof data.confidence === 'number' ? data.confidence : 0,
      lowConfidenceWords: collectLowConfidence(data),
    }
  } catch {
    return EMPTY
  }
}

// Free the worker (and its WASM heap) — call when the recipe editor closes so a
// cheap tablet reclaims the memory. Safe to call when no worker exists.
export async function disposeOcr(): Promise<void> {
  const p = workerPromise
  workerPromise = null
  if (!p) return
  try {
    const worker = await p
    await worker?.terminate()
  } catch {
    /* already gone — nothing to reclaim */
  }
}
