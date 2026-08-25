import { describe, it, expect } from 'vitest'
import { PALETTE, HOUSEHOLD_INK_COLOURS, nextFreeColour } from './colors'

// nextFreeColour picks a new member's colour. With the compact rows the title's
// tint is the ONLY "who" signal left, so two members sharing a colour — or a
// member wearing one of the Maisonnée fallback inks — makes the row lie about
// its owner. That makes this pure function load-bearing, not cosmetic.
describe('nextFreeColour', () => {
  it('never hands out a Maisonnée ink, even for the very first member', () => {
    expect(HOUSEHOLD_INK_COLOURS).not.toContain(nextFreeColour([]))
  })

  it('skips the colours already worn, in palette order', () => {
    const first = nextFreeColour([])
    const second = nextFreeColour([first])
    expect(second).not.toBe(first)
    expect(PALETTE.indexOf(second)).toBeGreaterThan(PALETTE.indexOf(first))
  })

  it('matches a taken colour case-insensitively (the DB stores whatever was typed)', () => {
    const first = nextFreeColour([])
    expect(nextFreeColour([first.toUpperCase()])).not.toBe(first)
  })

  it('cycles the non-reserved colours once every distinct one is taken', () => {
    const all = [...PALETTE]
    const cycled = nextFreeColour(all)
    expect(PALETTE).toContain(cycled)
    // Reserved inks stay off the table even in the exhausted fallback.
    expect(HOUSEHOLD_INK_COLOURS).not.toContain(cycled)
  })

  it('keeps cycling to DIFFERENT colours as the household keeps growing', () => {
    const all = [...PALETTE]
    const a = nextFreeColour(all)
    const b = nextFreeColour([...all, a])
    expect(b).not.toBe(a)
  })
})
