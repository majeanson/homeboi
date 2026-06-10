import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Auth-loss recovery + the first-run welcome path. Same frontend-only harness
// as interactions.spec.ts: Vite dev server + stubbed /api/** (see mocks.ts).
// mockApi({ unauthorized: true }) turns every data route into a 401 —
// a revoked device token or a dead session, as the client sees it.

async function settle(page: Page, ready: string) {
  await page.locator(ready).first().waitFor({ state: 'visible', timeout: 15_000 })
}

test.describe('401 recovery', () => {
  test('a paired kiosk whose token was revoked gets the re-pair screen, and re-pairing clears the token', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page, { unauthorized: true, signedIn: false })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'kiosk', paired: true })
    await page.goto('/board')
    // The shell-level recovery replaces the hub — not a per-page prompt.
    await settle(page, '.pair-lost')
    await page.locator('.pair-lost .btn--primary').click()
    await expect(page).toHaveURL(/\/pair$/)
    // The stale token is gone, so the pairing screen starts clean.
    const token = await page.evaluate(() => localStorage.getItem('babillard-device-token'))
    expect(token).toBeNull()
  })

  test('the recovery screen survives the kid lock (?kid=1) — no URL surgery needed', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page, { unauthorized: true, signedIn: false })
    await seedState(page, { theme: 'day', lang: 'fr', calm: true, paired: true })
    await page.goto('/board?kid=1')
    // Before this screen existed, a locked kiosk with a revoked token was stuck
    // on per-page prompts with the settings tab blocked — a true dead end.
    await settle(page, '.pair-lost')
    await expect(page.locator('.pair-lost .btn--primary')).toBeVisible()
  })

  test('an unpaired phone hitting 401 gets the login door first (pair second)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page, { unauthorized: true, signedIn: false })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
    await page.goto('/board')
    await settle(page, '.pairprompt')
    // Surface-aware doors: mobile leads with sign-in, pairing stays reachable.
    await expect(page.locator('.pairprompt .btn--primary')).toHaveAttribute('href', '/login')
    await expect(page.locator('.pairprompt a[href="/pair"]')).toBeVisible()
  })
})

test.describe('first-run welcome', () => {
  test('a fresh household sees the welcome steps in Réglages ▸ La maisonnée', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page, { fresh: true })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
    await page.goto('/settings#household')
    await settle(page, '.operator__tabs')
    await expect(page.locator('.welcome-steps')).toBeVisible()
  })

  test('the empty board points at adding the family, and the link lands on the household tab', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page, { fresh: true })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
    await page.goto('/board')
    await settle(page, '.board-welcome')
    await page.locator('.board-welcome a').click()
    await expect(page).toHaveURL(/\/settings#household$/)
    await settle(page, '.welcome-steps')
  })
})
