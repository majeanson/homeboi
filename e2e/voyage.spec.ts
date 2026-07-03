import { test, expect, type Page, type Request } from '@playwright/test'
import { mockApi, seedState, BASE } from './mocks'

// Behavioural coverage for « Voyage » (the trip notebook), which had ZERO e2e (§822).
// The scene stubs its three endpoints — trips / trip-notes / trip-packing — from the
// test (the shared mock returns {} for unknown GETs, which would render "not found").
// Drives the real create → view → add-note → add/pack → edit → delete flow and asserts
// the correct write fires each time (every mock write returns {ok:true}, so we assert
// the request, not a refetched outcome — the interactions.spec discipline).

const DAY = 86400

// One populated trip so the view + its four sub-tabs render with real content.
const TRIP = {
  id: 'trip1',
  title: 'Vacances en Floride',
  destination: 'Orlando',
  start_at: BASE,
  end_at: BASE + 5 * DAY,
  members: ['m3', 'm4'],
  media_kind: null,
  media_key: null,
  colour: '#5891AC',
  notes: null,
  position: 0,
  created_at: BASE,
  updated_at: null,
}
const TRIP_NOTES = [
  { id: 'tn1', trip_id: 'trip1', category: 'general', label: null, text: 'Passeports dans le sac à dos', media_kind: null, media_key: null, scene_key: null, member_id: null, date: null, position: 0, created_at: BASE, updated_at: null },
]
const PACKING = [
  { id: 'pk1', trip_id: 'trip1', member_id: null, text: 'Crème solaire', packed_at: null, position: 0, created_at: BASE },
]

const isApi = (method: string, path: string) => (r: Request) =>
  r.method() === method && new URL(r.url()).pathname === `/api/${path}`

async function expectApi(page: Page, method: string, path: string, action: () => Promise<void>) {
  await Promise.all([page.waitForRequest(isApi(method, path), { timeout: 20_000 }), action()])
}

// Stub the three trip endpoints. `newTripId` makes a trips POST return that id so the
// create flow can navigate to /voyage/<id>.
async function stubVoyage(page: Page, opts: { newTripId?: string; trips?: unknown[] } = {}) {
  const trips = opts.trips ?? [TRIP]
  await page.route('**/api/trips**', async (route) => {
    const m = route.request().method()
    if (m === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ trips }) })
    if (m === 'POST') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: opts.newTripId ?? 'newtrip' }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  await page.route('**/api/trip-notes**', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes: TRIP_NOTES }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  await page.route('**/api/trip-packing**', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: PACKING }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
})

test('creating a trip posts to trips and navigates to it', async ({ page }) => {
  await stubVoyage(page, { newTripId: 'newtrip' })
  await page.goto('/voyage/new')
  await expect(page.getByLabel('Nom du voyage')).toBeVisible()
  await page.getByLabel('Nom du voyage').fill('Escapade à Québec')
  await Promise.all([
    page.waitForRequest(isApi('POST', 'trips'), { timeout: 20_000 }),
    page.waitForURL(/\/voyage\/newtrip/),
    page.getByRole('button', { name: 'Créer le voyage' }).click(),
  ])
})

test('the trip view shows the four sub-tabs', async ({ page }) => {
  await stubVoyage(page)
  await page.goto('/voyage/trip1')
  // The scene titles to the trip name; the SubTabs carry the four sections.
  await expect(page.locator('.scene', { hasText: 'Vacances en Floride' })).toBeVisible()
  for (const label of ['Itinéraire', 'Infos', 'Bagages', 'Documents']) {
    await expect(page.locator('.subtabs__opt', { hasText: label })).toBeVisible()
  }
})

test('adding a packing item posts to trip-packing', async ({ page }) => {
  await stubVoyage(page)
  await page.goto('/voyage/trip1?vue=bagages')
  const add = page.getByLabel('Ajouter à la liste partagée…')
  await expect(add).toBeVisible()
  await add.fill('Maillot de bain')
  await expectApi(page, 'POST', 'trip-packing', () => add.press('Enter'))
})

test('checking a packing item removes it from the open list', async ({ page }) => {
  await stubVoyage(page)
  await page.goto('/voyage/trip1?vue=bagages')
  // The fixture's one open item shows; checking it packs + removes it (deferred behind
  // the undo toast — the row hides at once via useDeferredRemoval).
  const row = page.locator('.kitchen__pantry li', { hasText: 'Crème solaire' })
  await expect(row).toBeVisible()
  await page.getByRole('button', { name: 'Marquer comme emballé' }).first().click()
  await expect(row).toHaveCount(0)
})

test('adding an info note (after picking a category) posts to trip-notes', async ({ page }) => {
  await stubVoyage(page)
  await page.goto('/voyage/trip1?vue=infos')
  // A category must be picked before the add field appears.
  await page.locator('.chip', { hasText: 'Hébergement' }).click()
  const add = page.getByLabel('Noter une info — Hébergement…')
  await expect(add).toBeVisible()
  await add.fill('Hôtel Marriott, chambre 214')
  await expectApi(page, 'POST', 'trip-notes', () => add.press('Enter'))
})

test('editing the trip posts a PATCH', async ({ page }) => {
  await stubVoyage(page)
  await page.goto('/voyage/trip1')
  await page.getByRole('button', { name: 'Modifier le voyage' }).click()
  const name = page.getByLabel('Nom du voyage')
  await expect(name).toHaveValue('Vacances en Floride')
  await name.fill('Vacances en Floride 2026')
  await expectApi(page, 'PATCH', 'trips', () =>
    page.getByRole('button', { name: 'Enregistrer' }).click(),
  )
})

test('deleting the trip confirms then DELETEs', async ({ page }) => {
  await stubVoyage(page)
  await page.goto('/voyage/trip1')
  await page.getByRole('button', { name: 'Modifier le voyage' }).click()
  await page.getByRole('button', { name: 'Supprimer le voyage' }).click()
  // The heavy delete asks first via the confirm dialog; accept it → DELETE fires.
  await expectApi(page, 'DELETE', 'trips', () =>
    page.getByRole('button', { name: 'Supprimer', exact: true }).click(),
  )
})
