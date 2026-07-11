import { describe, it, expect } from 'vitest'
import { initialsFor } from './initials'

describe('initialsFor', () => {
  it('gives a lone first name a single letter', () => {
    expect(initialsFor('Francis')).toBe('F')
  })
  it('uses first + last initials for a full name', () => {
    expect(initialsFor('Francis Cardin')).toBe('FC')
  })
  it('skips middle names — first + last only', () => {
    expect(initialsFor('Marie Anne Tremblay')).toBe('MT')
  })
  it('treats hyphenated names as multi-word', () => {
    expect(initialsFor('Marie-Christine')).toBe('MC')
  })
  it('falls back to ? for an empty or missing name', () => {
    expect(initialsFor('')).toBe('?')
    expect(initialsFor(null)).toBe('?')
    expect(initialsFor(undefined)).toBe('?')
  })
  it('tolerates extra whitespace', () => {
    expect(initialsFor('  Francis   Cardin  ')).toBe('FC')
  })
})
