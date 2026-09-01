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

import type { Bbox, Page, Word, Worker } from 'tesseract.js'

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

// The DEFAULT tesseract.js traineddata (integerized, bundled) — plain and un-tuned.
// We deliberately do NOT reach for the external "best" float models or force a DPI /
// char-blacklist: those were layered on later to chase fractions and, in practice,
// made the on-device read WORSE (slower, CDN-dependent, more garble on ordinary
// photos). The faithful post-processing below (normalizeOcrText, mergeOcrPages, the
// metric-fraction rescue) recovers the numbers without touching what the engine
// actually saw. Cloud OCR ("Haute précision", Mistral) stays the accuracy option.
function getWorker(onProgress?: (fraction: number) => void): Promise<Worker | null> {
  if (!workerPromise) {
    workerPromise = (async () => {
      try {
        const { createWorker } = await import('tesseract.js')
        return await createWorker(['fra', 'eng'], 1, {
          logger: (m: { status: string; progress: number }) => {
            // Only the recognize phase carries a meaningful 0..1 for the "Lecture…"
            // progress; download/init phases just spin.
            if (m.status === 'recognizing text' && typeof m.progress === 'number') onProgress?.(m.progress)
          },
        })
      } catch {
        return null // no models at all → caller degrades to the AI vision read
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

// Merge several OCR'd photos of the SAME recipe — a wide shot plus zoomed-in close-
// ups of the dense parts — into ONE transcript without duplicating the overlapping
// lines. The first photo is the base (the wide shot: the whole recipe, in order);
// each later photo is detail — a line that strongly matches a base line REPLACES it
// (the zoom read those small numbers more clearly), and a line that matches nothing
// is appended so a separate page (ingredients here, steps there) still merges cleanly.
// Pure; degrades to plain concatenation when photos don't overlap, and to the single
// text when there's one photo.
const lineTokens = (s: string): string[] => s.toLowerCase().split(/\s+/).filter(Boolean)
// Jaccard overlap of two lines' word sets — robust to a single mis-read glyph
// ("% tasse de farine" vs "3/4 tasse de farine" still share most words).
function lineSimilarity(a: string, b: string): number {
  const A = new Set(lineTokens(a))
  const B = new Set(lineTokens(b))
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter)
}
const MERGE_THRESHOLD = 0.55 // high enough that different lines sharing a word or two don't merge

export function mergeOcrPages(pages: string[]): string {
  const texts = pages.map((p) => p.trim()).filter(Boolean)
  if (texts.length <= 1) return texts[0] ?? ''
  const splitLines = (t: string) => t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const base = splitLines(texts[0])
  // Best detail replacement found for each base line (highest-similarity wins).
  const replacement = new Map<number, { line: string; score: number }>()
  const extras: string[] = []
  for (const page of texts.slice(1)) {
    for (const line of splitLines(page)) {
      let bestIdx = -1
      let bestScore = MERGE_THRESHOLD
      for (let i = 0; i < base.length; i++) {
        const score = lineSimilarity(line, base[i])
        if (score > bestScore) {
          bestScore = score
          bestIdx = i
        }
      }
      if (bestIdx >= 0) {
        const cur = replacement.get(bestIdx)
        if (!cur || bestScore > cur.score) replacement.set(bestIdx, { line, score: bestScore })
      } else {
        extras.push(line) // matched nothing in the base → a genuinely new line
      }
    }
  }
  const merged = base.map((line, i) => replacement.get(i)?.line ?? line)
  return [...merged, ...extras].join('\n')
}

// ---------------------------------------------------------------------------
// Column-aware reassembly (the "85 g de miel" bug)
// ---------------------------------------------------------------------------
// A printed recipe is very often set in 2–3 COLUMNS, and Tesseract's flat
// `data.text` can join two columns' fragments onto one physical line — "de 85 g
// chacun" (column 1) + "soupe) de miel" (column 2) parsed into an invented
// "85 g de miel" ingredient. The words' bounding boxes know better: detect the
// column gutters from the x-coverage of the page's body text, then re-emit the
// transcript one column at a time, top to bottom. Pure and conservative — any
// doubt (few lines, no clear gutter, a lopsided split) returns null and the
// caller keeps Tesseract's own reading order.

interface CWord {
  text: string
  x0: number
  x1: number
  y0: number
  y1: number
}

// Flatten the page tree into physical lines of positioned words (x-sorted).
// Tolerant of a null/odd shape — a word without a usable bbox is skipped.
function pageLines(page: Page): CWord[][] {
  const lines: CWord[][] = []
  for (const block of page.blocks ?? []) {
    for (const para of block?.paragraphs ?? []) {
      for (const line of para?.lines ?? []) {
        const ws: CWord[] = []
        for (const w of line?.words ?? []) {
          const text = typeof w?.text === 'string' ? w.text.trim() : ''
          const b = (w as { bbox?: Bbox })?.bbox
          if (!text || !b || typeof b.x0 !== 'number' || typeof b.x1 !== 'number') continue
          ws.push({ text, x0: b.x0, x1: b.x1, y0: b.y0 ?? 0, y1: b.y1 ?? 0 })
        }
        if (ws.length) lines.push(ws.sort((a, z) => a.x0 - z.x0))
      }
    }
  }
  return lines
}

// Rebuild the transcript column-by-column, or null when the page doesn't read as
// a confident multi-column layout (then Tesseract's own text order stands).
export function columnizeOcrPage(page: Page): string | null {
  const lines = pageLines(page)
  if (lines.length < 6) return null
  const words = lines.flat()
  const heights = words.map((w) => w.y1 - w.y0).filter((h) => h > 0).sort((a, z) => a - z)
  const medianH = heights[Math.floor(heights.length / 2)]
  if (!medianH) return null
  // Display-size words (the big title spanning the whole page) would fill the
  // gutters; keep them out of the geometry and emit those lines first instead.
  const isDisplay = (w: CWord) => w.y1 - w.y0 > 1.8 * medianH
  const body = words.filter((w) => !isDisplay(w))
  if (body.length < 12) return null
  const minX = Math.min(...body.map((w) => w.x0))
  const maxX = Math.max(...body.map((w) => w.x1))
  const span = maxX - minX
  if (span <= 0) return null

  // x-coverage: how many LINES put body text over each bucket. A gutter is a run
  // of buckets almost no line covers — "almost", because one meta line
  // ("Préparation 20 min • Cuisson 5 min") legitimately spans every column.
  const N = 256
  const cover = new Array<number>(N).fill(0)
  let bodyLines = 0
  for (const line of lines) {
    const bw = line.filter((w) => !isDisplay(w))
    if (!bw.length) continue
    bodyLines++
    const seen = new Set<number>()
    for (const w of bw) {
      const b0 = Math.max(0, Math.floor(((w.x0 - minX) / span) * N))
      const b1 = Math.min(N - 1, Math.ceil(((w.x1 - minX) / span) * N) - 1)
      for (let b = b0; b <= b1; b++) seen.add(b)
    }
    for (const b of seen) cover[b]++
  }
  const sparseMax = Math.max(1, Math.round(bodyLines * 0.08))
  // A real gutter is wide: at least a word-height and a half. The small gap
  // between a step NUMBER and its text never qualifies.
  const minGutter = Math.max(span * 0.02, 1.5 * medianH)
  const gutters: number[] = [] // each gutter's centre x
  let runStart = -1
  for (let b = 0; b <= N; b++) {
    const sparse = b < N && cover[b] <= sparseMax
    if (sparse && runStart < 0) runStart = b
    if ((!sparse || b === N) && runStart >= 0) {
      // Interior runs only — a ragged left/right margin is not a gutter.
      if (runStart > 0 && b < N) {
        const a = minX + (runStart / N) * span
        const e = minX + (b / N) * span
        if (e - a >= minGutter) gutters.push((a + e) / 2)
      }
      runStart = -1
    }
  }
  if (gutters.length === 0 || gutters.length > 3) return null

  const bounds = [minX, ...gutters, maxX + 1]
  const nCols = bounds.length - 1
  const colOf = (w: CWord): number => {
    const c = (w.x0 + w.x1) / 2
    for (let i = 0; i < nCols; i++) if (c >= bounds[i] && c < bounds[i + 1]) return i
    return c < bounds[0] ? 0 : nCols - 1
  }
  // Every column must hold a fair share of the text, or the "gutter" was noise
  // (a hole in a short page, an indent) — better no split than a wrong one.
  const counts = new Array<number>(nCols).fill(0)
  for (const w of body) counts[colOf(w)]++
  if (counts.some((c) => c < body.length * 0.12)) return null

  // Re-emit: display lines that straddle columns (the title) first, then each
  // column's segments top-to-bottom, left column to right. A physical line that
  // crosses a gutter contributes one segment per column — exactly the un-merge.
  const headers: { y: number; text: string }[] = []
  const cols: { y: number; x: number; text: string }[][] = Array.from({ length: nCols }, () => [])
  for (const line of lines) {
    const touched = new Set(line.map(colOf))
    if (touched.size > 1 && line.every(isDisplay)) {
      headers.push({ y: Math.min(...line.map((w) => w.y0)), text: line.map((w) => w.text).join(' ') })
      continue
    }
    const byCol = new Map<number, CWord[]>()
    for (const w of line) {
      const c = colOf(w)
      const arr = byCol.get(c)
      if (arr) arr.push(w)
      else byCol.set(c, [w])
    }
    for (const [c, ws] of byCol) {
      cols[c].push({ y: Math.min(...ws.map((w) => w.y0)), x: ws[0].x0, text: ws.map((w) => w.text).join(' ') })
    }
  }
  headers.sort((a, z) => a.y - z.y)
  const out = headers.map((h) => h.text)
  for (const col of cols) {
    col.sort((a, z) => a.y - z.y || a.x - z.x)
    for (const seg of col) out.push(seg.text)
  }
  return out.join('\n')
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
    // tesseract.js v6 defaults `blocks: false`, which silently nulled the page
    // tree — no shaky-word flags, no bboxes. Ask for it explicitly: it feeds both
    // the low-confidence flags AND the column-aware reassembly.
    const { data } = await worker.recognize(image, {}, { text: true, blocks: true })
    // A multi-column page (most printed recipes) re-reads column by column so two
    // columns' fragments never merge into one line; a single-column page (or any
    // doubt) keeps Tesseract's own order.
    const raw = typeof data.text === 'string' ? data.text.trim() : ''
    const text = normalizeOcrText((columnizeOcrPage(data) ?? raw).trim())
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
