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
  // Two DATED entries on day 1, so the itinerary renders a reorderable day (the ⠿
  // grips only show when a day holds 2+ entries).
  { id: 'tn2', trip_id: 'trip1', category: 'activity', label: null, text: 'Musée des sciences', media_kind: null, media_key: null, scene_key: null, member_id: null, date: BASE, position: 0, created_at: BASE + 100, updated_at: null },
  { id: 'tn3', trip_id: 'trip1', category: 'activity', label: null, text: 'Souper au vieux port', media_kind: null, media_key: null, scene_key: null, member_id: null, date: BASE, position: 0, created_at: BASE + 50, updated_at: null },
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
  // Freeze the clock to the mock epoch (board-customize.spec.ts pattern). TRIP.end_at
  // is BASE + 5 days — VoyagePage derives `finished` from the REAL wall clock
  // (todayLocalDay() → Date.now()), so as real time drifts further past the fixed
  // BASE anchor, TRIP silently crosses into "finished" and the scene renders the
  // read-only album instead of the editor/sub-tabs these tests exercise. Freezing
  // keeps the fixture's "today" pinned to BASE, matching the trip's intended
  // upcoming/active state regardless of when the suite actually runs.
  await page.clock.setFixedTime(new Date(BASE * 1000))
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

test('dragging an itinerary entry within its day PATCHes its position', async ({ page }) => {
  await stubVoyage(page)
  await page.goto('/voyage/trip1') // itinéraire is the default sub-tab
  const day1 = page.locator('[data-jour="1"]')
  const rows = day1.locator('.voyage-itin__row')
  await expect(rows).toHaveCount(2)

  // Hold-to-drag (DND_HOLD_MS = 400): press the FIRST row's grip, rest past the
  // hold, then glide onto the second row and release — the drop renumbers the day.
  const grip = rows.first().locator('.dnd-grip')
  const target = await rows.nth(1).boundingBox()
  const from = await grip.boundingBox()
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(600)
  const patch = page.waitForRequest(
    (r) => isApi('PATCH', 'trip-notes')(r) && typeof r.postDataJSON()?.position === 'number',
    { timeout: 20_000 },
  )
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 8 })
  await page.mouse.up()
  const req = await patch
  // Moving the top entry below the other: the displaced entry pins position 1.
  expect(req.postDataJSON()).toMatchObject({ position: 1 })
})

test('attaching a PDF from a day composer uploads then posts a document note on that day', async ({ page }) => {
  await stubVoyage(page)
  await page.route('**/api/trip-doc-media**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: 'tn_e2e.pdf', kind: 'image' }) }),
  )
  await page.goto('/voyage/trip1')
  const day1 = page.locator('[data-jour="1"]')
  // The day's composer waits behind the ＋ in its header now (it used to sit open under
  // every day of the trip — see VoyageItinerary / LEAN.md). Open day 1's.
  await day1.locator('.sec-label__actbtn').click()
  await expect(day1.getByRole('button', { name: 'Ajouter un document' })).toBeVisible()

  const post = page.waitForRequest(
    (r) => isApi('POST', 'trip-notes')(r) && r.postDataJSON()?.media_key === 'tn_e2e.pdf',
    { timeout: 20_000 },
  )
  // The picker input is hidden — hand it the file directly (same gesture the button opens).
  await day1.locator('input[type="file"][accept*="pdf"]').setInputFiles({
    name: 'billet-avion.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 e2e'),
  })
  const req = await post
  // category 'document' (shows under Documents too), pinned to day 1, named after the file.
  expect(req.postDataJSON()).toMatchObject({
    category: 'document',
    media_kind: 'image',
    media_key: 'tn_e2e.pdf',
    label: 'billet-avion.pdf',
    date: BASE,
  })
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
  // The trip's manage actions live in the scene head's ⋯ overflow now.
  await page.locator('.scene__head .action-menu__btn').click()
  await page.getByRole('menuitem', { name: 'Modifier le voyage' }).click()
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
  // The trip's manage actions live in the scene head's ⋯ overflow now.
  await page.locator('.scene__head .action-menu__btn').click()
  await page.getByRole('menuitem', { name: 'Modifier le voyage' }).click()
  await page.getByRole('button', { name: 'Supprimer le voyage' }).click()
  // The heavy delete asks first via the confirm dialog; accept it → DELETE fires.
  await expectApi(page, 'DELETE', 'trips', () =>
    page.getByRole('button', { name: 'Supprimer', exact: true }).click(),
  )
})
