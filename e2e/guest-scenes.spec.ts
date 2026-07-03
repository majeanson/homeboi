import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// The typed share-link landings (#34/#35/#36 — /handoff, /welcome, /family) must show a
// DISTINCT "this link is no longer valid" state when the guest token is expired/revoked
// (guest/window → 401), not a blank empty-household card. Locks the GuestExpired branch
// (REVIEW-PASS §security: guest scenes only read {data,isLoading}, never isError).

const SCENES = ['/handoff', '/welcome', '/family']

async function stubWindow(page: import('@playwright/test').Page, status: number, body: unknown) {
  await page.route('**/api/guest/window**', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  )
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1000 })
})

for (const path of SCENES) {
  test(`${path}: an expired/revoked link shows the expired state`, async ({ page }) => {
    await mockApi(page)
    await stubWindow(page, 401, { error: 'expiré' })
    await seedState(page, { theme: 'day', lang: 'fr' })
    await page.goto(path)
    await expect(page.locator('.guest-expired')).toBeVisible()
    await expect(page.locator('.guest-expired__title')).toBeVisible()
  })
}

test('/welcome: a valid link shows content, never the expired state', async ({ page }) => {
  await mockApi(page)
  await stubWindow(page, 200, {
    householdName: 'Maison Tremblay',
    wifi: { ssid: 'BellFibe-1234', password: 'secret' },
    houseRules: null,
    binDay: 'Mardi',
  })
  await seedState(page, { theme: 'day', lang: 'fr' })
  await page.goto('/welcome')
  await expect(page.getByText('BellFibe-1234')).toBeVisible()
  await expect(page.locator('.guest-expired')).toHaveCount(0)
})
