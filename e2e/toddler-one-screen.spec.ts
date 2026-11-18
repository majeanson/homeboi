import { test, expect } from './fixtures'
import { boxOf } from './measure'

// Review #25 (2026-11-17), Sam: the toddler board stacked greeting, heroes, notes, mots,
// doors, timeline, meals, leftovers, events, tasks, departure, défi, habits, tomorrow and
// photos — many screens for a three-year-old who does not scroll on purpose. Now the
// first screen is tonight, now / next, the routine and the doors; the rest waits behind
// « Tout voir ». A parent's text note is not for a pre-reader.

test('on a wall tablet, the toddler board’s first screen fits, and the rest folds', async ({ app, page }) => {
  await app.boot({
    route: '/board',
    wait: '.today-kid',
    clock: 'BASE',
    viewport: { width: 768, height: 1024 },
    state: { audience: 'toddler', surface: 'kiosk' },
  })
  const fold = page.locator('.today-kid__more')
  await expect(fold).toBeVisible()
  // Everything above the fold is on the first screen.
  expect((await boxOf(fold)).y).toBeLessThan(1024)
  await expect(page.locator('.today-kid__doors')).toBeVisible()
  // No parent text papers on the first screen, folded or not.
  await expect(page.locator('.today-kid .note-card__text')).toHaveCount(0)
  // The rest is one tap away (for a parent).
  await fold.locator('summary, button').first().click()
  await expect(page.locator('.today-kid__more .today-kid__section').first()).toBeVisible()
})
