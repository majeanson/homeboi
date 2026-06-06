import { describe, it, expect } from 'vitest'
import { wmoBucket } from './weather'

describe('wmoBucket', () => {
  it('maps clear / mainly-clear', () => {
    expect(wmoBucket(0)).toBe('clear')
    expect(wmoBucket(1)).toBe('clear')
  })
  it('maps cloud', () => {
    expect(wmoBucket(2)).toBe('cloud')
    expect(wmoBucket(3)).toBe('cloud')
  })
  it('maps fog', () => {
    expect(wmoBucket(45)).toBe('fog')
    expect(wmoBucket(48)).toBe('fog')
  })
  it('maps drizzle / rain / showers', () => {
    expect(wmoBucket(51)).toBe('drizzle')
    expect(wmoBucket(63)).toBe('rain')
    expect(wmoBucket(81)).toBe('rain')
  })
  it('maps snow', () => {
    expect(wmoBucket(73)).toBe('snow')
    expect(wmoBucket(86)).toBe('snow')
  })
  it('maps thunderstorm', () => {
    expect(wmoBucket(95)).toBe('storm')
    expect(wmoBucket(99)).toBe('storm')
  })
  it('falls back to cloud for unknown codes', () => {
    expect(wmoBucket(42)).toBe('cloud')
  })
})
