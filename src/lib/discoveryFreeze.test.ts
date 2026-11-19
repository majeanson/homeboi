import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOURS } from './tourContent'

// THE DISCOVERY MACHINERY IS FROZEN (review #43, Marc, 2026-11-18). The guide, the tours and the
// « ? » help registries grew a channel at a time until explaining the app was a second app. Until
// usage data says otherwise, none of them gets a NEW member: a new feature merges a point into an
// existing guide card, extends an existing tour, and adds its help to the registry that already owns
// its surface. These are CEILINGS: they may fall, and raising one is a decision a commit argues for.
// (No count is written in prose anywhere; these constants are the only place.)

const GUIDE_CARDS_MAX = 32
const TOURS_MAX = 10
const HELP_REGISTRIES_MAX = 8

const LIB = import.meta.dirname

const guideCards = () => {
  const s = readFileSync(join(LIB, 'guideContent.ts'), 'utf8')
  return new Set([...s.slice(s.indexOf('export const GUIDE')).matchAll(/^ {4}id: '([a-z0-9-]+)'/gm)].map((m) => m[1])).size
}

describe('the discovery machinery is frozen', () => {
  it(`at most ${GUIDE_CARDS_MAX} guide cards — merge a point into an existing card`, () => {
    const n = guideCards()
    expect(n, 'the guide-card scan found nothing: it broke').toBeGreaterThan(10)
    expect(n).toBeLessThanOrEqual(GUIDE_CARDS_MAX)
  })

  it(`at most ${TOURS_MAX} tours — extend an existing tour`, () => {
    expect(TOURS.length).toBeLessThanOrEqual(TOURS_MAX)
  })

  it(`at most ${HELP_REGISTRIES_MAX} « ? » help registries — add to the one that owns the surface`, () => {
    const n = readdirSync(LIB).filter((f) => f.endsWith('Help.ts')).length
    expect(n, 'the registry scan found nothing: it broke').toBeGreaterThan(3)
    expect(n).toBeLessThanOrEqual(HELP_REGISTRIES_MAX)
  })
})
