// « Le fil du jour » — pure layout for the board's day-ribbon. Given today's timed
// items (events with a clock time) and "now", it returns them in chronological order
// with a clamped vertical gap before each (so a big time jump reads as more breathing
// room — a soft time axis — without runaway height) and the index where the calm
// « maintenant » marker sits (between what's past and what's still to come). Pure +
// unit-tested, like whenparse/carAvail — the component just renders this.

export interface FilItem {
  start_at: number // unix seconds — when it sits on the axis
  until?: number // optional end (a job window): "past" only once it has ENDED, not when it starts
}

export interface FilRow<T> {
  item: T
  past: boolean
  // rem of vertical space before this row (0 for the first) — proportional to the gap
  // since the previous item, clamped so clustered times don't collide and far-apart
  // ones don't blow the card height out.
  gapBefore: number
  // A notable OPEN stretch precedes this item (≥ FREE_GAP_MIN since the previous item's
  // end) → the Fil shows a calm « libre » marker. Uses the previous item's `until` (a job
  // window's end) when present, else its start. Never on the first row.
  freeBefore: boolean
}

export interface FilLayout<T> {
  rows: FilRow<T>[]
  // Where the « maintenant » divider goes, as an index into `rows`: 0 = before
  // everything (the whole day is still ahead), rows.length = after everything (the
  // day's timed items are all behind us), otherwise just before the first upcoming row.
  nowIndex: number
}

// Tuning: the gap between two consecutive rows grows with the hours between them, but
// stays within a calm band. One hour ≈ 0.9rem; never tighter than 0.5rem, never looser
// than 2.5rem.
const MIN_GAP = 0.5
const MAX_GAP = 2.5
const GAP_PER_HOUR = 0.9
// A stretch of ≥ 2 h with nothing on it reads as « libre » — calm breathing room.
const FREE_GAP_MIN = 120

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export function placeFil<T extends FilItem>(items: T[], nowSec: number): FilLayout<T> {
  const sorted = [...items].sort((a, b) => a.start_at - b.start_at)
  const rows: FilRow<T>[] = sorted.map((item, i) => {
    // A plain event is past once it has started; a job window only once it has ended.
    const past = (item.until ?? item.start_at) < nowSec
    const prev = i === 0 ? null : sorted[i - 1]
    const gapBefore = prev == null ? 0 : clamp(((item.start_at - prev.start_at) / 3600) * GAP_PER_HOUR, MIN_GAP, MAX_GAP)
    // Gap measured from the previous item's END (a job's `until`) to this one's start.
    const freeBefore = prev != null && item.start_at - (prev.until ?? prev.start_at) >= FREE_GAP_MIN * 60
    return { item, past, gapBefore, freeBefore }
  })
  // The marker sits just before the first item that hasn't started yet. If they've all
  // started it falls after the last row; if none have, before the first.
  let nowIndex = rows.findIndex((r) => r.item.start_at >= nowSec)
  if (nowIndex === -1) nowIndex = rows.length
  return { rows, nowIndex }
}
