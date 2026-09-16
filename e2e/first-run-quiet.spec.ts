import { test, expect } from '@playwright/test'
import { mockApi, seedState, BASE } from './mocks'

// THE FIRST DAY BELONGS TO THE WELCOME (lib/habitCheckin + lib/tour).
//
// Two shell-level automations both fire on a brand-new device: the essentials tour
// auto-launches for a first-time parent, and « Le point du jour » opens itself the
// first time the app is opened on a new local day when a habit is due. The seed puts
// habits on today, so the demo walk of 2026-09-16 found a stranger's FIRST screen was
// the habits scene with the welcome dialog drawn over it (STATE.md §4-K wave 1).
//
// The rule: on a device that has not met the tour, the check-in stamps the day and
// stands down. The control case pins that the morning open still works once the
// welcome has been seen — a guard that only proved the quiet half would pass by the
// feature being broken.

const fresh = async (page: Parameters<typeof seedState>[0], opts: { tourSeen: boolean }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(new Date(BASE * 1000))
  await mockApi(page)
  // Production's shape, not the mock's: the habits payload arrives from the NETWORK
  // after the tour has already started, so the check-in's navigation lands LAST and
  // wins. An instant stub answers before the tour mounts, the tour's own navigation
  // wins instead, and the old code passed this spec by accident. Registered after
  // mockApi so it runs first, waits, then falls through to the stub.
  await page.route('**/api/habits**', async (route) => {
    await new Promise((r) => setTimeout(r, 700))
    await route.fallback()
  })
  // `habitCheckin: true` leaves the store at its defaults (autoOpen on, day never
  // stamped) — the state a brand-new browser is in. `tour: true` leaves the tour unseen.
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', habitCheckin: true, tour: !opts.tourSeen })
}

test('a brand-new device lands on the board under the welcome — never on the habits scene', async ({ page }) => {
  await fresh(page, { tourSeen: false })
  await page.goto('/board')
  // The welcome is the first thing on screen…
  await expect(page.locator('.tour')).toBeVisible({ timeout: 15_000 })
  // …over the BOARD, not over « Le point du jour ».
  await expect(page).toHaveURL(/\/board(\?|$)/)
  await expect(page.locator('.habitudes')).toHaveCount(0)
  await expect(page.locator('.wg-slot').first()).toBeVisible()

  // Skipping the tour does not hand the day to the check-in either: it was stamped.
  // Scoped to the card: the board's own « Le point du jour » card offers a « Passer » too.
  await page.locator('.tour').getByRole('button', { name: 'Passer' }).click()
  await expect(page.locator('.tour')).toHaveCount(0)
  await page.waitForTimeout(400)
  await expect(page).toHaveURL(/\/board(\?|$)/)
  await page.reload()
  await expect(page.locator('.wg-slot').first()).toBeVisible({ timeout: 15_000 })
  await expect(page).toHaveURL(/\/board(\?|$)/)
})

test('control: once the welcome has been seen, the morning open still opens the scene', async ({ page }) => {
  await fresh(page, { tourSeen: true })
  await page.goto('/board')
  await expect(page).toHaveURL(/\/board\/habitudes/, { timeout: 15_000 })
  await expect(page.locator('.habitudes')).toBeVisible()
})
