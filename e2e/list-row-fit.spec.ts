import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// A LIST ROW'S CHIPS STAY INSIDE THE NAME COLUMN — at every text scale.
//
// The deal chip (« Super C · 4,99 $ ») painted straight under the check disc. The
// chips were already `nowrap` + `min-width: 0` + `text-overflow: ellipsis`, and
// `.list-row__meta` already carried `overflow: hidden` with a comment saying this
// exact bug had been fixed once. It had not: `min-width: 0` let the meta SHRINK and
// nothing stopped it GROWING, so at 130% on a 360px phone the name column was 129px
// and the meta laid out at 184 — the clip dutifully bounded its children to a box
// that was itself 55px past the column.
//
// It was reachable at the SHIPPED 115% step too (360px: 7px of clearance became 18px
// of overlap), so this is not a 130%-only guard.
//
// WHY IT MEASURES BOXES AND NOT PIXELS: a screenshot showed the symptom and could not
// say which box was wrong — and `getBoundingClientRect()` on the chip is no better,
// because it reports the layout box that `overflow: hidden` is visually clipping. The
// question that has one answer is "is the meta wider than the column it lives in?".
const SCALES = ['normal', 'large', 'x-large'] as const

for (const scale of SCALES) {
  for (const width of [390, 360]) {
    test(`a list row's chips stay inside the name column — ${scale} @${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await mockApi(page)
      await seedState(page, { theme: 'day', lang: 'fr', surface: 'mobile', textScale: scale })
      await page.goto('/liste')
      const row = page.locator('.list-row').first()
      await expect(row).toBeVisible()
      // The seeded list carries a staged deal on its first row — the widest chip the
      // surface can draw, and the one that was overflowing. If this stops being true
      // the assertion below silently guards nothing, so check it.
      await expect(row.locator('.list-row__deal')).toBeVisible()

      const fit = await row.evaluate((r) => {
        const name = r.querySelector('.list-row__name')
        const meta = r.querySelector('.list-row__meta')
        if (!name || !meta) return null
        return {
          nameW: Math.round(name.getBoundingClientRect().width),
          metaW: Math.round(meta.getBoundingClientRect().width),
        }
      })
      expect(fit, 'the row must still have a name column and a meta line').not.toBeNull()
      expect(
        fit!.metaW,
        `the chip line (${fit!.metaW}px) is wider than the name column it lives in ` +
          `(${fit!.nameW}px), so it paints under the check disc. ` +
          `.list-row__meta needs max-width: 100% — min-width: 0 only lets it shrink.`,
      ).toBeLessThanOrEqual(fit!.nameW)
    })
  }
}
