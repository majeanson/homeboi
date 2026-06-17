import { describe, expect, it } from 'vitest'
import { computeDayPart } from './timeofday'

// Local-time helper: build a ms timestamp at h:m today, so the boundaries are
// tested against the same getHours()/getMinutes() the function reads.
function at(h: number, m = 0): number {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

describe('computeDayPart (feature #1 ambient drift)', () => {
  it('maps the five day parts', () => {
    expect(computeDayPart(at(6))).toBe('dawn')
    expect(computeDayPart(at(9))).toBe('morning')
    expect(computeDayPart(at(14))).toBe('afternoon')
    expect(computeDayPart(at(19))).toBe('dusk')
    expect(computeDayPart(at(23))).toBe('night')
    expect(computeDayPart(at(2))).toBe('night')
  })

  it('treats boundaries as start-inclusive, end-exclusive', () => {
    expect(computeDayPart(at(5, 0))).toBe('dawn') // dawn opens at 05:00
    expect(computeDayPart(at(4, 59))).toBe('night') // still night a minute before
    expect(computeDayPart(at(7, 0))).toBe('morning') // dawn → morning at 07:00
    expect(computeDayPart(at(12, 0))).toBe('afternoon') // morning → afternoon at noon
    expect(computeDayPart(at(17, 0))).toBe('dusk') // afternoon → dusk at 17:00
    expect(computeDayPart(at(20, 30))).toBe('night') // dusk → night at 20:30
    expect(computeDayPart(at(20, 29))).toBe('dusk') // still dusk a minute before
  })
})
