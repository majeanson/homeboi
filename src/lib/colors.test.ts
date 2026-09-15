import { describe, it, expect } from 'vitest'
import { PALETTE, HOUSEHOLD_INK_COLOURS, nextFreeColour, readableInk, tintInk, tintInkPct } from './colors'

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

// `readableInk` picks the ink for text sitting ON a solid colour — a tinted pill, a
// checked row, a measure chip. Its doc comment says it "picks whichever contrasts
// more", and for most of this palette it did the opposite (2026-09-15).
//
// The implementation thresholded relative luminance at 0.5 and handed back the LIGHT
// ink below it. But 0.5 is not the crossover between a dark and a light ink — for our
// warm ink (#2c2722) and cream (#fffcf5) it sits near 0.18. Everything between those
// two numbers is a mid-tone where dark wins comfortably and light was chosen anyway:
// marigold got 1.99:1 where dark would have given 7.26:1.
//
// So this is a property test, not a table of blessed answers: for every colour the
// household can actually wear, the ink that comes back must be the one that contrasts
// MORE. That is the promise in the comment, and it cannot drift again.
describe('readableInk', () => {
  const lin = (x: number) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
  const lum = (hex: string) => {
    const c = hex.replace('#', '')
    const ch = (i: number) => parseInt(c.slice(i, i + 2), 16) / 255
    return 0.2126 * lin(ch(0)) + 0.7152 * lin(ch(2)) + 0.0722 * lin(ch(4))
  }
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)]
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
  }
  const DARK = '#2c2722'
  const CREAM = '#fffcf5'

  it('always returns the ink that contrasts MORE — the whole palette, not a sample', () => {
    const worse: string[] = []
    for (const colour of PALETTE) {
      const picked = readableInk(colour)
      const best = ratio(DARK, colour) >= ratio(CREAM, colour) ? DARK : CREAM
      if (picked.toLowerCase() !== best.toLowerCase()) {
        worse.push(
          `${colour}: picked ${picked} (${ratio(picked, colour).toFixed(2)}:1) over ${best} (${ratio(best, colour).toFixed(2)}:1)`,
        )
      }
    }
    expect(worse, 'readableInk must pick the higher-contrast ink:\n' + worse.join('\n')).toEqual([])
  })

  it('clears WCAG AA on the mid-tones that were failing', () => {
    // Marigold and sage carry the routine cards' « Faire » button, which measured
    // 2.03:1 and 2.48:1 with a hard-coded white.
    for (const colour of ['#eaa959', '#96ab81']) {
      expect(ratio(readableInk(colour), colour)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('still flips to cream on a genuinely dark colour', () => {
    // The other half of the promise: this is not "always dark".
    expect(readableInk('#1b1712').toLowerCase()).toBe(CREAM)
  })

  it('a malformed value degrades to the dark ink rather than throwing', () => {
    expect(() => readableInk('')).not.toThrow()
    expect(readableInk('#abc').toLowerCase()).toBe(DARK)
  })
})

// `tintInk` is the "coloured but readable" ink — a member's name on a row, a detail
// sheet's title, a hero card's label. It returns a `color-mix()` against `var(--ink)`
// so the mix follows the theme, which is also why nothing could measure it: the result
// only exists in the browser. `tintInkPct` exposes the one number that decides it, so
// the mix can be recomputed here and checked.
//
// The ramp was 32 / 60 / 62, picked before anything measured it, and the brighter tints
// came out short: a marigold list-row title at 4.02:1 on cream, butter at 3.98 (axe,
// 2026-09-15). Re-tuned to 38 / 95 / 72, worst palette colour 4.71:1.
//
// DAY is the case that matters here. Night mixes toward a LIGHT --ink on a dark ground,
// which moves the same direction and measured clean across the app; cream is the
// lightest ground any of these inks sit on, so clearing it clears the washes too.
describe('tintInk keeps a coloured label readable', () => {
  const DAY_INK = '#2c2722'
  const CREAM = '#fffcf5'
  const lin = (x: number) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
  const rgb = (hex: string) => {
    const c = hex.replace('#', '')
    return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16))
  }
  const lumOf = (c: number[]) => 0.2126 * lin(c[0] / 255) + 0.7152 * lin(c[1] / 255) + 0.0722 * lin(c[2] / 255)
  const ratioOf = (a: number[], b: number[]) => {
    const [x, y] = [lumOf(a), lumOf(b)]
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
  }
  // What the browser's color-mix(in srgb, …) produces for the pct tintInk chose.
  const mixed = (hex: string) => {
    const p = tintInkPct(hex) / 100
    return rgb(hex).map((v, i) => Math.round(v * (1 - p) + rgb(DAY_INK)[i] * p))
  }

  it('clears WCAG AA on cream for every colour the household can wear', () => {
    const short = PALETTE.map((c) => ({ c, r: ratioOf(mixed(c), rgb(CREAM)) }))
      .filter((x) => x.r < 4.5)
      .map((x) => `${x.c} = ${x.r.toFixed(2)}:1`)
    expect(short, 'tintInk must clear 4.5:1 on cream:\n' + short.join('\n')).toEqual([])
  })

  it('keeps the hue — it darkens the colour, it does not become the ink', () => {
    // The point of tintInk over a flat --ink is that a member's colour still reads as
    // THEIRS. If the ramp is ever pushed far enough to fix contrast by erasing the hue,
    // this fails and the answer is a different colour, not more ink.
    for (const c of PALETTE) expect(tintInkPct(c)).toBeLessThanOrEqual(75)
  })

  it('a malformed value still returns a usable mix rather than throwing', () => {
    expect(() => tintInk('')).not.toThrow()
    expect(tintInk('#abc')).toContain('var(--ink)')
  })
})
