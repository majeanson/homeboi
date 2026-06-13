import { test as base, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Screenshot-review loop, iteration 4: the states the happy-path sweeps skip —
// EMPTY / ERROR / LOADING (fresh household, 401 recovery, nothing-yet lists) and
// TODDLER INTERACTIONS (the kid lens drilling into a routine story / a meal). All
// mock-based + Chromium. Doubles as a crash-smoke suite: any pageerror fails.
const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await use(page)
    expect(errors, 'pageerror in an empty/error/toddler state').toEqual([])
  },
})

const PHONE = { width: 390, height: 844 }
const WALL = { width: 1280, height: 800 }
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `e2e/screenshots/st-${name}.png`, fullPage: false })

// ---- Empty / error / recovery (phone) -----------------------------------
test('st: fresh household board (empty)', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await mockApi(page, { fresh: true })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/board')
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(600)
  await shot(page, 'fresh-board')
})

test('st: fresh household list (empty)', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await mockApi(page, { fresh: true })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/liste')
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(600)
  await shot(page, 'fresh-list')
})

test('st: fresh household settings welcome', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await mockApi(page, { fresh: true })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  // Guide is the default tab now; deep-link to La maisonnée to capture the welcome.
  await page.goto('/settings?tab=household')
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(600)
  await shot(page, 'fresh-settings')
})

test('st: empty kitchen (no recipes / no meals)', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await mockApi(page)
  // Override the kitchen feeds to empty (registered after mockApi → wins).
  await page.route('**/api/recipes**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ recipes: [] }) }))
  await page.route('**/api/meals**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ days: [], weekStart: 1_749_369_600, windowDays: 10 }) }))
  await page.route('**/api/meal-ideas**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ideas: [] }) }))
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/kitchen')
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(600)
  await shot(page, 'empty-kitchen-meals')
  // The Recettes tab empty state.
  await page.getByRole('tab', { name: /Recettes/ }).click().catch(() => {})
  await page.waitForTimeout(400)
  await shot(page, 'empty-kitchen-recipes')
})

test('st: 401 pairing-lost recovery (paired device)', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await mockApi(page, { unauthorized: true })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', paired: true })
  await page.goto('/board')
  await page.waitForTimeout(900)
  await shot(page, 'recovery-pairing-lost')
})

test('st: 401 pair prompt (unpaired device)', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await mockApi(page, { unauthorized: true, signedIn: false })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/board')
  await page.waitForTimeout(900)
  await shot(page, 'recovery-pair-prompt')
})

// ---- Toddler interactions (kiosk wall — the kid's real display) ----------
async function kid(page: Page, path: string) {
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', calm: true, surface: 'kiosk' })
  await page.goto(path)
  await page.locator('.kid, .hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(500)
}

test('st: toddler routines — face picker → story → running', async ({ page }) => {
  await page.setViewportSize(WALL)
  await kid(page, '/routines')
  await shot(page, 'toddler-routines-faces')
  await page.locator('.kid__face').first().click().catch(() => {})
  await page.waitForTimeout(500)
  await shot(page, 'toddler-routine-story')
  // Start the step → the running clock view.
  const start = page.locator('.tdl-start')
  if (await start.count()) {
    await start.click()
    await page.waitForTimeout(500)
    await shot(page, 'toddler-routine-running')
  }
})

test('st: toddler kitchen — tap a meal → kid cook mode', async ({ page }) => {
  await page.setViewportSize(WALL)
  await kid(page, '/kitchen')
  await shot(page, 'toddler-kitchen')
  const tile = page.locator('.bigtile').first()
  if (await tile.count()) {
    await tile.click()
    await page.waitForTimeout(600)
    await shot(page, 'toddler-kitchen-cook')
  }
})

test('st: toddler empty board (nothing planned)', async ({ page }) => {
  await page.setViewportSize(WALL)
  await mockApi(page, { fresh: true })
  await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', calm: true, surface: 'kiosk' })
  await page.goto('/board')
  await page.locator('.kid, .hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(600)
  await shot(page, 'toddler-empty-board')
})
