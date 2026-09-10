import { describe, it, expect, afterEach, vi } from 'vitest'
import { installFixtureFetch } from './devFixtures'

// The gallery's « Données : Exemple » switch. Its only real logic is the matching —
// which fixture answers which request — and the rule that a specimen may not write to
// the household whose browser happens to be showing the gallery.
//
// Worth its own test because both failure modes are SILENT: a mis-match serves the
// wrong card's payload (which renders as "this component is broken"), and a leaked
// write reaches a real household with no error anywhere.

const ROUTES = {
  board: { scope: 'today' },
  cercle: { people: 1 },
  'cercle/import': { preview: true },
  meals: { days: [] },
}

const original = window.fetch
afterEach(() => {
  window.fetch = original
})

async function body(res: Response): Promise<unknown> {
  return JSON.parse(await res.text())
}

describe('the gallery fixture fetch', () => {
  it('serves a GET from the fixture for that path', async () => {
    installFixtureFetch(ROUTES)
    expect(await body(await fetch('/api/board'))).toEqual({ scope: 'today' })
  })

  it('ignores the query string', async () => {
    installFixtureFetch(ROUTES)
    expect(await body(await fetch('/api/meals?weekStart=123&windowDays=7'))).toEqual({ days: [] })
  })

  it('prefers the LONGEST match', async () => {
    // `cercle/import` must not resolve to `cercle`. A prefix match that takes the first
    // hit gets this wrong, and the import scene would render the directory's payload.
    installFixtureFetch(ROUTES)
    expect(await body(await fetch('/api/cercle/import'))).toEqual({ preview: true })
    expect(await body(await fetch('/api/cercle'))).toEqual({ people: 1 })
  })

  it('answers an unknown path with an empty object rather than falling through', async () => {
    // Falling through would hit the REAL household from a gallery claiming « Exemple ».
    const real = vi.fn()
    window.fetch = real as unknown as typeof window.fetch
    installFixtureFetch(ROUTES)
    expect(await body(await fetch('/api/something-new'))).toEqual({})
    expect(real).not.toHaveBeenCalled()
  })

  it('never lets a write through', async () => {
    const real = vi.fn()
    window.fetch = real as unknown as typeof window.fetch
    installFixtureFetch(ROUTES)
    for (const method of ['POST', 'PATCH', 'DELETE', 'PUT']) {
      expect(await body(await fetch('/api/board', { method }))).toEqual({ ok: true })
    }
    expect(real, 'a specimen must not write to the household showing the gallery').not.toHaveBeenCalled()
  })

  it('leaves everything that is not /api/* alone', async () => {
    const real = vi.fn(async () => new Response('asset'))
    window.fetch = real as unknown as typeof window.fetch
    installFixtureFetch(ROUTES)
    await fetch('/assets/index.js')
    expect(real).toHaveBeenCalledTimes(1)
  })

  it('restores the real fetch when switched off', async () => {
    const real = vi.fn(async () => new Response('{}'))
    window.fetch = real as unknown as typeof window.fetch
    const off = installFixtureFetch(ROUTES)
    off()
    await fetch('/api/board')
    expect(real, 'flipping the switch back must hand the household its own data again').toHaveBeenCalledTimes(1)
  })
})
