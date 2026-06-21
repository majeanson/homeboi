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
  it('maps every day part', () => {
    expect(computeDayPart(at(6, 30))).toBe('dawn')
    expect(computeDayPart(at(9))).toBe('morning')
    expect(computeDayPart(at(12))).toBe('noon')
    expect(computeDayPart(at(15))).toBe('afternoon')
    expect(computeDayPart(at(18))).toBe('dusk')
    expect(computeDayPart(at(23))).toBe('night')
    expect(computeDayPart(at(2))).toBe('night')
  })

  it('steps through the twilight rungs on both the dawn rise and the dusk fall', () => {
    // Morning rise: night → deep-twilight → twilight → dawn.
    expect(computeDayPart(at(4, 45))).toBe('deep-twilight')
    expect(computeDayPart(at(5, 30))).toBe('twilight')
    // Evening fall: dusk → twilight → deep-twilight → night.
    expect(computeDayPart(at(19, 0))).toBe('twilight')
    expect(computeDayPart(at(19, 45))).toBe('deep-twilight')
  })

  it('treats boundaries as start-inclusive, end-exclusive', () => {
    expect(computeDayPart(at(4, 30))).toBe('deep-twilight') // rise opens at 04:30
    expect(computeDayPart(at(4, 29))).toBe('night') // still night a minute before
    expect(computeDayPart(at(5, 15))).toBe('twilight') // deep-twilight → twilight
    expect(computeDayPart(at(6, 0))).toBe('dawn') // twilight → dawn at 06:00
    expect(computeDayPart(at(7, 0))).toBe('morning') // dawn → morning at 07:00
    expect(computeDayPart(at(11, 0))).toBe('noon') // morning → noon at 11:00
    expect(computeDayPart(at(14, 0))).toBe('afternoon') // noon → afternoon at 14:00
    expect(computeDayPart(at(17, 0))).toBe('dusk') // afternoon → dusk at 17:00
    expect(computeDayPart(at(18, 45))).toBe('twilight') // dusk → twilight at 18:45
    expect(computeDayPart(at(19, 30))).toBe('deep-twilight') // twilight → deep-twilight
    expect(computeDayPart(at(20, 15))).toBe('night') // deep-twilight → night at 20:15
    expect(computeDayPart(at(20, 14))).toBe('deep-twilight') // still deep-twilight before
  })
})
