// Pip's category colour-families, mapped onto Babillard's domains. Each board
// thing (an event, a supper, a chore, a list item, a routine) gets a consistent
// ink colour, a deep variant for the glyph, a pale wash for its tile, and a
// Phosphor icon. This is what gives the board its calm, colour-coded legibility
// without ever being loud — the washes are paper-weight, the inks are printed.
import type { IconName } from '../components/Icon'

export interface Cat {
  icon: IconName
  color: string // the ink (spine, dots)
  deep: string // the glyph on a wash tile
  wash: string // the pale tile background
}

export type CatKey = 'event' | 'meal' | 'chore' | 'list' | 'pantry' | 'routine' | 'birthday' | 'cercle'

// `wash` points at the theme-aware CSS variable (not a static hex) so a tile's
// pale background follows day↔night — night.css darkens every --*-wash. The
// `color`/`deep` inks stay concrete hex: they read fine on both surfaces and
// some callers do colour math (tintInk, `color + '22'`) that needs a real hex.
export const CATS: Record<CatKey, Cat> = {
  event: { icon: 'calendar-blank-bold', color: '#7BB0C9', deep: '#5891AC', wash: 'var(--sky-wash)' }, // sky
  meal: { icon: 'carrot-bold', color: '#E0724E', deep: '#C2563A', wash: 'var(--terracotta-wash)' }, // terracotta
  chore: { icon: 'hand-heart-bold', color: '#88A36F', deep: '#6B8A52', wash: 'var(--sage-wash)' }, // sage
  list: { icon: 'sparkle-bold', color: '#F2A03D', deep: '#D9842A', wash: 'var(--marigold-wash)' }, // marigold
  pantry: { icon: 'carrot-bold', color: '#E0724E', deep: '#C2563A', wash: 'var(--terracotta-wash)' }, // terracotta
  routine: { icon: 'smiley-bold', color: '#B06A93', deep: '#95527A', wash: 'var(--berry-wash)' }, // berry — smiley is the single Routines icon (nav, onboarding, per-item pictos all match)
  birthday: { icon: 'cake-bold', color: '#C45E86', deep: '#95527A', wash: 'var(--berry-wash)' }, // rose — derived birthdays (the cercle accent), cake distinguishes it from routine
  cercle: { icon: 'users-three-bold', color: '#C45E86', deep: '#95527A', wash: 'var(--berry-wash)' }, // rose — Le cercle's ＋ tiles (person/family/connect/group)
}

// The greeting glyph follows the time of day (mirrors lib/timeofday.ts buckets).
export const TOD_ICON: Record<'morning' | 'afternoon' | 'evening', IconName> = {
  morning: 'sun-bold',
  afternoon: 'sun-fill',
  evening: 'moon-stars-bold',
}
