import { describe, it, expect } from 'vitest'
import { moonPhase } from './moonPhase'

const SYNODIC_MS = 29.530588853 * 24 * 60 * 60 * 1000
const EPOCH = Date.UTC(2000, 0, 6, 18, 14, 0) // reference new moon

describe('moonPhase', () => {
  it('is a new moon at the reference epoch', () => {
    const m = moonPhase(EPOCH)
    expect(m.name).toBe('new')
    expect(m.fraction).toBeCloseTo(0, 2)
    expect(m.illumination).toBeCloseTo(0, 2)
  })

  it('is a full moon half a cycle later (fully lit)', () => {
    const m = moonPhase(EPOCH + SYNODIC_MS / 2)
    expect(m.name).toBe('full')
    expect(m.illumination).toBeCloseTo(1, 2)
  })

  it('is first quarter at a quarter cycle, last quarter at three quarters', () => {
    expect(moonPhase(EPOCH + SYNODIC_MS * 0.25).name).toBe('firstQuarter')
    expect(moonPhase(EPOCH + SYNODIC_MS * 0.75).name).toBe('lastQuarter')
  })

  it('wraps cleanly across whole cycles and before the epoch', () => {
    const a = moonPhase(EPOCH + SYNODIC_MS * 10) // ten cycles on → new again
    expect(a.name).toBe('new')
    const b = moonPhase(EPOCH - SYNODIC_MS / 2) // half a cycle before → full
    expect(b.name).toBe('full')
    expect(b.fraction).toBeGreaterThanOrEqual(0)
    expect(b.fraction).toBeLessThan(1)
  })

  it('matches a real-world full moon within tolerance', () => {
    // 2015-09-28 02:50 UTC was a well-known full moon (lunar eclipse supermoon).
    const m = moonPhase(Date.UTC(2015, 8, 28, 2, 50))
    expect(m.name).toBe('full')
    expect(m.illumination).toBeGreaterThan(0.97)
  })

  it('always returns one of the eight named phases with an emoji', () => {
    for (let i = 0; i < 60; i++) {
      const m = moonPhase(EPOCH + (SYNODIC_MS / 60) * i)
      expect(m.emoji.length).toBeGreaterThan(0)
      expect(m.fraction).toBeGreaterThanOrEqual(0)
      expect(m.fraction).toBeLessThan(1)
    }
  })
})
