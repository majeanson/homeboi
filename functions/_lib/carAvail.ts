// « L'auto » availability engine — the pure interval math behind "où est l'auto, et
// est-elle libre ?". Given the car's BUSY spans for a day (a recurring work block
// that holds the car, a planned trip that takes it) plus the day's RIDES (events
// that need the car), it answers three calm questions: when is the car free, is it
// free right now, and does any planned ride collide with a moment the car is already
// spoken for.
//
// Deliberately timezone-agnostic: every input is an absolute unix-seconds instant or
// [start,end) span. The caller is responsible for turning a weekly work-block
// template + per-date overrides into concrete spans for a given LOCAL day (using the
// same local-day helpers recur.ts/month.ts use), so DST never enters here — this
// module is just interval arithmetic and stays trivially testable.
//
// Calm: it surfaces gaps and collisions; it never counts, ranks, or scores. A
// conflict is information ("the car's at work till 18 h"), not an error.

export interface CarSpan {
  start: number // unix seconds (inclusive)
  end: number // unix seconds (exclusive)
  label?: string // "Marc au travail", a trip title…
  holderId?: string | null // who holds the car during this span (member/contact key), if known
}

export interface Ride {
  id: string
  at: number // unix seconds — the ride's start instant
  endAt?: number | null // the rendez-vous' own « Jusqu'à » (events.end_at); absent/null = unknown
  label?: string
  carId?: string | null // only car-taking rides matter to availability; null = doesn't take our car
  holderId?: string | null // the driver (member) — becomes the synthetic span's holder
  allDay?: boolean // an all-day ride holds the car for the whole day, not a window
}

// When a rendez-vous doesn't say how long it lasts, a car-taking one holds the car for
// this default window — long enough that an outing in progress reads as "busy now ·
// back ~X" instead of vanishing the instant it starts. Exported so tests and callers
// share ONE default rather than each picking their own.
export const RIDE_DEFAULT_SEC = 2 * 3600

// The concrete [start, end) a ride occupies on a given local day. The SINGLE place
// that decision is made — an explicit `endAt` wins, an all-day ride holds the whole
// day, otherwise the default window applies. Both rideSpans() and rideConflicts()
// read it, so a ride's footprint can never mean two different things depending on
// which question you asked (it used to: one computed a window, the other a point).
export function rideWindow(r: Ride, dayStart: number, dayEnd: number, defaultSec = RIDE_DEFAULT_SEC): CarSpan {
  if (r.allDay) return { start: dayStart, end: dayEnd, label: r.label, holderId: r.holderId ?? null }
  const end = r.endAt != null && r.endAt > r.at ? r.endAt : r.at + defaultSec
  return { start: r.at, end: Math.min(end, dayEnd), label: r.label, holderId: r.holderId ?? null }
}

// Car-taking rides as synthetic BUSY spans so the status engine can treat an outing
// like any other commitment: an in-progress ride is "busy now" (back ≈ its end), an
// upcoming one tightens "free until", a past one keeps the day "committed". Rides
// that don't take our car (carId null) produce no span. The driver rides along as
// `holderId` so the glance can show "Avec Camille".
export function rideSpans(rides: Ride[], dayStart: number, dayEnd: number, defaultSec = RIDE_DEFAULT_SEC): CarSpan[] {
  return rides.filter((r) => r.carId != null).map((r) => rideWindow(r, dayStart, dayEnd, defaultSec))
}

// Drop empty/inverted spans and merge overlapping or touching ones into a minimal
// ascending set. Touching spans (a.end === b.start) coalesce so "8–12 then 12–17"
// reads as one "8–17" busy block — no phantom 1-second gap at noon.
export function mergeSpans(spans: CarSpan[]): CarSpan[] {
  const valid = spans.filter((s) => s.end > s.start).sort((a, b) => a.start - b.start)
  const out: CarSpan[] = []
  for (const s of valid) {
    const last = out[out.length - 1]
    if (last && s.start <= last.end) {
      // Overlap or touch — extend. Keep the earliest label as the span's identity;
      // the merged block is "busy" regardless of which commitment caused it.
      if (s.end > last.end) last.end = s.end
    } else {
      out.push({ ...s })
    }
  }
  return out
}

// The free windows inside [dayStart, dayEnd) not covered by any busy span. Returns
// the whole window when nothing is busy, and [] when the day is fully committed.
export function freeGaps(busy: CarSpan[], dayStart: number, dayEnd: number): CarSpan[] {
  if (dayEnd <= dayStart) return []
  const merged = mergeSpans(busy)
  const gaps: CarSpan[] = []
  let cursor = dayStart
  for (const s of merged) {
    if (s.end <= dayStart || s.start >= dayEnd) continue // outside the window
    const start = Math.max(s.start, dayStart)
    if (start > cursor) gaps.push({ start: cursor, end: start })
    cursor = Math.max(cursor, Math.min(s.end, dayEnd))
  }
  if (cursor < dayEnd) gaps.push({ start: cursor, end: dayEnd })
  return gaps
}

// The busy span covering instant `t`, or null when the car is free then. A span is
// [start, end): the exact end instant is already free (the car's just back).
export function busyAt(busy: CarSpan[], t: number): CarSpan | null {
  for (const s of mergeSpans(busy)) {
    if (t >= s.start && t < s.end) return s
  }
  return null
}

export interface CarStatus {
  free: boolean
  // When busy: the instant the car frees up (the covering span's end), so the glance
  // can say "prise — revient ~17 h". When free: the next instant it becomes busy
  // again within the day (so "libre jusqu'à 15 h"), or undefined if free all day.
  until?: number
  span?: CarSpan // the covering span when busy
  // The day holds at least one commitment (a busy span OR a car-taking ride), even
  // if the car is free right NOW. Lets the glance say "libre — le reste de la
  // journée" instead of "libre toute la journée" when an outing already happened or
  // is still to come, so the headline never contradicts the rides listed under it.
  committed?: boolean
}

// The car's status at instant `t`, bounded by the day so "free until" never points
// past the day's end. The single fact the board glance card renders. Works purely on
// busy spans — the caller folds car-taking RIDES in by appending rideSpans() to the
// span list (so an in-progress outing reads as "busy now · back ~X", an upcoming one
// tightens "free until", and a past one keeps the day "committed" → "le reste de la
// journée" instead of "toute la journée").
export function carStatusAt(busy: CarSpan[], t: number, dayEnd: number): CarStatus {
  const merged = mergeSpans(busy)
  const committed = merged.length > 0
  const covering = merged.find((s) => t >= s.start && s.end > t)
  if (covering) return { free: false, until: covering.end, span: covering, committed: true }
  const next = merged.find((s) => s.start > t && s.start < dayEnd)
  return { free: true, until: next?.start, committed }
}

export interface RideConflict {
  ride: Ride
  span: CarSpan // the busy span the ride falls inside
}

// Rides that collide with a moment the car is already committed — the one-car
// household's core warning ("you planned the groceries for 17 h but the car's at
// work till 18 h"). Only car-taking rides (carId set) are tested; one that doesn't
// need our car can never conflict.
//
// Tests the ride's WHOLE WINDOW against the busy set, not just its start instant: an
// errand from 7 h to 9 h 30 against an 8–17 work block starts while the car is free
// and drives straight into it, and used to slip through silently. Both edges stay
// half-open, so a ride ENDING exactly when a span starts — or starting exactly when
// one ends — is fine (the car is just back).
export function rideConflicts(
  busy: CarSpan[],
  rides: Ride[],
  dayStart: number,
  dayEnd: number,
  defaultSec = RIDE_DEFAULT_SEC,
): RideConflict[] {
  const merged = mergeSpans(busy)
  const out: RideConflict[] = []
  for (const ride of rides) {
    if (ride.carId == null) continue
    const w = rideWindow(ride, dayStart, dayEnd, defaultSec)
    const span = merged.find((s) => w.start < s.end && s.start < w.end)
    if (span) out.push({ ride, span })
  }
  return out
}
