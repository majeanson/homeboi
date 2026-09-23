import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// The first-run onboarding SEQUENCE (not a pile-up). A real signup lands EMPTY on the
// setup checklist (WelcomeCard) since 2026-09-23; its « Charger des exemples » loads
// the demo family on request (POST /api/seed). While that family is present, the board
// shows ONLY the explore banner (SampleBanner) and the checklist stays hidden — its
// "add your family" step would read as done off the demo rows. « Vider et commencer »
// clears the demo (DELETE /api/seed) → the checklist takes over again.
//
// Frontend-only against mocked /api/*. /api/seed is stubbed with a STATEFUL count
// (GET returns it, DELETE clears it), registered AFTER mockApi so it wins for that
// path. The essentials tour is pre-marked seen so its overlay doesn't gate the cards.
async function boot(page: Page, opts: { hasSample: boolean; fresh?: boolean }) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, { fresh: opts.fresh })
  let count = opts.hasSample ? 47 : 0
  await page.route('**/api/seed', async (route) => {
    const method = route.request().method()
    if (method === 'DELETE') count = 0
    else if (method === 'POST') count = 47
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count }) })
  })
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
    } catch {
      /* noop */
    }
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/board')
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
}

test('demo present → only the explore banner shows; the setup checklist is suppressed', async ({ page }) => {
  await boot(page, { hasSample: true })
  const banner = page.locator('.sample-banner')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('Vider et commencer')
  // The setup checklist would mislead while the demo fills the board — it must not show.
  await expect(page.locator('.welcome-card')).toHaveCount(0)
})

test('« Vider et commencer » fires the clear (DELETE /api/seed) and the banner unmounts', async ({ page }) => {
  await boot(page, { hasSample: true })
  await page.locator('.sample-banner').getByRole('button', { name: /Vider et commencer/ }).click()
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/api/seed') && r.method() === 'DELETE'),
    // Confirm the dialog.
    page.locator('.confirm').getByRole('button', { name: /Vider et commencer/ }).click(),
  ])
  expect(req.method()).toBe('DELETE')
  // count → 0 (stateful stub) → the shared sample query refetches → the banner unmounts.
  await expect(page.locator('.sample-banner')).toHaveCount(0)
})

test('fresh empty household, no demo → the setup checklist shows directly, no banner', async ({ page }) => {
  await boot(page, { hasSample: false, fresh: true })
  await expect(page.locator('.sample-banner')).toHaveCount(0)
  const welcome = page.locator('.welcome-card')
  await expect(welcome).toBeVisible()
  await expect(welcome).toContainText('étapes')
})

test('the checklist offers the examples on request — and hands over to the banner', async ({ page }) => {
  await boot(page, { hasSample: false, fresh: true })
  const welcome = page.locator('.welcome-card')
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/api/seed') && r.method() === 'POST'),
    welcome.getByRole('button', { name: /Charger des exemples/ }).click(),
  ])
  expect(req.method()).toBe('POST')
  // count → 47 (stateful stub) → the banner explains them, the checklist steps aside.
  await expect(page.locator('.sample-banner')).toBeVisible()
  await expect(welcome).toHaveCount(0)
})
