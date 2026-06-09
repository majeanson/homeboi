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

// A translucent wash of a colour for tinted tiles (works over cream or dark).
export const wash = (hex: string) => hex + '22'

// A legible, theme-aware ink tint: mostly the colour, pulled toward the current
// --ink so it stays readable on cream (day) AND dark (night). Use for titles and
// labels we want coloured-but-readable rather than flat black.
export const tintInk = (hex: string) => `color-mix(in srgb, ${hex} 68%, var(--ink) 32%)`

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
