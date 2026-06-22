import { describe, it, expect } from 'vitest'
import { guestKindAllows } from './guestScope'

// The privacy boundary: a curated share link (sitter / welcome) may read ONLY its
// own curated endpoint + whoami + opaque-key images. A showcase link reads anything
// (it's the read-only Démo hub). worker/index.ts 403s anything this rejects.
describe('guestKindAllows', () => {
  const sensitive = ['board', 'cercle', 'list', 'household', 'members', 'meals', 'recipes', 'notes']
  const curatedOk = ['guest/window', 'guest/whoami', 'img/abc123', 'img']

  it('showcase reads everything', () => {
    for (const p of [...sensitive, ...curatedOk, 'anything']) {
      expect(guestKindAllows('showcase', p)).toBe(true)
    }
  })

  for (const kind of ['sitter', 'welcome', 'family'] as const) {
    it(`${kind} reaches only its curated endpoint + whoami + img`, () => {
      for (const p of curatedOk) expect(guestKindAllows(kind, p)).toBe(true)
    })

    it(`${kind} is blocked from the full household`, () => {
      for (const p of sensitive) expect(guestKindAllows(kind, p)).toBe(false)
      // guest/start (minting more links) is operator-only and not allowlisted either.
      expect(guestKindAllows(kind, 'guest/start')).toBe(false)
    })
  }
})
