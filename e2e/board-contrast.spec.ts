import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mockApi, seedState } from './mocks'

// THE GLANCE SURFACE HAS TO BE LEGIBLE FROM ACROSS THE KITCHEN.
//
// The board's hero cards are the product's whole thesis, so their text gets a standing
// WCAG contrast check rather than an occasional look.
//
// ---------------------------------------------------------------------------------
// THIS FILE HAND-ROLLED ITS OWN CONTRAST MATH FIRST, AND THE MATH WAS WRONG.
//
// It walked ancestors for the first background with alpha > 0.5 and measured against
// that. But every hero card's ground is `wash(hex)` — `hex + '22'`, about 13% alpha —
// so the walk stepped straight over the card's own colour and measured the text
// against the PAGE's cream instead. It reported the supper label at 11.78:1 while axe,
// compositing properly, had it at 3.02:1. Both « red » and « green » from that version
// were fiction: it went red on the weather card only because that card's ink happened
// to be lighter still, and then reported green over four genuine violations.
//
// It is the exact failure CLAUDE.md warns about — a guard run against its bug, seen to
// go red and then green, and trusted for that reason. The fix is not better arithmetic:
// it is to stop reimplementing a contrast engine beside one we already depend on. axe
// composites layered translucent backgrounds, handles opacity, knows the large-text
// tier, and is the same engine `npm run e2e:matrix` reports from — so this spec and
// that sweep can no longer disagree.
// ---------------------------------------------------------------------------------
//
// A ratchet: scoped to the hero cards, so the next one cannot ship unreadable.
test.describe('the board heroes are readable', () => {
  for (const surface of ['kiosk', 'mobile'] as const) {
    for (const theme of ['day', 'night'] as const) {
      test(`the hero cards pass WCAG AA contrast @${surface}-${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: surface === 'kiosk' ? 1280 : 390, height: 844 })
        await mockApi(page)
        await seedState(page, { theme, audience: 'parent', lang: 'fr', surface })
        await page.goto('/board')
        await page.waitForSelector('.now-card')

        const res = await new AxeBuilder({ page })
          // Only the heroes. The rest of the board carries its own contrast debt (the
          // fridge-note age stamps, « À régler » rows, the Fil's past lines…) — real,
          // measured by the matrix sweep, and not this file's job to hold hostage.
          .include('.now-card')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()

        // A false green is the failure mode: if the fixture stopped rendering heroes,
        // an empty scope would report zero violations and pass.
        expect(await page.locator('.now-card').count(), 'the fixture actually rendered hero cards').toBeGreaterThan(1)

        const contrast = res.violations.filter((v) => v.id === 'color-contrast')
        const lines = contrast.flatMap((v) =>
          v.nodes.map((n) => {
            const d = (n.any[0]?.data ?? {}) as { fgColor?: string; bgColor?: string; contrastRatio?: number }
            return `  ${n.target.join(' ')} — ${d.fgColor} on ${d.bgColor} = ${d.contrastRatio}:1`
          }),
        )
        expect(lines, 'hero-card text below WCAG AA, with the colours axe actually measured:\n' + lines.join('\n')).toEqual(
          [],
        )
      })
    }
  }
})
