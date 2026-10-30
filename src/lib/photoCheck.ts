// What a photo can tell BEFORE a reader runs (2026-10-30). The reader's failures that a
// cook can fix at the camera: a blurred page, a hand's shadow over the text (the
// crevettes lost three words under one), the next page's column inside the frame (the
// reader completed its cut-off fragments into invented lines — porc tropical). Three
// deterministic measures over the grayscale pixels, no model, each a sentence the cook
// can act on. Conservative on purpose: a warning that fires on a good photo teaches the
// cook to ignore it — the thresholds are a budget, tuned on the photo corpus.
//
// Pure (`assessGray`, `warningsOf`) so a test can feed it synthetic pages; the browser
// half (`checkPhotoFile`) decodes through lib/image's canvas path.

export type PhotoWarningKind = 'blur' | 'shadow' | 'edge'

export interface PhotoAssessment {
  /** False for an image too small to measure — then nothing is said. */
  usable: boolean
  /** Variance of a 3×3 Laplacian over the page — sharp text is high, blur is low. */
  sharpness: number
  /** Share of 8×8-grid cells that are DARK against the page yet full of character-scale
   *  edges — text under a shadow (a printed photo is dark but smooth). */
  shadow: number
  /** Ink density in the outermost bands — text touching the frame, or another page. */
  edge: number
}

// CALIBRATED on the photo corpus (14 phone shots of cookbook pages, 2026-10-30), at the
// 700 px working size: the originals measure 937–3454 of sharpness, their twins blurred
// with σ = 2 (a shaken phone) 8–17 — anything under 60 cannot be read. The SHADOW
// measure is computed but NEVER warned: on glossy pages a printed food photo (dark,
// textured) scores exactly like text under a hand (0.125–0.141 vs 0.156) — a warning
// that fires on the saumon's photo teaches the cook to ignore it; the tip at the door
// carries that advice instead. EDGE counts text-like edges in the frame's border band,
// not darkness — the table around a page is dark too.
export const BLUR_BELOW = 60
export const SHADOW_ABOVE = Infinity
// Corpus: the page with the next page's column in frame measures 0.098 and a page with a
// dish photo at its edge 0.103; a page framed on its margins ≤ 0.065.
export const EDGE_ABOVE = 0.09

export function assessGray(gray: Uint8Array | Uint8ClampedArray, w: number, h: number): PhotoAssessment {
  if (w < 64 || h < 64 || gray.length < w * h) return { usable: false, sharpness: 0, shadow: 0, edge: 0 }
  // Laplacian variance — the classic focus measure.
  let sum = 0
  let sumSq = 0
  let n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w]
      sum += lap
      sumSq += lap * lap
      n++
    }
  }
  const mean = sum / n
  const sharpness = sumSq / n - mean * mean
  // Cells: mean brightness and edge density (share of pixels whose Laplacian is large).
  const G = 8
  const cw = Math.floor(w / G)
  const ch = Math.floor(h / G)
  const cells: { bright: number; edges: number }[] = []
  for (let cy = 0; cy < G; cy++) {
    for (let cx = 0; cx < G; cx++) {
      let b = 0
      let e = 0
      let c = 0
      for (let y = cy * ch + 1; y < (cy + 1) * ch - 1; y++) {
        for (let x = cx * cw + 1; x < (cx + 1) * cw - 1; x++) {
          const i = y * w + x
          b += gray[i]
          const lap = Math.abs(4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w])
          if (lap > 60) e++
          c++
        }
      }
      cells.push({ bright: c ? b / c : 0, edges: c ? e / c : 0 })
    }
  }
  const brights = cells.map((c) => c.bright).sort((a, z) => a - z)
  const pageBright = brights[Math.floor(brights.length * 0.6)] || 1
  const shaded = cells.filter((c) => c.bright < pageBright * 0.62 && c.edges > 0.04).length
  const shadow = shaded / cells.length
  // Edge bands: text-like edges (a strong Laplacian) in the outermost 2 % of the frame —
  // the next page's column, or this page's text running out of frame.
  const band = Math.max(3, Math.round(Math.min(w, h) * 0.02))
  let edgy = 0
  let total = 0
  const look = (x: number, y: number) => {
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return
    total++
    const i = y * w + x
    if (Math.abs(4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w]) > 60) edgy++
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < band; x++) look(x, y)
  for (let y = 0; y < h; y++) for (let x = w - band; x < w; x++) look(x, y)
  for (let x = band; x < w - band; x++) for (let y = 0; y < band; y++) look(x, y)
  for (let x = band; x < w - band; x++) for (let y = h - band; y < h; y++) look(x, y)
  const edge = total ? edgy / total : 0
  return { usable: true, sharpness, shadow, edge }
}

export function warningsOf(a: PhotoAssessment): PhotoWarningKind[] {
  const out: PhotoWarningKind[] = []
  if (!a.usable) return out
  if (a.sharpness < BLUR_BELOW) out.push('blur')
  if (a.shadow > SHADOW_ABOVE) out.push('shadow')
  if (a.edge > EDGE_ABOVE) out.push('edge')
  return out
}

// The browser half: decode (HEIC included), downscale to ~700 px for speed, gray out.
// Any failure → no warnings: a check that cannot run must never block a read.
export async function checkPhotoFile(file: File): Promise<PhotoWarningKind[]> {
  try {
    const { grayPixels } = await import('./image')
    const g = await grayPixels(file, 700)
    return g ? warningsOf(assessGray(g.gray, g.width, g.height)) : []
  } catch {
    return []
  }
}
