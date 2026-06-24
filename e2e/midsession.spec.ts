import { test as base, expect, type Page } from '@playwright/test'
import { mockApi, seedState, type Theme } from './mocks'

// Mid-session sweep: the OPEN states the first-paint screenshots never show —
// bottom sheets, full-screen portals, the cashier stepper, cook mode. Mock-based
// + Chromium (deterministic; WebKit-on-Windows is too flaky for a loop). Writes
// ms-*.png for review; each step guards its trigger so a missing one is skipped,
// not fatal. Doubles as a crash-smoke suite: opening any overlay that throws a
// pageerror fails the test (how a blank-surface render crash would surface here).
const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await use(page)
    expect(errors, 'pageerror during mid-session flow').toEqual([])
  },
})

const PHONE = { width: 390, height: 844 }

async function open(page: Page, path: string, theme: Theme = 'day') {
  await mockApi(page)
  await seedState(page, { theme, audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
  await page.goto(path)
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(500)
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `e2e/screenshots/ms-${name}.png`, fullPage: false })

// --- Liste overlays -------------------------------------------------------
test('ms: liste add sheet', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await open(page, '/liste')
  await page.locator('.add-fab').click()
  await page.locator('.sheet.show').first().waitFor({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(500)
  await shot(page, 'liste-addsheet')
})

test('ms: liste quick add panel', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await open(page, '/liste')
  await page.locator('.add-fab').click() // Ajout rapide lives in the ＋ sheet now
  await page.getByRole('dialog').getByRole('button', { name: /Ajout rapide/ }).click() // scope to sheet (page has its own shortcut behind the scrim)
  await page.waitForTimeout(600)
  await shot(page, 'liste-quickadd')
})

test('ms: liste deals browser', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await open(page, '/liste')
  await page.locator('.add-fab').click() // flyer browser lives in the ＋ sheet now
  await page.getByRole('dialog').getByRole('button', { name: /Parcourir les circulaires/ }).click()
  await page.waitForTimeout(800)
  await shot(page, 'liste-deals-browser')
})

test('ms: cashier review + present + thanks', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await open(page, '/liste')
  await page.getByRole('button', { name: /Montrer à la caisse/ }).click()
  await page.locator('.cashier').waitFor({ timeout: 5000 })
  await page.waitForTimeout(400)
  await shot(page, 'cashier-review')
  // Into the big stepper.
  await page.locator('.cashier__present').click()
  await page.waitForTimeout(500)
  await shot(page, 'cashier-present')
  // Single pick → the "done" arrow ends the stepper; capture the thanks screen.
  const done = page.locator('.cashier__arrow--done')
  if (await done.count()) {
    await done.click()
    await page.waitForTimeout(500)
    await shot(page, 'cashier-thanks')
  }
})

test('ms: liste edit item sheet', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await open(page, '/liste')
  // The item name is the edit affordance (navigates to the edit scene /liste/item/:id).
  await page.getByText('Pain', { exact: true }).first().click()
  await page.waitForTimeout(500)
  await shot(page, 'liste-item-sheet')
})

// --- Kitchen overlays -----------------------------------------------------
test('ms: kitchen add sheet', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await open(page, '/kitchen')
  await page.locator('.add-fab').click()
  await page.locator('.sheet.show').first().waitFor({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(500)
  await shot(page, 'kitchen-addsheet')
})

test('ms: recipe sheet + cook mode', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await open(page, '/kitchen')
  // Switch to the Recettes tab (role="tab"), open the first recipe card.
  await page.getByRole('tab', { name: /Recettes/ }).click().catch(() => {})
  await page.waitForTimeout(400)
  const card = page.locator('.recipe-card').first()
  if (await card.count()) {
    // A card opens the detail peek; its Cuisiner action navigates to cook mode.
    await card.click()
    await page.waitForTimeout(600)
    await shot(page, 'recipe-sheet')
    const cook = page.locator('.detail-sheet__actions button').filter({ hasText: 'Cuisiner' })
    if (await cook.count()) {
      await cook.first().click()
      await page.waitForTimeout(600)
      await shot(page, 'cook-mode')
    }
  }
})

// --- Board overlay --------------------------------------------------------
test('ms: board add sheet', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await open(page, '/board')
  await page.locator('.add-fab').click()
  await page.locator('.sheet.show').first().waitFor({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(500)
  await shot(page, 'board-addsheet')
})

// A couple of night-theme overlay shots (contrast check on portals/sheets).
test('ms: cashier review night', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await open(page, '/liste', 'night')
  await page.getByRole('button', { name: /Montrer à la caisse/ }).click()
  await page.locator('.cashier').waitFor({ timeout: 5000 })
  await page.waitForTimeout(400)
  await shot(page, 'cashier-review-night')
})

test('ms: liste add sheet night', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await open(page, '/liste', 'night')
  await page.locator('.add-fab').click()
  await page.locator('.sheet.show').first().waitFor({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(500)
  await shot(page, 'liste-addsheet-night')
})
