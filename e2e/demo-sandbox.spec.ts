import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// The demo SANDBOX board (functions/api/demo.ts — an ordinary operator session whose
// email marks it throwaway). Its board used to open on TWO stacked banners about the
// demo — the try-this welcome card AND the claim strip — so a visitor who came to SEE
// the app got a screen and a half of chrome and no board.
//
// The invariant now: the « Garder ma maisonnée » offer is on screen EXACTLY ONCE —
// inside the welcome card while that's up, and in the strip once it's dismissed. Never
// twice (the fold), never zero (the conversion path can't vanish).
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page, { sandbox: true })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
})

test('the sandbox board offers « Garder ma maisonnée » exactly once, before and after dismissal', async ({ page }) => {
  await page.goto('/board')
  const welcome = page.locator('.welcome-card')
  await expect(welcome).toBeVisible({ timeout: 15_000 })

  // One card, and the claim lives inside it — not in a second banner.
  const claimCta = page.getByRole('link', { name: /garder ma maisonnée/i })
  await expect(claimCta).toHaveCount(1)
  await expect(welcome.locator('.welcome-card__claim')).toBeVisible()
  await expect(page.locator('.sample-banner')).toHaveCount(0)

  // Put the card away → the strip takes the offer over, in the same beat.
  await welcome.locator('.welcome-card__dismiss').click()
  await expect(welcome).toHaveCount(0)
  await expect(page.locator('.sample-banner')).toBeVisible()
  await expect(page.getByRole('link', { name: /garder ma maisonnée/i })).toHaveCount(1)
})

test('a sandbox visitor can reach the claim form', async ({ page }) => {
  await page.goto('/board')
  await page.getByRole('link', { name: /garder ma maisonnée/i }).click()
  await expect(page).toHaveURL(/\/garder/)
})
