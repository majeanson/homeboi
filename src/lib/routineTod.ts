// The routine "moment of the day" cue — shared by the builder (picker), the
// Réglages list (tag), the parent overview (badge + grouping) and the kid view
// (surface the matching routine first). A CUE, not a gate: ordering only,
// nothing hides (NFR-CALM — no nagging, no locks).
import type { IconName } from '../components/Icon'
import type { TimeOfDay } from './timeofday'

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

// Parent-overview grouping: plain day order, anytime last.
export function dayOrder(tod: string | null | undefined): number {
  return isRoutineTod(tod) ? ROUTINE_TODS.indexOf(tod) : ROUTINE_TODS.length
}
