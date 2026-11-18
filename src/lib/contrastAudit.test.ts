import { describe, expect, it } from 'vitest'
import { contrast, luminance, parseHex, verdict } from './contrastAudit'

// The palette, pinned. Twice now a contrast failure shipped and was found by eye
// weeks later — the twilight tier at 2.4:1 and, on 2026-08-27, --ink-faint at
// 2.65:1 on the night marigold wash. Both were TEXT below even the 3:1 non-text
// floor. This is the ratchet: the values below are read off core.css, and a palette
// edit that drops one under its bar fails the build instead of waiting to be noticed.
//
// Keep in step with :root[data-theme='night'] in styles/core.css.
const NIGHT = {
  ink: '#ece6d8',
  inkSoft: '#a59d8c',
  inkFaint: '#a09789',
  grounds: {
    paper: '#1b1712',
    paperDeep: '#221d16',
    card: '#25201a',
    marigoldWash: '#3a2f1c',
    terracottaWash: '#3a261e',
    sageWash: '#28301f',
    skyWash: '#1f2c33',
    berryWash: '#321f2c',
    tealWash: '#1d2e2c',
  },
}

describe('contrast maths', () => {
  it('agrees with the known anchors', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    expect(luminance(parseHex('#ffffff'))).toBeCloseTo(1, 5)
    expect(luminance(parseHex('#000000'))).toBeCloseTo(0, 5)
  })
  it('is symmetric — order of the pair cannot change the answer', () => {
    expect(contrast('#1b1712', '#ece6d8')).toBeCloseTo(contrast('#ece6d8', '#1b1712'), 10)
  })
  it('grades against the right bar', () => {
    expect(verdict(4.6)).toBe('AA')
    expect(verdict(3.2)).toBe('lg')
    expect(verdict(3.2, 'nonText')).toBe('AA')
    expect(verdict(2.9)).toBe('FAIL')
  })
})

describe('night palette clears AA on every ground', () => {
  for (const [name, ground] of Object.entries(NIGHT.grounds)) {
    it(`--ink on ${name}`, () => {
      expect(contrast(NIGHT.ink, ground)).toBeGreaterThanOrEqual(4.5)
    })
    it(`--ink-soft on ${name}`, () => {
      expect(contrast(NIGHT.inkSoft, ground)).toBeGreaterThanOrEqual(4.5)
    })
    it(`--ink-faint on ${name}`, () => {
      // The one that failed: 2.65:1 on the marigold wash before 2026-08-27.
      expect(contrast(NIGHT.inkFaint, ground)).toBeGreaterThanOrEqual(4.5)
    })
  }
})

describe('the ink ramp still descends', () => {
  it('faint is darker than soft, which is darker than ink', () => {
    // Otherwise the tokens have stopped meaning anything, whatever their ratios.
    expect(luminance(parseHex(NIGHT.inkFaint))).toBeLessThan(luminance(parseHex(NIGHT.inkSoft)))
    expect(luminance(parseHex(NIGHT.inkSoft))).toBeLessThan(luminance(parseHex(NIGHT.ink)))
  })
})

// Review #22: the twilight tiers' section inks were tuned on their washes alone, and
// the same tokens are used on --card, where they sat at 3.4–4.5:1 every evening. Keep
// in step with :root[data-theme='twilight' | 'deep-twilight'] in styles/core.css.
const TWILIGHTS = {
  twilight: {
    grounds: ['#564a57', '#5b4a33', '#5b4034', '#424d33', '#364a55', '#4d3346', '#31504b'],
    inks: ['#f4b465', '#edb49f', '#b7c6a5', '#a2c6d4', '#d9b8c5', '#82cec5'],
  },
  'deep-twilight': {
    grounds: ['#3a3140', '#463821', '#452e23', '#323a24', '#28363f', '#392636', '#243a37'],
    inks: ['#f2a03d', '#e49072', '#96ad7f', '#7bb0c9', '#c798b0', '#41b7aa'],
  },
}
describe('twilight section inks clear AA on the card AND every wash', () => {
  for (const [tier, t] of Object.entries(TWILIGHTS)) {
    it(tier, () => {
      for (const ink of t.inks) for (const g of t.grounds) expect(contrast(ink, g), `${ink} on ${g}`).toBeGreaterThanOrEqual(4.5)
    })
  }
})
