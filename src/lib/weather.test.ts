import { describe, expect, it } from 'vitest'
import { weatherIcon, weatherTint, weatherTip, type Weather } from './weather'

// The chip's promise: ONE calm tip, the most actionable first, and silence as the common
// case. The order of the rules IS the behaviour — a freezing downpour says « umbrella »,
// not « coat » — so the cases below sit on the seams between two rules.

const w = (bucket: Weather['bucket'], tempC = 15, isDay = true): Weather => ({ bucket, tempC, isDay })

describe('weatherTip', () => {
  it('says nothing without a reading, and nothing on an ordinary day', () => {
    expect(weatherTip(null)).toBeNull()
    expect(weatherTip(w('clear', 15))).toBeNull()
    expect(weatherTip(w('cloud', 27))).toBeNull()
    expect(weatherTip(w('fog', 3))).toBeNull()
  })

  it('lets what is falling outrank the temperature', () => {
    expect(weatherTip(w('storm', -20))).toBe('storm')
    expect(weatherTip(w('rain', 1))).toBe('umbrella')
    expect(weatherTip(w('drizzle', 30))).toBe('umbrella')
    expect(weatherTip(w('snow', -20))).toBe('snow')
  })

  it('holds its temperature thresholds on the exact degree', () => {
    expect(weatherTip(w('clear', -10))).toBe('bundle')
    expect(weatherTip(w('clear', -9))).toBe('coat')
    expect(weatherTip(w('clear', 2))).toBe('coat')
    expect(weatherTip(w('clear', 3))).toBeNull()
    expect(weatherTip(w('clear', 28))).toBe('hydrate')
  })
})

describe('the clear-night swap', () => {
  it('turns the sun into a moon, and only for a clear sky', () => {
    expect(weatherIcon(w('clear', 15, true))).toBe('sun-bold')
    expect(weatherIcon(w('clear', 15, false))).toBe('moon-stars-bold')
    expect(weatherIcon(w('rain', 15, false))).toBe('cloud-rain-bold')
  })

  it('moves the tint with the icon, so a moon is never marigold', () => {
    expect(weatherTint(w('clear', 15, true))).toBe('var(--marigold-deep)')
    expect(weatherTint(w('clear', 15, false))).toBe('var(--berry-deep)')
    expect(weatherTint(w('storm', 15, false))).toBe('var(--terracotta-deep)')
  })
})
