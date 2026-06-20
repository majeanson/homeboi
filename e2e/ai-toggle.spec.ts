import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Verifies the household AI on/off switch end-to-end in the running app (#IA):
// the Réglages header tag is a real toggle, flipping it PATCHes /api/household,
// /api/health then reports AI as off, and the whole UI hides its AI affordances
// (here: the search "Ask the AI" button). A stateful route models the backend so
// the round-trip is real, not faked in the assertion.
//
// Layered AFTER mockApi so these two routes win for health/household; everything
// else falls through to the shared mock.
async function withAiState(page: Page) {
  const state = { aiEnabled: true }
  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, app: 'Babillard', ai: state.aiEnabled, aiAvailable: true, invite: false, sessionSecret: true }),
    })
  })
  await page.route('**/api/household', async (route) => {
    if (route.request().method() === 'PATCH') {
      try {
        const b = JSON.parse(route.request().postData() || '{}')
        if ('aiEnabled' in b) state.aiEnabled = !!b.aiEnabled
      } catch {
        /* no body */
      }
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ name: 'Famille', postal: 'H2X 1Y4', includedStores: [], aiEnabled: state.aiEnabled }),
    })
  })
  return state
}

test('the Réglages header tag toggles AI on/off and the change persists', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await withAiState(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })

  await page.goto('/settings?tab=ai')
  // The IA settings section renders.
  await expect(page.getByRole('heading', { name: 'Intelligence artificielle' })).toBeVisible({ timeout: 15_000 })

  // The header status tag is the on/off button, starting "active".
  const tag = page.locator('.operator__meta button.tag--btn')
  await expect(tag).toContainText('active')

  // Turn AI off — it PATCHes the household and the tag flips to "désactivée".
  await Promise.all([
    page.waitForRequest((r) => r.url().includes('/api/household') && r.method() === 'PATCH'),
    tag.click(),
  ])
  await expect(tag).toContainText('désactivée')

  // Turn it back on.
  await Promise.all([
    page.waitForRequest((r) => r.url().includes('/api/household') && r.method() === 'PATCH'),
    tag.click(),
  ])
  await expect(tag).toContainText('active')
})

test('disabling AI hides the search "Ask the AI" affordance', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await withAiState(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })

  // AI on: typing a query in global search shows the "Ask" button.
  await page.goto('/search')
  await page.locator('.search__input').fill('souper')
  await expect(page.locator('.search__ask')).toBeVisible({ timeout: 15_000 })

  // Disable AI from settings.
  await page.goto('/settings?tab=ai')
  const tag = page.locator('.operator__meta button.tag--btn')
  await expect(tag).toContainText('active')
  await Promise.all([
    page.waitForRequest((r) => r.url().includes('/api/household') && r.method() === 'PATCH'),
    tag.click(),
  ])
  await expect(tag).toContainText('désactivée')

  // Back in search, the Ask button is gone (AI affordances hidden); the local
  // fuzzy search still works (not AI).
  await page.goto('/search')
  await page.locator('.search__input').fill('souper')
  await expect(page.locator('.search__ask')).toHaveCount(0)
})
