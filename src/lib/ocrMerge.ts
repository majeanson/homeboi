// Merge several OCR'd / transcribed photos of the SAME recipe — a wide shot plus zoomed
// close-ups of the dense parts, or page one and page two — into ONE transcript without
// duplicating the overlapping lines. Pure, no DOM: this file is imported by the photo
// corpus test on the Worker side (functions/_lib/recipePhotoCorpus.test.ts) as well as
// by lib/ocr.ts and RecipeForm, which is why it lives apart from the Tesseract wiring.
//
// The first photo is the base (the wide shot: the whole recipe, in order); each later
// photo is detail — a line that is the SAME line read again REPLACES it (the zoom read
// those small numbers more clearly), and a line that matches nothing is appended so a
// separate page (ingredients here, steps there) still merges cleanly. Degrades to plain
// concatenation when photos don't overlap, and to the single text when there's one.
//
// TWO GATES, both learned on Marc's « Saumon à l'asiatique » (2026-10-30), where page 2
// (the bowl version's sauce) shared the « ml (1 c. à thé) de » scaffolding with page 1's
// marinade: word-set overlap (Jaccard ≥ 0.55) scored the sriracha as a clearer read of
// the sesame oil, « Pour la sauce : » of « Pour la marinade : » (the French space-colon
// is a token), the soy sauce of the ginger — and each REPLACED its victim. Three
// ingredients and a heading vanished without a flag.
//  1. A page is a ZOOM (its lines may replace the base's) only when most of its lines
//     match a base line; a page that is mostly new is a second PAGE and is appended
//     whole — including a line that repeats verbatim (5 ml of sesame oil sits in both
//     the marinade and the sauce; deduping it would delete a real ingredient).
//  2. Two lines match only when they are the same words except for a misread GLYPH
//     or two — a token that is a number/fraction/symbol, or a couple of letters off.
//     A different WORD in the same slot (sauce / marinade, sriracha / sésame) is a
//     different line, however much scaffolding surrounds it.
const lineTokens = (s: string): string[] => s.toLowerCase().split(/\s+/).filter(Boolean)
// Does a token look like an amount or a misread glyph rather than a word? « % », « 3/4 »,
// « 1½ », « 6 » — the things a zoom exists to read better.
const glyphy = (t: string) => !/^[a-zà-ÿœ'’-]+$/i.test(t)
function editDistance(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[n]
}
// A token pair a zoom could legitimately have read differently.
const glyphClose = (a: string, b: string) => a === b || glyphy(a) || glyphy(b) || editDistance(a, b) <= 2
const MAX_SUBSTITUTIONS = 2
// Same line, read twice: the same token count, and at most MAX_SUBSTITUTIONS slots that
// differ, each by a glyph. Returns how many slots differ (0 = identical), or -1.
function sameLineDistance(a: string, b: string): number {
  const A = lineTokens(a)
  const B = lineTokens(b)
  if (!A.length || A.length !== B.length) return -1
  let diff = 0
  for (let i = 0; i < A.length; i++) {
    if (A[i] === B[i]) continue
    if (!glyphClose(A[i], B[i]) || ++diff > MAX_SUBSTITUTIONS) return -1
  }
  return diff
}
// A page whose lines mostly match the base is a zoom; below this share it is a new page.
const ZOOM_MIN_OVERLAP = 0.5

export function mergeOcrPages(pages: string[]): string {
  const texts = pages.map((p) => p.trim()).filter(Boolean)
  if (texts.length <= 1) return texts[0] ?? ''
  const splitLines = (t: string) => t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const base = splitLines(texts[0])
  // Best detail replacement found for each base line (closest read wins).
  const replacement = new Map<number, { line: string; dist: number }>()
  const extras: string[] = []
  for (const page of texts.slice(1)) {
    const lines = splitLines(page)
    // Each line's nearest base line, if it has one.
    const matches = lines.map((line) => {
      let bestIdx = -1
      let bestDist = Infinity
      for (let i = 0; i < base.length; i++) {
        const d = sameLineDistance(line, base[i])
        if (d >= 0 && d < bestDist) {
          bestDist = d
          bestIdx = i
        }
      }
      return { line, bestIdx, bestDist }
    })
    const matched = matches.filter((m) => m.bestIdx >= 0).length
    if (matched < lines.length * ZOOM_MIN_OVERLAP) {
      extras.push(...lines) // a second page: every line is new, in its own order
      continue
    }
    for (const { line, bestIdx, bestDist } of matches) {
      if (bestIdx >= 0) {
        const cur = replacement.get(bestIdx)
        if (!cur || bestDist < cur.dist) replacement.set(bestIdx, { line, dist: bestDist })
      } else {
        extras.push(line) // the zoom caught a line the wide shot missed
      }
    }
  }
  const merged = base.map((line, i) => replacement.get(i)?.line ?? line)
  return [...merged, ...extras].join('\n')
}
