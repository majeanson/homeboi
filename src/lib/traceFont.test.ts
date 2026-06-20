import { describe, it, expect } from 'vitest'
import { measureTrace, wrapTrace } from './traceFont'

describe('traceFont', () => {
  it('measures wider for more letters; empty is zero', () => {
    expect(measureTrace('AA')).toBeGreaterThan(measureTrace('A'))
    expect(measureTrace('')).toBe(0)
  })

  it('wraps words onto multiple rows when they exceed the width', () => {
    const rows = wrapTrace('Mama Papa Lola', measureTrace('Mama') + 0.1)
    expect(rows.length).toBe(3)
    expect(rows).toEqual(['Mama', 'Papa', 'Lola'])
  })

  it('keeps a single over-long word whole (never splits mid-word)', () => {
    expect(wrapTrace('Supercalifragilistic', 1)).toEqual(['Supercalifragilistic'])
  })

  it('returns no rows for blank input', () => {
    expect(wrapTrace('   ', 10)).toEqual([])
  })
})
