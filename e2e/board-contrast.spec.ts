import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// THE GLANCE SURFACE HAS TO BE LEGIBLE FROM ACROSS THE KITCHEN.
//
// The board's hero cards are the product's whole thesis, and this measures whether
// their text can actually be read: computed ink, composited through `opacity`, against
// the ground it actually sits on, as a WCAG contrast ratio.
//
// It measures the DEFECT, not a declaration. A rule like « no opacity on .label » would
// have been satisfiable without fixing anything and would have failed the supper card,
// which uses the same opacity and reads at ~11.8:1 because its ink is `tintInk()`. The
// weather card used a raw `deep` on a wash instead and measured **2.22:1** — under half
// the minimum, on the card a wall tablet shows all day (2026-09-15, found by the axe
// pass in `npm run e2e:matrix`: color-contrast, serious, 78 of 154 states).
//
// A ratchet, not a one-off: every current and future `.now-card` is measured, so the
// next hero card cannot ship unreadable.

// WCAG AA body text. None of the text measured here is « large » (the 3.0 tier needs
// ≥18.66px bold or ≥24px; these labels are 12px bold and 10.5px regular).
const MIN = 4.5

test.describe('the board heroes are readable', () => {
  for (const surface of ['kiosk', 'mobile'] as const) {
    test(`every now-card's text clears ${MIN}:1 @${surface}`, async ({ page }) => {
      await page.setViewportSize({ width: surface === 'kiosk' ? 1280 : 390, height: 844 })
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface })
      await page.goto('/board')
      await page.waitForSelector('.now-card')

      const rows = await page.evaluate((min) => {
        const nums = (s: string) => (s.match(/[\d.]+/g) || []).map(Number)
        const lum = (c: number[]) => {
          const f = (x: number) => {
            x /= 255
            return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
          }
          return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
        }
        // The first ancestor that actually paints something opaque — the ground the
        // ink is really composited over, which is what a reader sees.
        const groundOf = (el: Element): number[] => {
          let n: Element | null = el
          while (n) {
            const c = nums(getComputedStyle(n).backgroundColor)
            if ((c.length > 3 ? c[3] : 1) > 0.5) return c.slice(0, 3)
            n = n.parentElement
          }
          return [255, 255, 255]
        }
        const out: { where: string; text: string; ratio: number }[] = []
        for (const card of Array.from(document.querySelectorAll('.now-card'))) {
          // The PHOTO weather card is measured by eye, not here: its white ink sits on
          // a gradient scrim over an arbitrary image plus a text-shadow, none of which
          // a single sampled background colour can honestly represent. It was also
          // built for exactly this problem — scrim + shadow + near-opaque ink — while
          // the plain tinted fallback below it was not.
          if (card.classList.contains('now-card--wx-photo')) continue
          for (const el of Array.from(card.querySelectorAll('.label, .what, .who, .now-card__hour-when'))) {
            const text = (el.textContent || '').trim()
            if (!text) continue
            // Skip anything hidden from the reader as well as the a11y tree.
            if (el.closest('[hidden]')) continue
            const cs = getComputedStyle(el)
            if (cs.visibility === 'hidden' || cs.display === 'none') continue
            const ground = groundOf(el)
            // `opacity` composites the ink toward its ground — 0.8 ink is not 100% ink,
            // and reading the declared colour alone is how this stayed invisible.
            const op = Number(cs.opacity)
            const ink = nums(cs.color).slice(0, 3)
            const eff = ink.map((c, i) => c * op + ground[i] * (1 - op))
            const a = lum(eff)
            const b = lum(ground)
            const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
            out.push({
              where: card.className.split(' ').filter((c) => c.startsWith('now-card--'))[0] || 'now-card',
              text: text.slice(0, 24),
              ratio: Math.round(ratio * 100) / 100,
            })
          }
        }
        return { rows: out, min }
      }, MIN)

      // A false green is the failure mode here: if the fixture stopped rendering the
      // heroes, an empty list would pass silently.
      expect(rows.rows.length, 'the board actually rendered hero-card text to measure').toBeGreaterThan(3)

      const tooFaint = rows.rows.filter((r) => r.ratio < MIN)
      expect(
        tooFaint,
        'every hero-card line must clear WCAG AA — name, text and measured ratio:\n' +
          tooFaint.map((r) => `  ${r.where} « ${r.text} » = ${r.ratio}:1`).join('\n'),
      ).toEqual([])
    })
  }
})
