import { describe, it, expect } from 'vitest'
import { guestKindAllows } from './guestScope'

// The privacy boundary: a curated share link (sitter / welcome) may read ONLY its
// own curated endpoint + whoami + opaque-key images. A showcase link reads anything
// (it's the read-only Démo hub). worker/index.ts 403s anything this rejects.
describe('guestKindAllows', () => {
  const sensitive = ['board', 'cercle', 'list', 'household', 'members', 'meals', 'recipes', 'notes']
  const curatedOk = ['guest/window', 'guest/whoami', 'img/abc123', 'img']

  it('showcase reads the hub (incl. carnets/trips) but is denied the two sensitive carnet endpoints', () => {
    for (const p of [...sensitive, ...curatedOk, 'anything', 'carnets', 'trips']) {
      expect(guestKindAllows('showcase', p)).toBe(true)
    }
    // The house map (spare-key/alarm locations) + service-invoice amounts stay OUT of the Démo view.
    expect(guestKindAllows('showcase', 'home-pins')).toBe(false)
    expect(guestKindAllows('showcase', 'care-log')).toBe(false)
  })

  it('showcase is read-only: denied every guest write/mint path (default-deny for writes)', () => {
    for (const p of ['guest/start', 'guest/intake-submit', 'guest/intake-media', 'guest/postbox-submit', 'guest/postbox-media']) {
      expect(guestKindAllows('showcase', p)).toBe(false)
    }
    // …but still reaches its own read-side guest endpoints.
    expect(guestKindAllows('showcase', 'guest/whoami')).toBe(true)
    expect(guestKindAllows('showcase', 'guest/window')).toBe(true)
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

  // The 'intake' kind is the only WRITABLE link, but its reach is still tightly
  // scoped: its greeting endpoint, whoami, images, and its ONE submit path.
  it('intake reaches only whoami / window / intake-submit / img', () => {
    for (const p of ['guest/whoami', 'guest/window', 'guest/intake-submit', 'img', 'img/x']) {
      expect(guestKindAllows('intake', p)).toBe(true)
    }
  })

  it('intake is blocked from the household AND from minting links', () => {
    for (const p of [...sensitive, 'guest/start']) {
      expect(guestKindAllows('intake', p)).toBe(false)
    }
  })

  // 'postbox' (« La boîte aux lettres ») is the second writable link: its greeting,
  // whoami, images, and its TWO write paths (submit + media stage) — nothing else.
  it('postbox reaches only whoami / window / postbox-submit / postbox-media / img', () => {
    for (const p of ['guest/whoami', 'guest/window', 'guest/postbox-submit', 'guest/postbox-media', 'img', 'img/x']) {
      expect(guestKindAllows('postbox', p)).toBe(true)
    }
  })

  it('postbox is blocked from the household, from minting links, and from intake paths', () => {
    for (const p of [...sensitive, 'guest/start', 'guest/intake-submit']) {
      expect(guestKindAllows('postbox', p)).toBe(false)
    }
  })
})
