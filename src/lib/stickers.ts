// The routine sticker wall (OPT-IN — only when « Mode calme » is OFF). A closed set
// of playful emoji stickers a child can place on their wall when they finish a
// routine. Emoji-first so it renders everywhere with zero assets. Mirrors the
// server whitelist in functions/api/routine-stickers.ts.
//
// This is a deliberate reward/collection the household enables by turning calm mode
// off; it stays per-child and count-free (the grid IS the display — no number, no
// rank). Shared so the finish-picker and the wall show the same glyphs.
export const STICKERS = [
  '⭐',
  '🌈',
  '🦊',
  '🐱',
  '🐻',
  '🐢',
  '🦋',
  '🌟',
  '🌸',
  '🍓',
  '🍊',
  '❤️',
  '🌞',
  '🌙',
  '☁️',
  '🚀',
  '🎈',
  '🏆',
] as const

export interface StickerRow {
  id: string
  memberId: string | null
  sticker: string
  routineId: string | null
  createdAt: number
}
