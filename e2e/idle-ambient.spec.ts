import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// The kiosk idle screensaver (AmbientScreen), part of the §931 offline/ambient layer.
// The real trigger is a 3-minute idle timer, but Réglages ▸ Debug can force it now via
// a `bb:idle-debug` CustomEvent that HubLayout's idle effect listens to (lib/idleDebug
// forceIdle). We fire that event directly — the same path the Debug button uses — so
// the test needs no fake timers, then assert the screensaver shows and a tap wakes it.

async function boot(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  // Kiosk = the wall tablet the screensaver is built for.
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })
  await page.goto('/board')
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
}

const forceScreensaver = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new CustomEvent('bb:idle-debug', { detail: 'screensaver' })))

test('forcing the idle timer shows the ambient screensaver', async ({ page }) => {
  await boot(page)
  await expect(page.locator('.ambient')).toHaveCount(0) // not up at rest
  await forceScreensaver(page)
  const saver = page.locator('.ambient')
  await expect(saver).toBeVisible()
  // The full-screen clock is the calm centrepiece.
  await expect(saver.locator('.ambient__clock')).toBeVisible()
  // C-13 (bmad/10): the "next up" line (tonight's supper, via useAmbientScene /
  // lib/ambientScene) — the mocked board always has a `tonight` meal, so this
  // is the ONE ambient engine seam actually reaching the screensaver's render.
  await expect(saver.locator('.ambient__next').first()).toBeVisible()
})

test('tapping the screensaver wakes back to the board', async ({ page }) => {
  await boot(page)
  await forceScreensaver(page)
  const saver = page.locator('.ambient')
  await expect(saver).toBeVisible()
  // A tap anywhere wakes it (onPointerDown → onWake) and the board is back underneath.
  await saver.click({ position: { x: 10, y: 10 } })
  await expect(saver).toHaveCount(0)
  await expect(page.locator('.hub')).toBeVisible()
})
