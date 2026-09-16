// The routine "moment of the day" cue — shared by the builder (picker), the
// Réglages list (tag), the parent overview (badge + grouping) and the kid view
// (surface the matching routine first). A CUE, not a gate: ordering only,
// nothing hides (NFR-CALM — no nagging, no locks).
import type { IconName } from '../components/Icon'
import { timeOfDay, type TimeOfDay } from './timeofday'
import { readableInk } from './colors'

export type RoutineTod = 'morning' | 'afternoon' | 'evening'
export const ROUTINE_TODS: RoutineTod[] = ['morning', 'afternoon', 'evening']

// The moment cue as a shared Phosphor icon (was an emoji). One source of truth
// for the builder chip, the Réglages tag, the parent badge and the kid badge.
export const TOD_ICON: Record<RoutineTod, IconName> = {
  morning: 'sun-horizon-bold',
  afternoon: 'sun-bold',
  evening: 'moon-stars-bold',
}

// A warm→cool colour cue to go with the glyph (theme-aware CSS vars), so the
// moment reads at a glance even before the word: sunrise marigold, midday sun,
// evening berry/indigo.
export const TOD_TINT: Record<RoutineTod, string> = {
  morning: 'var(--marigold-deep)',
  afternoon: 'var(--marigold)',
  evening: 'var(--berry-deep)',
}

export const isRoutineTod = (v: unknown): v is RoutineTod =>
  v === 'morning' || v === 'afternoon' || v === 'evening'

// The ink that READS on each moment tint. `readableInk` measures a hex; these are
// theme VARS, unknowable at render — so the answer is written beside the colour it
// answers for: the two -deep tints are dark grounds (cream ink), plain marigold is
// the pale accent (the warm-dark ink, exactly what `--accent-ink` is for). Same
// constants readableInk picks between, so a pill looks the same whichever path chose.
export const TOD_TINT_INK: Record<RoutineTod, string> = {
  morning: '#fffcf5',
  afternoon: '#2c2722',
  evening: '#fffcf5',
}

/** The ink for a « Faire » pill painted on `tint`: measured when the tint is a member
 *  hex, looked up when it is a moment var. The board's « Prochaine routine » pill
 *  hard-coded white and measured 2.03:1 on a marigold member (axe, wide pass
 *  2026-09-16) — the Maison card had already learned this (`routine-card__run`), but
 *  only for hexes; this is the one helper both read now. */
export function tintInk(tint: string, tod: string | null | undefined): string {
  if (tint.startsWith('#')) return readableInk(tint)
  return isRoutineTod(tod) ? TOD_TINT_INK[tod] : '#fffcf5'
}

// Kid-view ordering for the CURRENT moment: the matching bucket first, then
// "anytime", then the rest in day order wrapping forward (afternoon evenings
// lean toward what's coming, not what's past).
const RANK: Record<TimeOfDay, (RoutineTod | 'any')[]> = {
  morning: ['morning', 'any', 'afternoon', 'evening'],
  afternoon: ['afternoon', 'any', 'evening', 'morning'],
  evening: ['evening', 'any', 'morning', 'afternoon'],
}
export function todRank(current: TimeOfDay, tod: string | null | undefined): number {
  return RANK[current].indexOf(isRoutineTod(tod) ? tod : 'any')
}

// The ONE "which routine fits right now" rule — the best-ranked routine that
// actually has cards for the current moment (todRank leans toward what's coming).
// Shared so the idle screensaver and the board's « Prochaine routine » card can't
// drift apart. Generic over any routine-shaped row (needs timeOfDay + cards). A
// cue, never a nag: returns undefined when nothing carded exists.
export function pickMomentRoutine<T extends { timeOfDay: string | null; cards: { icon?: string }[] }>(
  routines: T[],
  now: number,
): T | undefined {
  const current = timeOfDay(now)
  return [...routines]
    .filter((r) => r.cards.length > 0)
    .sort((x, y) => todRank(current, x.timeOfDay) - todRank(current, y.timeOfDay))[0]
}
