import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// The per-section first-visit welcome card (SectionIntro): the first time a
// parent opens a themed tab, a calm "what this is" card sits above the section,
// links into the full Guide card, and is dismissible — once, then never again.
// Frontend-only against mocked APIs. `intros: true` leaves the cards un-dismissed
// (seedState pre-dismisses them everywhere else for stable screenshots).

// Keep the first-login guided tour from auto-navigating to /board (its overlay
// would gate the intro card off and pull us off the tab under test).
async function noTour(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
    } catch {
      /* noop */
    }
  })
}

async function boot(page: import('@playwright/test').Page, path: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', intros: true })
  await noTour(page)
  await page.goto(path)
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
}

test('the first-visit card explains the section and deep-links into the Guide', async ({ page }) => {
  await boot(page, '/kitchen')
  const intro = page.locator('.section-intro')
  await expect(intro).toBeVisible()
  await expect(intro).toContainText('cuisine')
  // "En savoir plus" jumps into the matching Guide card (same path as HelpDot):
  // the card's themed Réglages tab, Comprendre lens, card param consumed.
  await intro.locator('.section-intro__more').click()
  await expect(page).toHaveURL(/\/settings\?tab=kitchen&lens=comprendre$/)
  const target = page.locator('.guide__card.is-target')
  await expect(target).toBeVisible()
  await expect(target).toContainText('cuisine')
})

// The nav restructure split the old « Le cercle » welcome card into two: Maison
// (routines/famille/social/business/carnets) and Les notes (Comprendre-only —
// its Guide card carries no `settings` field, but « En savoir plus » still lands
// on its own themed tab, not a fallback).
test('the Maison first-visit card explains the merged section', async ({ page }) => {
  await boot(page, '/maison')
  const intro = page.locator('.section-intro')
  await expect(intro).toBeVisible()
  await expect(intro).toContainText('maison')
  await intro.locator('.section-intro__more').click()
  await expect(page).toHaveURL(/\/settings\?tab=maison&lens=comprendre$/)
  const target = page.locator('.guide__card.is-target')
  await expect(target).toBeVisible()
})

test('the Les notes first-visit card explains the split-out section', async ({ page }) => {
  await boot(page, '/notes')
  const intro = page.locator('.section-intro')
  await expect(intro).toBeVisible()
  await expect(intro).toContainText('notes')
  await intro.locator('.section-intro__more').click()
  await expect(page).toHaveURL(/\/settings\?tab=notes&lens=comprendre$/)
  const target = page.locator('.guide__card.is-target')
  await expect(target).toBeVisible()
})

test('dismissing the card hides it for good', async ({ page }) => {
  await boot(page, '/kitchen')
  const intro = page.locator('.section-intro')
  await expect(intro).toBeVisible()
  await intro.locator('.section-intro__dismiss').click()
  await expect(intro).toHaveCount(0)

  // The dismissal sticks across a reload (persisted in localStorage).
  await page.reload()
  await page.locator('.hub').first().waitFor({ state: 'visible' })
  await expect(page.locator('.section-intro')).toHaveCount(0)
})

test('the toddler lens never sees the welcome card', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', surface: 'kiosk', intros: true })
  await noTour(page)
  await page.goto('/kitchen')
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  await expect(page.locator('.section-intro')).toHaveCount(0)
})
