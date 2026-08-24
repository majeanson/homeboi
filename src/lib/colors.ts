// The household colour palette — Pip's riso inks. Used for both per-person
// colours (member.avatar_ref) and per-task colours (task.color), so a family
// reads the board by colour at a glance. Kept small and calm; no neon.
export const PALETTE = [
  '#F2A03D', // marigold
  '#E0724E', // terracotta
  '#88A36F', // sage
  '#7BB0C9', // sky
  '#B06A93', // berry
  '#D9842A', // amber
  '#5891AC', // deep sky
  '#95527A', // plum
  '#E0A93D', // honey
  '#6FA38C', // teal-sage
  '#C2563A', // deep terracotta
  '#7E6FB0', // lavender
  '#C98AA0', // rose
  '#5E8C61', // forest
  '#D96E6E', // coral
  '#4F7C8C', // slate blue
]

// The « Maisonnée » voice: with the compact rows (todo / liste / notes) the ONLY
// "who" signal left is the title's tint, so the colours the household fallback
// speaks in must never be a member's colour. These are the CATS inks the un-owned
// rows tint with (list = marigold, chore = sage — keep in sync with lib/cats.ts;
// both sit in PALETTE, hence this reserve list).
export const HOUSEHOLD_INK_COLOURS = ['#F2A03D', '#88A36F']

// First palette colour that is neither reserved for the Maisonnée voice nor worn
// by anyone yet — so each new member lands colour-distinct without anyone having
// to think about it. Every distinct colour taken → cycle the non-reserved set.
export function nextFreeColour(used: string[]): string {
  const taken = new Set([...used, ...HOUSEHOLD_INK_COLOURS].map((c) => c.toLowerCase()))
  const open = PALETTE.filter((c) => !taken.has(c.toLowerCase()))
  if (open.length > 0) return open[0]!
  const pool = PALETTE.filter((c) => !HOUSEHOLD_INK_COLOURS.includes(c))
  return pool[used.length % pool.length]!
}

// Translucent variants of a colour, as 8-digit hex alpha, for tinted fills and
// borders (work over cream or dark). The ramp is named by intent so call sites
// read as design, not magic hex. ONLY valid on a concrete #rrggbb — for a value
// that might be a CSS var, set `--tint` and use color-mix in CSS instead.
export const wash = (hex: string) => hex + '22' //  ~13% — tinted tile fill
export const faint = (hex: string) => hex + '14' //  ~8%  — barely-there fill
export const hairline = (hex: string) => hex + '40' // ~25% — quiet border
export const edge = (hex: string) => hex + '55' //  ~33% — tinted border

// A legible, theme-aware ink tint: mostly the colour, pulled toward the current --ink so
// it stays readable on cream (day) AND dark (night). Use for titles/labels we want
// coloured-but-readable rather than flat black. ADAPTIVE: a dark colour keeps most of its
// hue (~32% ink), but a BRIGHT one (a pale yellow/butter member colour) — which would land
// well under WCAG AA on cream as a flat 68/32 mix — is pulled harder toward ink by its
// relative luminance, so a coloured title stays legible whatever face/slot colour it wears.
export function tintInk(hex: string): string {
  const c = hex.replace('#', '')
  let inkPct = 32
  if (c.length >= 6) {
    const ch = (i: number) => parseInt(c.slice(i, i + 2), 16) / 255
    const lin = (x: number) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
    const L = 0.2126 * lin(ch(0)) + 0.7152 * lin(ch(2)) + 0.0722 * lin(ch(4))
    // Dark/mid colours (L ≤ 0.35) keep ~32% ink; brighter ones ramp up to a 62% cap.
    inkPct = Math.min(62, Math.round(32 + Math.max(0, L - 0.35) * 60))
  }
  return `color-mix(in srgb, ${hex} ${100 - inkPct}%, var(--ink) ${inkPct}%)`
}

// Dark or light ink for text sitting ON a solid colour (e.g. a tinted pill).
// Picks whichever contrasts more, via relative luminance (WCAG). Reads our own
// warm ink/cream tokens so it sits in the palette rather than pure #000/#fff.
export function readableInk(hex: string): string {
  const c = hex.replace('#', '')
  if (c.length < 6) return '#2c2722'
  const ch = (i: number) => parseInt(c.slice(i, i + 2), 16) / 255
  const lin = (x: number) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
  const L = 0.2126 * lin(ch(0)) + 0.7152 * lin(ch(2)) + 0.0722 * lin(ch(4))
  return L > 0.5 ? '#2c2722' : '#fffcf5'
}
