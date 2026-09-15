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
// ALPHA FILLS COMPOSITE OVER THEIR CONTAINER, and `tintInk` below does not know that.
// An 8% fill on `--surface` is what the ink ramp was measured against; the same fill on a
// tinted column is a darker background the ink was never sized for. That is not
// hypothetical: the history meal chip passed on six days and failed on TODAY at 4.4:1,
// same code, because `.kitchen__day.is-today` paints `--terracotta-wash` behind it
// (axe, 2026-09-15). If you pair `faint()` with `tintInk()` on a surface whose background
// you do not control, use `color-mix(in srgb, <c> 8%, var(--surface))` instead — opaque,
// theme-aware, identical wherever `faint()` was already correct.
export const faint = (hex: string) => hex + '14' //  ~8%  — barely-there fill
export const hairline = (hex: string) => hex + '40' // ~25% — quiet border
export const edge = (hex: string) => hex + '55' //  ~33% — tinted border

// A legible, theme-aware ink tint: mostly the colour, pulled toward the current --ink so
// it stays readable on cream (day) AND dark (night). Use for titles/labels we want
// coloured-but-readable rather than flat black. ADAPTIVE: a dark colour keeps most of its
// hue (~32% ink), but a BRIGHT one (a pale yellow/butter member colour) — which would land
// well under WCAG AA on cream as a flat 68/32 mix — is pulled harder toward ink by its
// relative luminance, so a coloured title stays legible whatever face/slot colour it wears.
// The ramp, re-tuned 2026-09-15 against the WHOLE palette rather than by eye. The old
// 32 / 60 / 62 left the brighter tints short of AA as small text — a marigold list-row
// title measured 4.02:1 on cream, and butter 3.98 — because the floor and slope were
// picked before anything measured them.
//
// Tuned TWICE, and the second time is the lesson: 38 / 95 / 72 cleared 4.5:1 on cream,
// and cream is NOT the worst ground. `chipTint` (and every tinted pill like it) pairs
// tintInk(hex) with wash(hex) — the same hue at ~13% over the page — which is DARKER
// than cream, so a dark ink contrasts LESS there, not more. A recipe tag chip came back
// at 4.37:1. 45 / 100 / 78 clears the tint-on-its-own-wash pairing at 4.84:1.
// colors.test.ts recomputes both pairings over PALETTE, so re-tuning stays a
// measurement rather than a guess.
const INK_FLOOR_PCT = 45
const INK_SLOPE = 100
const INK_CAP_PCT = 78

export function tintInk(hex: string): string {
  const c = hex.replace('#', '')
  let inkPct = INK_FLOOR_PCT
  if (c.length >= 6) {
    const L = relLuminance(hex)
    // Dark/mid colours (L ≤ 0.35) keep the floor; brighter ones ramp up to the cap.
    inkPct = Math.min(INK_CAP_PCT, Math.round(INK_FLOOR_PCT + Math.max(0, L - 0.35) * INK_SLOPE))
  }
  return `color-mix(in srgb, ${hex} ${100 - inkPct}%, var(--ink) ${inkPct}%)`
}

/**
 * The ink share `tintInk` would use for `hex` — exported ONLY so its test can
 * recompute the resulting colour and check the contrast. The function itself returns a
 * `color-mix()` string on purpose (so `var(--ink)` follows the theme), which means the
 * result cannot be measured in JS without this.
 */
export function tintInkPct(hex: string): number {
  const c = hex.replace('#', '')
  if (c.length < 6) return INK_FLOOR_PCT
  return Math.min(INK_CAP_PCT, Math.round(INK_FLOOR_PCT + Math.max(0, relLuminance(hex) - 0.35) * INK_SLOPE))
}

// Dark or light ink for text sitting ON a solid colour (e.g. a tinted pill).
// Picks whichever contrasts more, via relative luminance (WCAG). Reads our own
// warm ink/cream tokens so it sits in the palette rather than pure #000/#fff.
//
// IT NOW DOES WHAT THAT SENTENCE SAYS (2026-09-15). It used to threshold luminance at
// 0.5 and return the CREAM below it — but 0.5 is not the crossover between these two
// inks. For our warm ink (#2c2722) against cream (#fffcf5) it sits near 0.18, and
// everything in between is a mid-tone where the dark ink wins comfortably and the
// light one was handed back anyway. ELEVEN of the palette's colours were getting the
// worse ink: marigold at 2.08:1 where dark gives 6.95:1, sky at 2.30 where dark gives
// 6.26. Nothing detected it because the only checkable claim lived in this comment.
//
// So: compute both ratios and return the winner. No threshold to get wrong, and it
// stays correct if either token is ever re-picked. Held by a property test over the
// WHOLE palette (colors.test.ts), not a table of blessed answers.
const DARK_INK = '#2c2722'
const CREAM_INK = '#fffcf5'

function relLuminance(hex: string): number {
  const c = hex.replace('#', '')
  const ch = (i: number) => parseInt(c.slice(i, i + 2), 16) / 255
  const lin = (x: number) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(ch(0)) + 0.7152 * lin(ch(2)) + 0.0722 * lin(ch(4))
}

/** WCAG contrast between two #rrggbb colours. 1 = identical, 21 = black on white. */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [relLuminance(a), relLuminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

export function readableInk(hex: string): string {
  const c = hex.replace('#', '')
  if (c.length < 6) return DARK_INK
  return contrastRatio(DARK_INK, hex) >= contrastRatio(CREAM_INK, hex) ? DARK_INK : CREAM_INK
}

/**
 * The inline style for scoping a surface to a SECTION TINT (`SECTION_TINT[...].ink`).
 *
 * Three components re-pointed `--accent` to a themed tint and stopped there — and
 * `--accent-ink` is not a neutral: core.css defines it as "warm-dark text on marigold".
 * Marigold is pale, so a warm-dark ink is right for it; a `-ink` tier colour is not
 * pale, and Réglages' active tab pill ended up painting #3a2a12 on #a24830 — 2.3:1, on
 * the control that says which tab you are in (axe, 2026-09-15).
 *
 * `--paper` is the answer that needs no new token and no branching: it is cream by day
 * and near-black at night, which is exactly the flip this needs, because the `-ink`
 * tier itself flips the other way (dark on a pale day ground, light on a dark night
 * one). Held by e2e/contrast.spec.ts in both themes.
 *
 * Returns undefined for an absent tint so a call site can spread it straight into
 * `style` and keep the untinted default.
 */
export function tintScope(tint: string | undefined): Record<string, string> | undefined {
  return tint ? { '--accent': tint, '--accent-ink': 'var(--paper)' } : undefined
}
