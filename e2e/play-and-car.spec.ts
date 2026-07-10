import { test, expect, type Page, type Request } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// PARITY Wave E, entry 10 — two surfaces that were layout-smoke-rendered only, now
// with a happy-path interaction each: F30 « Jouer » (a game the child actually plays)
// and F32 « L'auto » (a car-day write). Frontend-only harness (mocked /api/**).

const isApi = (method: string, path: string) => (r: Request) =>
  r.method() === method && new URL(r.url()).pathname === `/api/${path}`
async function expectApi(page: Page, method: string, path: string, action: () => Promise<void>) {
  await Promise.all([page.waitForRequest(isApi(method, path), { timeout: 20_000 }), action()])
}

// F30 Jouer — the « trouve la chose » (find-it) game. Enter a deck, then find the
// target: tapping a wrong tile only names it (no penalty), so clicking through the
// board reliably lands on the target and shows « Bravo ».
test('Jouer: the find-it game finds its target', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', surface: 'kiosk' })
  await page.goto('/jouer')
  // /jouer opens on its menu; enter « Cherche et trouve » (the first play door).
  await page.locator('.play-door').first().click()
  // Then pick the first deck (faces / animals / colours — always at least the fixed ones).
  await page.locator('.seek-deck').first().click()
  const tiles = page.locator('.seek-tile')
  await expect(tiles.first()).toBeVisible()
  const bravo = page.locator('.seek__bravo')
  const n = await tiles.count()
  for (let i = 0; i < n; i++) {
    await tiles.nth(i).click()
    if (await bravo.isVisible()) break
  }
  await expect(bravo).toBeVisible()
})

// F32 L'auto — the week editor. Open a day, mark the car « Reste à la maison » →
// POST /api/car-day (car.ts itself is a GET-only read model; the day markers are the
// write path, footnote 18).
test('L’auto: setting a day posts a car-day', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/voiture')
  // Expand a day's editor (the mock seeds one household car, « La familiale »).
  await page.locator('.voiture__day-head').first().click()
  await expectApi(page, 'POST', 'car-day', () =>
    page.getByRole('button', { name: 'Reste à la maison' }).first().click(),
  )
})
