// The routine sticker wall (OPT-IN — only when « Mode calme » is OFF). A closed set
// of playful emoji stickers a child can place on their wall when they finish a
// routine. Emoji-first so it renders everywhere with zero assets. This array IS the
// server whitelist too — functions/api/routine-stickers.ts imports it rather than
// mirroring it, so the picker can never offer a glyph the POST would 400.
//
// This is a deliberate reward/collection the household enables by turning calm mode
// off; it stays per-child and count-free (the grid IS the display — no number, no
// rank). Shared so the finish-picker and the wall show the same glyphs.
//
// The CATALOG is wide; the finish-picker only ever offers a slice of it (see
// stickersFor). Keep it append-friendly: a placed sticker is stored as its glyph, so
// removing one from this list orphans stickers already on a wall.
export const STICKERS = [
  '⭐', '🌟', '✨', '🌈', '🌞', '🌙', '☁️', '⚡', '❄️', '🔥',
  '🦊', '🐱', '🐶', '🐻', '🐼', '🐨', '🐢', '🐸', '🐧', '🦉',
  '🐝', '🦋', '🐞', '🐬', '🐳', '🦄', '🦕', '🦔', '🐰', '🐷',
  '🌸', '🌻', '🌷', '🌼', '🍀', '🌵', '🍄', '🌳',
  '🍓', '🍊', '🍎', '🍌', '🍇', '🍉', '🥕', '🍪', '🍩', '🧁',
  '❤️', '💚', '💙', '💜', '🧡', '💛',
  '🚀', '🎈', '🏆', '🎵', '🎨', '⚽', '🪁', '🎁', '🧩', '⛵',
] as const

export interface StickerRow {
  id: string
  memberId: string | null
  sticker: string
  routineId: string | null
  createdAt: number
}

// How many stickers the finish-picker offers at once. CONSTANT — the grid is the
// same size every day (a pre-reader's finish screen shouldn't change shape); only
// WHICH glyphs fill it rotates. Matches the size the picker has always shown.
export const STICKER_OFFER = 18

// A tiny deterministic PRNG (FNV-1a → mulberry32). No Math.random: the offer must be
// STABLE for a given (day, routine) — re-rendering the finish screen, or coming back
// to it after a redo, must show the same choices rather than reshuffling under the
// child's thumb.
function seeded(seed: string): () => number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// The stickers on offer for ONE finish: a fixed-size slice of the catalog, drawn
// deterministically from (local day, routine). Same routine, same day → same choices;
// tomorrow, or a different routine today, → a different handful. Over a week the small
// grid feels like a wide collection without ever growing (calm: no unlocking, no
// rarity, no reason to run a routine twice for a better draw — a redo of the SAME
// routine on the SAME day offers the SAME stickers).
//
// `daySec` is local midnight (lib/localDay's todayLocalDay), so the offer turns over at
// household midnight, not UTC.
export function stickersFor(daySec: number, routineId: string | null, offer = STICKER_OFFER): string[] {
  const pool = [...STICKERS]
  const rnd = seeded(`${daySec}:${routineId ?? ''}`)
  // Partial Fisher–Yates: shuffle just enough of the pool to take `offer` distinct glyphs.
  const n = Math.min(offer, pool.length)
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rnd() * (pool.length - i))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  // Re-sort the draw into catalog order: the SET rotates day to day, but the grid stays
  // tidy (colours/animals/fruit grouped) instead of reading as scrambled noise.
  const idx = new Map(STICKERS.map((s, i) => [s, i]))
  return pool.slice(0, n).sort((a, b) => (idx.get(a) ?? 0) - (idx.get(b) ?? 0))
}
