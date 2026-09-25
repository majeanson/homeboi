import { eventMembers } from './eventPeople'
import { pickMomentRoutine, todRank } from './routineTod'
import { timeOfDay } from './timeofday'

// « Pour toi » (PLAN-mots C2, accepted 2026-09-25) — the ONE calm line a picked face reads
// under the board's controls: what is THEIRS right now, stitched from three things that
// already existed apart — a mot waiting (presence, lib/mots waitingMots), their next
// rendez-vous today, the routine of the moment. Presence-based (« un mot t'attend »,
// never « 3 mots ») and ABSENT when nothing is pending: the calm inverse of a
// notification centre. The selectors live here, pure and unit-tested; Board.tsx
// composes the sentence and paints it in the face's tint.

// The soonest still-to-come timed rendez-vous today that concerns THIS face — one of the
// event's people (« Qui »). A family-wide item (no people) is not "yours": the board's own
// « Prochainement » already shows it to everyone.
export function pickMyNext<T extends { start_at: number; all_day: number; member_id?: string | null; passengers?: string | null }>(
  events: T[],
  faceId: string,
  nowSec: number,
): T | null {
  return (
    [...events]
      .filter((e) => !e.all_day && e.start_at >= nowSec && eventMembers(e).includes(faceId))
      .sort((a, b) => a.start_at - b.start_at)[0] ?? null
  )
}

// The routine of the moment among THIS face's routines — the ambient screen's own pick
// (pickMomentRoutine), narrowed to one person, and only when it actually FITS the hour:
// that picker always answers when anything carded exists (it leans toward what is coming),
// which is right for a screensaver cue and wrong for a line that says « routine dodo »
// at breakfast. Kept: the current daypart's routine, or an anytime one; never a later
// daypart's.
export function pickMyRoutine<T extends { memberId?: string | null; timeOfDay: string | null; cards: { icon?: string }[] }>(
  routines: T[],
  faceId: string,
  nowMs: number,
): T | undefined {
  const current = timeOfDay(nowMs)
  const fitting = routines.filter((r) => r.memberId === faceId && todRank(current, r.timeOfDay) <= todRank(current, null))
  return pickMomentRoutine(fitting, nowMs)
}
