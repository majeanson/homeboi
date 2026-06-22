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
  label?: string
  carId?: string | null // only car-taking rides matter to availability; null = carpool/bus
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
}

// The car's status at instant `t`, bounded by the day so "free until" never points
// past the day's end. The single fact the board glance card renders.
export function carStatusAt(busy: CarSpan[], t: number, dayEnd: number): CarStatus {
  const merged = mergeSpans(busy)
  const covering = merged.find((s) => t >= s.start && s.end > t)
  if (covering) return { free: false, until: covering.end, span: covering }
  const next = merged.find((s) => s.start > t && s.start < dayEnd)
  return { free: true, until: next?.start }
}

export interface RideConflict {
  ride: Ride
  span: CarSpan // the busy span the ride falls inside
}

// Rides that collide with a moment the car is already committed — the one-car
// household's core warning ("you planned the groceries for 17 h but the car's at
// work till 18 h"). Only car-taking rides (carId set) are tested; a carpool/bus ride
// never needs our car, so it can never conflict. A ride sitting exactly on a span's
// end instant is fine (the car is just back).
export function rideConflicts(busy: CarSpan[], rides: Ride[]): RideConflict[] {
  const merged = mergeSpans(busy)
  const out: RideConflict[] = []
  for (const ride of rides) {
    if (ride.carId == null) continue
    const span = merged.find((s) => ride.at >= s.start && ride.at < s.end)
    if (span) out.push({ ride, span })
  }
  return out
}
