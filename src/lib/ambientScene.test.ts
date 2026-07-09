import { describe, expect, it } from 'vitest'
import { pickNextEventToday, breathAt, burnInDrift, SAVER_NEXTUP, BOARD_NEXTUP } from './ambientScene'

// « Un seul moteur ambiant » (C-13, bmad/10) — pure selectors shared by the
// screensaver/cast ambient scene AND boardModel's « Prochainement ». These lock
// the exact E-37 (burn-in drift) / F-47 (hourly breath) math extracted verbatim
// from the pre-refactor AmbientScreen, plus the two next-up presets' grace
// boundaries (byte-identical behaviour is the whole point of the extraction).

interface Ev {
  id: string
  start_at: number
  all_day: number
}
const ev = (id: string, start_at: number, all_day = 0): Ev => ({ id, start_at, all_day })

// Local-time helper (matches lib/timeofday.test.ts's pattern): build a ms
// timestamp at h:m:s TODAY, so boundaries are tested against the same
// getHours()/getMinutes()/getSeconds() breathAt/burnInDrift read.
function at(h: number, m = 0, s = 0): number {
  const d = new Date()
  d.setHours(h, m, s, 0)
  return d.getTime()
}

describe('pickNextEventToday', () => {
  const NOW = 1_000_000 // an arbitrary anchor second

  it('SAVER_NEXTUP: an all-day item counts as next regardless of the clock', () => {
    const events = [ev('all-day', NOW - 5000, 1), ev('later-today', NOW + 3600)]
    // Sorted ascending by start_at — the all-day row's (earlier) start_at wins,
    // exactly like the pre-refactor AmbientScreen's inline filter/sort.
    expect(pickNextEventToday(events, NOW, SAVER_NEXTUP)?.id).toBe('all-day')
  })

  it('SAVER_NEXTUP: zero grace — a timed event exactly now counts, one second ago does not', () => {
    expect(pickNextEventToday([ev('now', NOW)], NOW, SAVER_NEXTUP)?.id).toBe('now')
    expect(pickNextEventToday([ev('just-past', NOW - 1)], NOW, SAVER_NEXTUP)).toBeNull()
  })

  it('SAVER_NEXTUP: picks the soonest still-to-come timed event when no all-day row exists', () => {
    const events = [ev('later', NOW + 7200), ev('sooner', NOW + 60)]
    expect(pickNextEventToday(events, NOW, SAVER_NEXTUP)?.id).toBe('sooner')
  })

  it('BOARD_NEXTUP: an all-day item never counts as next', () => {
    const events = [ev('all-day', NOW - 5000, 1)]
    expect(pickNextEventToday(events, NOW, BOARD_NEXTUP)).toBeNull()
  })

  it('BOARD_NEXTUP: grace boundary — exactly 1800s ago still counts, 1801s ago does not', () => {
    expect(pickNextEventToday([ev('edge', NOW - 1800)], NOW, BOARD_NEXTUP)?.id).toBe('edge')
    expect(pickNextEventToday([ev('too-old', NOW - 1801)], NOW, BOARD_NEXTUP)).toBeNull()
  })

  it('returns null on an empty list', () => {
    expect(pickNextEventToday([], NOW, SAVER_NEXTUP)).toBeNull()
    expect(pickNextEventToday([], NOW, BOARD_NEXTUP)).toBeNull()
  })
})

describe('breathAt (F-47 hourly breath — exact-value lock)', () => {
  it('is true inside the first 20s of the hour', () => {
    expect(breathAt(at(9, 0, 0))).toBe(true)
    expect(breathAt(at(9, 0, 10))).toBe(true)
    expect(breathAt(at(9, 0, 19))).toBe(true)
  })

  it('is false at and after the 20s mark', () => {
    expect(breathAt(at(9, 0, 20))).toBe(false)
    expect(breathAt(at(9, 0, 59))).toBe(false)
  })

  it('is false any other minute, even at :00 seconds', () => {
    expect(breathAt(at(9, 1, 0))).toBe(false)
    expect(breathAt(at(9, 30, 5))).toBe(false)
    expect(breathAt(at(23, 59, 19))).toBe(false)
  })

  it('fires again at the next hour', () => {
    expect(breathAt(at(10, 0, 0))).toBe(true)
  })
})

describe('burnInDrift (E-37 burn-in care — exact-value lock)', () => {
  // drift = hours*60+minutes; x = ((drift%5)-2)*2; y = ((floor(drift/5)%5)-2)*2 —
  // verbatim from the pre-refactor AmbientScreen inline math.
  it('is (0,0) at midnight (drift=0)', () => {
    expect(burnInDrift(at(0, 0))).toEqual({ x: -4, y: -4 })
  })

  it('pins exact values across a spread of times', () => {
    // 09:00 → drift = 540 → 540%5=0 → x=(0-2)*2=-4; floor(540/5)=108, 108%5=3 → y=(3-2)*2=2
    expect(burnInDrift(at(9, 0))).toEqual({ x: -4, y: 2 })
    // 09:01 → drift = 541 → 541%5=1 → x=(1-2)*2=-2; floor(541/5)=108, 108%5=3 → y=2
    expect(burnInDrift(at(9, 1))).toEqual({ x: -2, y: 2 })
    // 12:34 → drift = 754 → 754%5=4 → x=(4-2)*2=4; floor(754/5)=150, 150%5=0 → y=(0-2)*2=-4
    expect(burnInDrift(at(12, 34))).toEqual({ x: 4, y: -4 })
    // 23:59 → drift = 1439 → 1439%5=4 → x=4; floor(1439/5)=287, 287%5=2 → y=(2-2)*2=0
    expect(burnInDrift(at(23, 59))).toEqual({ x: 4, y: 0 })
  })

  it('completes a 5×5 loop (25 minutes) back to the same offset', () => {
    expect(burnInDrift(at(9, 0))).toEqual(burnInDrift(at(9, 25)))
  })

  it('is bounded to +/-4px on both axes', () => {
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 7) {
        const { x, y } = burnInDrift(at(h, m))
        expect(x).toBeGreaterThanOrEqual(-4)
        expect(x).toBeLessThanOrEqual(4)
        expect(y).toBeGreaterThanOrEqual(-4)
        expect(y).toBeLessThanOrEqual(4)
      }
    }
  })
})
