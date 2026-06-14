import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Contextual help: the "?" beside a section title (HelpDot) deep-links into the
// Guide at the matching card; an Expert switch in Réglages ▸ Affichage hides all
// the dots. Both run frontend-only against mocked APIs.

async function boot(page: import('@playwright/test').Page, path: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  // Keep the first-login guided tour from auto-navigating to /board mid-test (it
  // races a /settings navigation and yanks the page off it — see lib/tour.tsx).
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
    } catch {
      /* noop */
    }
  })
  await page.goto(path)
  await page.locator('.hub, .operator').first().waitFor({ state: 'visible', timeout: 15_000 })
}

test('the contextual ? deep-links into the matching Guide card', async ({ page }) => {
  await boot(page, '/kitchen')
  const dot = page.locator('.app-head .help-dot').first()
  await expect(dot).toBeVisible()
  await dot.click()
  // The card param is consumed (replaced) once read, leaving a clean URL.
  await expect(page).toHaveURL(/\/settings\?tab=guide$/)
  // The Kitchen card is the one opened + highlighted, scrolled into view.
  const target = page.locator('.guide__card.is-target')
  await expect(target).toBeVisible()
  await expect(target).toHaveAttribute('open', '')
  await expect(target).toContainText('cuisine')
})

test('tutorial vs expert mode shows / hides the ? dots', async ({ page }) => {
  // Tutorial is the default: the dot shows.
  await boot(page, '/liste')
  await expect(page.locator('.help-dot')).toHaveCount(1)

  // Flip to expert in Réglages ▸ Affichage.
  await page.goto('/settings?tab=display')
  await page.locator('.operator__tabs').waitFor({ state: 'visible' })
  await page.getByRole('button', { name: /Expert/ }).click()

  // Back on a hub page, every dot is gone.
  await page.goto('/liste')
  await page.locator('.hub').first().waitFor({ state: 'visible' })
  await expect(page.locator('.help-dot')).toHaveCount(0)
})
