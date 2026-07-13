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

test('ms: cashier grid + proof peek', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await open(page, '/liste')
  await page.getByRole('button', { name: /Montrer à la caisse/ }).click()
  await page.locator('.cashier').waitFor({ timeout: 5000 })
  await page.waitForTimeout(400)
  await shot(page, 'cashier-grid')
  // Tap a tile → the big proof peek (random-access, no sequential stepper).
  await page.locator('.cashier__tile').first().click()
  await page.locator('.bigcard').waitFor({ timeout: 5000 })
  await page.waitForTimeout(400)
  await shot(page, 'cashier-peek')
})

test('ms: liste edit item sheet', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await open(page, '/liste')
  // The ✏️ pencil is the edit affordance now (the name/centre toggles the check);
  // it navigates to the edit scene /liste/item/:id.
  await page.locator('.list-row', { hasText: 'Pain' }).locator('.list-row__edit .row-actions__btn').click()
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
    // A card now navigates STRAIGHT to the full recipe view (.recipe-modal) — the old
    // browse-path detail peek was removed. Cook mode is reached from the view's Cuisiner.
    await card.click()
    await page.locator('.recipe-modal').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(300)
    await shot(page, 'recipe-sheet')
    await page.locator('.recipe-actions .btn--primary').first().click() // Cuisiner
    await page.waitForTimeout(600)
    await shot(page, 'cook-mode')
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
test('ms: cashier grid night', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await open(page, '/liste', 'night')
  await page.getByRole('button', { name: /Montrer à la caisse/ }).click()
  await page.locator('.cashier').waitFor({ timeout: 5000 })
  await page.waitForTimeout(400)
  await shot(page, 'cashier-grid-night')
})

test('ms: liste add sheet night', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await open(page, '/liste', 'night')
  await page.locator('.add-fab').click()
  await page.locator('.sheet.show').first().waitFor({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(500)
  await shot(page, 'liste-addsheet-night')
})
