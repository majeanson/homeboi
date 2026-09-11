import { describe, expect, it } from 'vitest'
import { cleanFlippLang, resolveFlippLang } from './flippLang'

// The language a Flipp lookup runs in decides WHICH flyer ids Babillard stages, and
// therefore whether the Flipp app recognizes a pasted clipping (functions/_lib/flippLang.ts).
describe('flippLang — the Flipp app language, ahead of the UI language', () => {
  it('validates to fr | en, nothing else', () => {
    expect(cleanFlippLang('fr')).toBe('fr')
    expect(cleanFlippLang('en')).toBe('en')
    for (const bad of ['fr-ca', 'EN', '', null, undefined, 0, {}, 'es']) expect(cleanFlippLang(bad)).toBeNull()
  })

  it('an explicit ?lang wins over everything (a request that asks is answered)', () => {
    expect(resolveFlippLang('en', 'fr', 'fr')).toBe('en')
    expect(resolveFlippLang('fr', 'en', 'en')).toBe('fr')
  })

  it("the household's Flipp-app language beats the UI language (Marc: French Babillard, English Flipp app)", () => {
    expect(resolveFlippLang(null, 'en', 'fr')).toBe('en')
    expect(resolveFlippLang(undefined, 'fr', 'en')).toBe('fr')
  })

  it('unset → the UI language, exactly the pre-2026-09-11 behaviour', () => {
    expect(resolveFlippLang(null, null, 'fr')).toBe('fr')
    expect(resolveFlippLang('bogus', null, 'en')).toBe('en')
  })
})
