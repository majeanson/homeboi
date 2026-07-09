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

// D-19 (bmad/10) « La carte de la gardienne se complète » — the opt-in « Joindre un
// parent » target renders ATOP the Urgence section as a tel: line, and is absent
// when the operator never turned it on (reachParent: null).
test('/handoff: « Joindre un parent » shows a tel: line atop Urgence when set', async ({ page }) => {
  await mockApi(page)
  await stubWindow(page, 200, {
    kind: 'sitter',
    householdName: 'Maison Tremblay',
    wifi: { ssid: null, password: null },
    houseRules: null,
    binDay: null,
    today: { events: [], meals: [] },
    bedtimeRoutines: [],
    toKnow: [],
    emergency: [{ name: 'Mamie', phone: '450-555-0201' }],
    pins: [],
    reachParent: { name: 'Papa', phone: '514-555-0102' },
  })
  await seedState(page, { theme: 'day', lang: 'fr' })
  await page.goto('/handoff')
  await expect(page.getByText('Joindre un parent')).toBeVisible()
  const call = page.getByRole('link', { name: /514-555-0102/ })
  await expect(call).toBeVisible()
  await expect(call).toHaveAttribute('href', 'tel:514-555-0102')
})

test('/handoff: no « Joindre un parent » line when the operator left it off', async ({ page }) => {
  await mockApi(page)
  await stubWindow(page, 200, {
    kind: 'sitter',
    householdName: 'Maison Tremblay',
    wifi: { ssid: null, password: null },
    houseRules: null,
    binDay: null,
    today: { events: [], meals: [] },
    bedtimeRoutines: [],
    toKnow: [],
    emergency: [{ name: 'Mamie', phone: '450-555-0201' }],
    pins: [],
    reachParent: null,
  })
  await seedState(page, { theme: 'day', lang: 'fr' })
  await page.goto('/handoff')
  await expect(page.getByText('Mamie')).toBeVisible() // the card did load
  await expect(page.getByText('Joindre un parent')).toHaveCount(0)
})
