// The routine "moment of the day" cue — shared by the builder (picker), the
// Réglages list (tag), the parent overview (badge + grouping) and the kid view
// (surface the matching routine first). A CUE, not a gate: ordering only,
// nothing hides (NFR-CALM — no nagging, no locks).
import type { IconName } from '../components/Icon'
import { timeOfDay, type TimeOfDay } from './timeofday'

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
