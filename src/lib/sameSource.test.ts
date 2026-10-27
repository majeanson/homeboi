import { describe, expect, it } from 'vitest'
import { sameSource } from './recipes'

describe('sameSource — one page, however the link was copied', () => {
  it('ignores www., the host case, the query, the fragment, a trailing slash and http/https', () => {
    expect(sameSource('https://www.Ricardocuisine.com/recettes/4530-tarte/?utm_source=fb#etapes', 'http://ricardocuisine.com/recettes/4530-tarte')).toBe(true)
  })
  it('a different path is a different page', () => {
    expect(sameSource('https://ricardocuisine.com/recettes/4530-tarte', 'https://ricardocuisine.com/recettes/4531-tarte')).toBe(false)
  })
  it('a different host is a different page', () => {
    expect(sameSource('https://zeste.ca/recettes/a', 'https://recettes.qc.ca/recettes/a')).toBe(false)
  })
  it('no link, or no usable link, never matches', () => {
    expect(sameSource(null, null)).toBe(false)
    expect(sameSource('', '')).toBe(false)
    expect(sameSource('pas une adresse', 'pas une adresse')).toBe(false)
  })
})
