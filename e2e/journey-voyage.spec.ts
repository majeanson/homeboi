import { test, expect, type Page, type Request, type Route } from '@playwright/test'
import { mockApi, seedState, BASE } from './mocks'
import { test as test4 } from './fixtures'

// JOURNEY — VOYAGE (review #43; was voyage.spec.ts + voyage-share.spec.ts + voyage-undated.spec.ts + trips-index.spec.ts).
//
// Behavioural coverage for « Voyage » (the trip notebook), which had ZERO e2e (§822).
// The scene stubs its three endpoints — trips / trip-notes / trip-packing — from the
// test (the shared mock returns {} for unknown GETs, which would render "not found").
// Drives the real create → view → add-note → add/pack → edit → delete flow and asserts
// the correct write fires each time (every mock write returns {ok:true}, so we assert
// the request, not a refetched outcome — the interactions-*.spec discipline).

test.describe('voyage', () => {
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
    // Freeze the clock to the mock epoch (journey-board-arrange.spec.ts pattern). TRIP.end_at
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
    // The hold IS the gesture: a press lasts a duration, and no signal stands in for one.
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
})

// ── folded from voyage-share.spec.ts ──────────────────────────────────────────────
test.describe('voyage-share', () => {
  // Behavioural coverage for « Voyage partagé » — the cross-household shared trip (the
  // live twin of the private Voyage notebook). None of its surface had e2e: the shared
  // scene + its four sub-tabs, per-household bags, the promote (« Partager en direct »)
  // and join (« Rejoindre ») lifecycle, the « Inviter » link/QR sheet, and the board
  // « Prochain voyage » card's « Partagé » row. Every endpoint is stubbed from the test
  // (the harness has no backend); writes return {ok:true}, so we assert the REQUEST fired
  // (path + body) rather than a refetched outcome — the interactions-*.spec discipline.

  const DAY = 86400
  // Trip dates must sit in the FUTURE relative to the real clock: the board VoyageCard
  // filters on todayLocalDay() (live Date.now, not a frozen BASE), so a past trip would
  // be dropped from the glance and test 6 would see nothing.
  const NOW = Math.floor(Date.now() / 1000)
  const START = NOW + 10 * DAY
  const END = NOW + 14 * DAY

  const MY_HH = 'h1'

  // One shared trip as functions/api/shared-trip.ts shapes it (SharedTripRow + members +
  // myRole). My household (h1) is the owner; a second household (h2) is a plain member.
  const SHARED_TRIP = {
    id: 'st1',
    owner_household_id: 'h1',
    title: 'Chalet en famille',
    destination: 'Mont-Tremblant',
    start_at: START,
    end_at: END,
    media_kind: null,
    media_key: null,
    colour: '#5891AC',
    notes: null,
    invite_nonce: 'nonce1',
    position: 0,
    created_at: NOW,
    updated_at: null,
    members: [
      { household_id: 'h1', label: 'Maison Tremblay', colour: '#5891AC', role: 'owner' },
      { household_id: 'h2', label: 'Famille Roy', colour: '#C2563A', role: 'member' },
    ],
    myRole: 'owner',
  }

  // Two atemporal (date null → Infos tab) notes authored by DIFFERENT households, each
  // with a label so TripNoteCard renders its attribution "who" chip (the household name,
  // mapped from author_household_id via the pseudo-faces roster). Both category 'flight'
  // so both show under the Infos tab's default 'flight' bucket.
  const SHARED_NOTES = [
    { id: 'sn1', shared_trip_id: 'st1', category: 'flight', label: 'Vol aller', text: 'Départ 8h', media_kind: null, media_key: null, scene_key: null, author_household_id: 'h1', author_label: 'Maison Tremblay', date: null, position: 0, created_at: NOW, updated_at: null },
    { id: 'sn2', shared_trip_id: 'st1', category: 'flight', label: 'Auto de location', text: 'Réservée chez Guru', media_kind: null, media_key: null, scene_key: null, author_household_id: 'h2', author_label: 'Famille Roy', date: null, position: 1, created_at: NOW, updated_at: null },
  ]

  // One unpacked bag row per household (bag_label NULL = the shared bag). Own = editable,
  // the other household's = read-only.
  const SHARED_PACKING = [
    { id: 'pk1', shared_trip_id: 'st1', household_id: 'h1', bag_label: null, text: 'Passeports', packed_at: null, position: 0, created_at: NOW },
    { id: 'pk2', shared_trip_id: 'st1', household_id: 'h2', bag_label: null, text: 'Tente 4 places', packed_at: null, position: 0, created_at: NOW },
  ]

  // A private household trip, so the promote flow (test 3) mounts VoyagePage with content
  // and its « Partager en direct » foot button.
  const PRIVATE_TRIP = {
    id: 'trip1',
    title: 'Chalet en famille',
    destination: 'Mont-Tremblant',
    start_at: START,
    end_at: END,
    members: [],
    media_kind: null,
    media_key: null,
    colour: '#5891AC',
    notes: null,
    position: 0,
    created_at: NOW,
    updated_at: null,
  }

  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  const apiPath = (r: { url(): string }) => new URL(r.url()).pathname

  // Stub the whole shared-trip endpoint family. The GENERIC /api/shared-trip route is
  // registered FIRST so the specific `-notes` / `-packing` / `-invite` / `-join` routes
  // (registered after, hence higher-priority in Playwright's last-wins matching) claim
  // their own URLs, and the generic only ever serves /api/shared-trip itself.
  async function stubShared(
    page: Page,
    opts: {
      trip?: typeof SHARED_TRIP
      trips?: unknown[]
      notes?: unknown[]
      packing?: unknown[]
      promoteId?: string
      inviteUrl?: string
      joinPreview?: unknown
      joinId?: string
      claims?: unknown[]
    } = {},
  ) {
    const trip = opts.trip ?? SHARED_TRIP
    const trips = opts.trips ?? [trip]
    const notes = opts.notes ?? SHARED_NOTES
    const packing = opts.packing ?? SHARED_PACKING

    await page.route('**/api/shared-trip**', async (route: Route) => {
      const req = route.request()
      if (req.method() === 'GET') {
        const hasId = new URL(req.url()).searchParams.get('id')
        return route.fulfill(json(hasId ? { trip, myHouseholdId: MY_HH } : { trips }))
      }
      // POST = promote (or create); PATCH/DELETE = meta edit / dissolve.
      if (req.method() === 'POST') return route.fulfill(json({ ok: true, id: opts.promoteId ?? 'st1' }))
      return route.fulfill(json({ ok: true }))
    })
    await page.route('**/api/shared-trip-notes**', (route: Route) =>
      route.fulfill(route.request().method() === 'GET' ? json({ notes }) : json({ ok: true })),
    )
    await page.route('**/api/shared-trip-packing**', (route: Route) =>
      route.fulfill(route.request().method() === 'GET' ? json({ items: packing }) : json({ ok: true })),
    )
    await page.route('**/api/shared-trip-claims**', (route: Route) =>
      route.fulfill(route.request().method() === 'GET' ? json({ claims: opts.claims ?? [] }) : json({ ok: true, id: 'c-new' })),
    )
    await page.route('**/api/shared-trip-invite**', (route: Route) =>
      route.fulfill(
        route.request().method() === 'POST'
          ? json({ url: opts.inviteUrl ?? 'https://babillard.test/voyage/rejoindre?j=inv-tok', expiresAt: NOW + 14 * DAY })
          : json({ ok: true }),
      ),
    )
    await page.route('**/api/shared-trip-join**', (route: Route) => {
      if (route.request().method() === 'GET') {
        return opts.joinPreview
          ? route.fulfill(json(opts.joinPreview))
          : route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Lien invalide' }) })
      }
      return route.fulfill(json({ id: opts.joinId ?? 'st1' }))
    })
  }

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    // The shared scene opens a page-scoped st: realtime socket (connectSharedTripRealtime),
    // and the board opens the household one. Accept the /api/live handshake with a no-op
    // mock so neither spins its reconnect backoff — the same "realtime present but inert"
    // posture the other specs run under. Correctness never depends on the socket (polling
    // owns it); this just keeps the harness quiet.
    await page.routeWebSocket(/\/api\/live/, () => {})
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  })

  test('the shared scene renders the four sub-tabs, the « Partagé » chip and per-household note attribution', async ({ page }) => {
    await stubShared(page)
    await page.goto('/voyage/partage/st1')

    // The scene titles to the trip name and carries the shared badge.
    await expect(page.locator('.scene', { hasText: 'Chalet en famille' })).toBeVisible()
    await expect(page.getByText('Partagé', { exact: true })).toBeVisible()
    for (const label of ['Itinéraire', 'Infos', 'Bagages', 'Documents']) {
      await expect(page.locator('.subtabs__opt', { hasText: label })).toBeVisible()
    }

    // Infos → the two notes show, each tagged with its AUTHORING household's name.
    await page.locator('.subtabs__opt', { hasText: 'Infos' }).click()
    await expect(page.getByText('Départ 8h')).toBeVisible()
    await expect(page.locator('.trip-note__who', { hasText: 'Maison Tremblay' })).toBeVisible()
    await expect(page.locator('.trip-note__who', { hasText: 'Famille Roy' })).toBeVisible()
  })

  test('Bagages is per-household: own bag is editable, another household\'s is read-only', async ({ page }) => {
    await stubShared(page)
    await page.goto('/voyage/partage/st1?vue=bagages')

    // My household's group: an add field + a checkable row.
    const mine = page.locator('.voyage-packing__group', { hasText: 'Maison Tremblay' })
    await expect(page.getByLabel('Ajouter à mes valises…')).toBeVisible()
    await expect(mine.getByText('Passeports')).toBeVisible()
    await expect(mine.getByRole('button', { name: 'Marquer comme emballé' })).toHaveCount(1)

    // The other household's group: the row shows but carries NO check/edit affordance.
    const other = page.locator('.voyage-packing__group', { hasText: 'Famille Roy' })
    await expect(other.getByText('Tente 4 places')).toBeVisible()
    await expect(other.getByRole('button', { name: 'Marquer comme emballé' })).toHaveCount(0)
    await expect(other.getByRole('button', { name: 'Modifier' })).toHaveCount(0)
  })

  test('« Partager en direct » promotes a private trip: confirm → POST {fromTripId} → the shared scene', async ({ page }) => {
    // The private side (VoyagePage reads /api/trips) + the shared side (the landing).
    await page.route('**/api/trips**', (route: Route) =>
      route.fulfill(route.request().method() === 'GET' ? json({ trips: [PRIVATE_TRIP] }) : json({ ok: true })),
    )
    await stubShared(page, { promoteId: 'st1' })
    await page.goto('/voyage/trip1')

    // « Partager en direct » lives in the scene head's ⋯ overflow now.
    await page.locator('.scene__head .action-menu__btn').click()
    await page.getByRole('menuitem', { name: 'Partager en direct' }).click()
    // The destructive confirm dialog (it's a MOVE, not undoable). Its confirm CTA is « Partager ».
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'POST' && apiPath(r) === '/api/shared-trip', { timeout: 20_000 }),
      page.waitForURL(/\/voyage\/partage\/st1/),
      page.getByRole('button', { name: 'Partager', exact: true }).click(),
    ])
    expect(req.postDataJSON()).toMatchObject({ fromTripId: 'trip1' })
  })

  // What GET /api/shared-trip-join answers since 2026-11-12: the WHOLE trip, read-only,
  // households under aliases (h0, h1) — functions/api/shared-trip-join.ts.
  const JOIN_PREVIEW = {
    title: 'Chalet en famille',
    destination: 'Mont-Tremblant',
    start_at: START,
    end_at: END,
    colour: '#88a36f',
    media_key: null,
    members: 2,
    households: [
      { id: 'h0', label: 'Maison Tremblay', colour: '#e07a5f', role: 'owner' },
      { id: 'h1', label: 'Famille Roy', colour: '#3d85c6', role: 'member' },
    ],
    notes: [
      { id: 'pn1', shared_trip_id: 'preview', category: 'activity', label: null, text: 'Feu de camp au lac', media_kind: null, media_key: null, scene_key: null, author_household_id: 'h1', author_label: 'Famille Roy', date: START, position: 0, created_at: NOW, updated_at: null },
    ],
    packing: [{ id: 'pp1', shared_trip_id: 'preview', household_id: 'h1', bag_label: null, text: 'Lampe frontale', packed_at: null, position: 0, created_at: NOW }],
    claims: [
      { id: 'pc1', shared_trip_id: 'preview', kind: 'gear', text: 'Réchaud', date: null, slot: null, household_id: 'h0', household_label: 'Maison Tremblay', author_household_id: null, position: 0, created_at: NOW, updated_at: null },
      { id: 'pc2', shared_trip_id: 'preview', kind: 'meal', text: 'Chili', date: START, slot: 'supper', household_id: 'h1', household_label: 'Famille Roy', author_household_id: null, position: 0, created_at: NOW, updated_at: null },
    ],
  }

  test('« Rejoindre » previews the invite then joins: POST {token} → the shared scene', async ({ page }) => {
    await stubShared(page, { joinId: 'st1', joinPreview: JOIN_PREVIEW })
    await page.goto('/voyage/rejoindre?j=tok')

    // The preview: trip title + the household count, and the trip itself below.
    await expect(page.locator('.scene', { hasText: 'Chalet en famille' })).toBeVisible()
    await expect(page.getByText('2 maisonnées')).toBeVisible()
    await expect(page.getByText('Feu de camp au lac')).toBeVisible()

    const [req] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'POST' && apiPath(r) === '/api/shared-trip-join', { timeout: 20_000 }),
      page.waitForURL(/\/voyage\/partage\/st1/),
      page.getByRole('button', { name: 'Rejoindre le voyage' }).click(),
    ])
    expect(req.postDataJSON()).toMatchObject({ token: 'tok' })
  })

  test('signed out: the invite shows the whole trip read-only, and « Créer mon compte » comes back to it', async ({ page }) => {
    // A friend with NO Babillard opens the link from a group chat (Marc, 2026-11-12). Before,
    // the GET was operator-only and they were bounced to /login having seen nothing.
    await mockApi(page, { signedIn: false })
    await stubShared(page, { joinPreview: JOIN_PREVIEW })
    await page.goto('/voyage/rejoindre?j=tok')

    await expect(page.getByText('Feu de camp au lac')).toBeVisible()
    await expect(page.getByText('Aperçu en lecture seule')).toBeVisible()
    // No door into the trip: no day ＋, no ✏️/🗑️, no join button for a stranger.
    await expect(page.getByRole('button', { name: 'Rejoindre le voyage' })).toHaveCount(0)
    await expect(page.locator('.sec-label__act')).toHaveCount(0)

    // « Qui cuisine » + « Qui apporte quoi » read as names, with no claim button.
    await page.locator('.subtabs__opt', { hasText: 'Repas' }).click()
    await expect(page.getByText('Famille Roy cuisine')).toBeVisible()
    await page.locator('.subtabs__opt', { hasText: 'Bagages' }).click()
    await expect(page.getByText('Maison Tremblay l’apporte')).toBeVisible()
    await expect(page.getByText('Lampe frontale')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Je l’apporte' })).toHaveCount(0)

    const back = encodeURIComponent('/voyage/rejoindre?j=tok')
    await expect(page.getByRole('link', { name: 'Créer mon compte et rejoindre' })).toHaveAttribute('href', `/signup?next=${back}`)
    await expect(page.getByRole('link', { name: 'J’ai déjà un compte' })).toHaveAttribute('href', `/login?next=${back}`)
  })

  test('« Qui apporte quoi »: a free row is one tap to claim (PATCH {claim:true})', async ({ page }) => {
    await stubShared(page, {
      claims: [
        { id: 'g1', shared_trip_id: 'st1', kind: 'gear', text: 'Tente-cuisine', date: null, slot: null, household_id: null, household_label: null, author_household_id: 'h2', position: 0, created_at: NOW, updated_at: null },
      ],
    })
    await page.goto('/voyage/partage/st1?vue=bagages')
    await expect(page.getByText('Personne encore')).toBeVisible()
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'PATCH' && apiPath(r) === '/api/shared-trip-claims', { timeout: 20_000 }),
      page.getByRole('button', { name: 'Je l’apporte' }).click(),
    ])
    expect(req.postDataJSON()).toMatchObject({ id: 'g1', claim: true })
  })

  test('« Qui cuisine »: an empty supper is one tap to take (POST, already claimed)', async ({ page }) => {
    await stubShared(page)
    await page.goto('/voyage/partage/st1?vue=repas')
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'POST' && apiPath(r) === '/api/shared-trip-claims', { timeout: 20_000 }),
      page.locator('.voyage-itin__day').first().getByRole('button', { name: 'On cuisine' }).last().click(),
    ])
    expect(req.postDataJSON()).toMatchObject({ tripId: 'st1', kind: 'meal', slot: 'supper', claim: true, date: START })
  })

  test('a member leaves from the scene foot: leave confirm → keep-copy ask → POST shared-trip-leave → /board', async ({ page }) => {
    // As a plain MEMBER (not the owner) the foot shows « Quitter le voyage »; the owner
    // sees « Dissoudre » instead. Leaving asks two quick confirms: the danger leave, then
    // whether to keep a private copy — answered « Garder une copie » here → keepCopy: true.
    await stubShared(page, { trip: { ...SHARED_TRIP, myRole: 'member' } })
    await page.goto('/voyage/partage/st1')

    await page.getByRole('button', { name: 'Quitter le voyage' }).click()
    // Confirm 1 (danger) — its CTA repeats the label, so scope to the dialog.
    await page.getByRole('alertdialog').getByRole('button', { name: 'Quitter le voyage' }).click()
    // Confirm 2 (neutral) — keep a private copy?
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'POST' && apiPath(r) === '/api/shared-trip-leave', { timeout: 20_000 }),
      page.waitForURL(/\/board/),
      page.getByRole('alertdialog').getByRole('button', { name: 'Garder une copie' }).click(),
    ])
    expect(req.postDataJSON()).toMatchObject({ sharedTripId: 'st1', keepCopy: true })
  })

  test('« Inviter » mints a share link: the URL input + QR + copy button render', async ({ page }) => {
    const url = 'https://babillard.test/voyage/rejoindre?j=inv-tok'
    await stubShared(page, { inviteUrl: url })
    await page.goto('/voyage/partage/st1')

    // exact: the « Partagé » header chip (aria-label « Inviter une maisonnée ») also
    // opens this sheet and would substring-match a loose 'Inviter'.
    await page.getByRole('button', { name: 'Inviter', exact: true }).click()
    // The sheet opens on the "create the link" state; minting it (POST shared-trip-invite)
    // reveals the link input, the copy button and the scannable QR.
    await page.getByRole('button', { name: 'Créer le lien d’invitation' }).click()
    await expect(page.getByRole('textbox', { name: 'Copier le lien' })).toHaveValue(url)
    await expect(page.getByRole('button', { name: 'Copier le lien' })).toBeVisible()
    await expect(page.locator('.qrcode img')).toBeVisible()
  })

  test('the board « Prochain voyage » card shows the shared row with a « Partagé » chip linking to the shared scene', async ({ page }) => {
    // Only the shared list is populated (mockApi returns {} for /api/trips → no private trips).
    await stubShared(page, { trips: [SHARED_TRIP] })
    await page.goto('/board')

    const card = page.locator('.voyage-card')
    const link = card.locator('a[href="/voyage/partage/st1"]')
    await expect(link).toBeVisible()
    await expect(link).toContainText('Chalet en famille')
    await expect(link.getByText('Partagé', { exact: true })).toBeVisible()
  })
})


// ── folded from voyage-undated.spec.ts ──────────────────────────────────────────────
test.describe('voyage-undated', () => {
  // REVIEW-PASS « voy »: a trip with no dates yet was filtered out of the board's
  // « Prochain voyage » card, and that card plus /search are the only two places trips
  // are listed at all. So you could create « on veut aller en Gaspésie, un jour », close
  // the scene, and never find it again unless you remembered the name well enough to
  // search it.
  //
  // Requiring dates would have been the wrong fix — an early idea legitimately has none,
  // and a made-up date to keep the trip visible is worse than no date. So undated trips
  // fill the REMAINDER of the card: they are reachable, but they never displace a real
  // upcoming departure off a three-row list.

  const DAY = 86400
  const soon = (d: number) => Math.floor(Date.now() / 1000 / DAY) * DAY + d * DAY

  const dated = (id: string, title: string, inDays: number) => ({
    id, title, colour: '#2a8f85', destination: null, notes: null, members: [],
    media_kind: null, media_key: null, position: 0, created_at: 1, updated_at: null,
    start_at: soon(inDays), end_at: soon(inDays + 3),
  })
  const undated = (id: string, title: string, created: number) => ({
    id, title, colour: '#2a8f85', destination: null, notes: null, members: [],
    media_kind: null, media_key: null, position: 0, created_at: created, updated_at: null,
    start_at: null, end_at: null,
  })

  async function board(page: Page, trips: unknown[]) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await page.route('**/api/trips**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ trips }) }),
    )
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })
    await page.goto('/board')
  }

  test('an undated trip is reachable from the board instead of vanishing', async ({ page }) => {
    await board(page, [undated('t1', 'Gaspésie un jour', 100)])
    const card = page.locator('.voyage-card')
    await expect(card).toBeVisible()
    const row = card.locator('a[href="/voyage/t1"]')
    await expect(row).toBeVisible()
    await expect(row).toContainText('Gaspésie un jour')
    // It says so plainly rather than computing a countdown from a null — the first
    // draft of this rendered « dans NaN jours ».
    await expect(row).toContainText('Sans dates')
    await expect(row).not.toContainText('NaN')
  })

  test('undated trips fill the remainder — they never displace an upcoming departure', async ({ page }) => {
    // Three someday-ideas plus one real departure. The card holds three rows; the
    // departure must be one of them, and it must come first.
    await board(page, [
      undated('u1', 'Idée un', 300),
      undated('u2', 'Idée deux', 200),
      undated('u3', 'Idée trois', 100),
      dated('d1', 'Départ la semaine prochaine', 7),
    ])
    const rows = page.locator('.voyage-card__row')
    await expect(rows).toHaveCount(3)
    await expect(rows.first()).toContainText('Départ la semaine prochaine')
    // Newest-first among the undated, since they have nothing else to sort by.
    await expect(rows.nth(1)).toContainText('Idée un')
    await expect(rows.nth(2)).toContainText('Idée deux')
  })

  test('with no trips at all the card still reports empty (no blank shell)', async ({ page }) => {
    await board(page, [])
    await expect(page.locator('.voyage-card')).toHaveCount(0)
  })

  // ---- The cover photo, no longer a write-only dead branch ---------------------
  //
  // `trips.media_key` had a column, a PATCH branch and correct old-blob cleanup since
  // the feature shipped — but no picker anywhere and no render anywhere, so it could
  // never be anything but null. Now: picked in the trip form (the shared PhotoField),
  // shown as the board row's thumbnail.

  test('the trip form offers a cover picker, and the picked key is what gets saved', async ({ page }) => {
    let patched: Record<string, unknown> | null = null
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await page.route('**/api/trips**', async (route) => {
      const m = route.request().method()
      if (m === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ trips: [dated('t1', 'Gaspésie', 7)] }) })
      }
      if (m === 'PATCH') patched = route.request().postDataJSON()
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })
    // The blob upload hands back the opaque key the row then stores.
    await page.route('**/api/trip-doc-media**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: 'tn_cover.png', kind: 'image' }) }),
    )
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/voyage/t1')

    await page.locator('.scene__head .action-menu__btn').click()
    await page.getByRole('menuitem', { name: 'Modifier le voyage' }).click()

    const input = page.locator('.business-form__photo input[type="file"]')
    await expect(input).toHaveCount(1)
    await input.setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') })
    // The upload resolved → the field shows the picture instead of the placeholder.
    await expect(page.locator('.business-form__photo-img')).toBeVisible()

    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect.poll(() => patched, { timeout: 10_000 }).not.toBeNull()
    expect((patched as unknown as { media_key?: string }).media_key).toBe('tn_cover.png')
  })

  test('a trip with a cover shows it on the board row; one without shows no broken tile', async ({ page }) => {
    await board(page, [
      { ...dated('t1', 'Avec photo', 7), media_kind: 'image', media_key: 'tn_cover.png' },
      dated('t2', 'Sans photo', 9),
    ])
    await page.route('**/api/img/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') }),
    )
    const withPhoto = page.locator('.voyage-card__row', { hasText: 'Avec photo' })
    const without = page.locator('.voyage-card__row', { hasText: 'Sans photo' })
    await expect(withPhoto.locator('img.voyage-card__cover')).toHaveCount(1)
    await expect(without.locator('img.voyage-card__cover')).toHaveCount(0)
    // Decorative: the title carries the meaning, so the image is not announced.
    await expect(withPhoto.locator('img.voyage-card__cover')).toHaveAttribute('alt', '')
  })
})


// ── folded from trips-index.spec.ts ──────────────────────────────────────────────
test4.describe('trips-index', () => {
  // « Tous les voyages » (solidify 4.4): the board card shows three rows, so a trip that is
  // over or a fourth idea had no list at all. Coming trips lead, what is over folds away.
  const DAY = 86_400
  const now = Math.floor(Date.now() / 1000)
  const trip = (id: string, title: string, start: number | null, end: number | null) => ({
    id, title, destination: null, start_at: start, end_at: end, media_key: null, created_at: 1_700_000_000,
  })
  const trips = {
    trips: [
      trip('soon', 'Gaspésie', now + 10 * DAY, now + 14 * DAY),
      trip('over', 'Floride', now - 60 * DAY, now - 50 * DAY),
      trip('idea', 'Japon un jour', null, null),
    ],
  }

  test4('coming trips and ideas lead, a past trip folds away, a row opens its trip', async ({ page, app }) => {
    await app.boot({ route: '/voyage', api: { overrides: { trips } }, wait: '.listrow' })
    await expect(page.locator('.listrow')).toHaveCount(2)
    await expect(page.locator('.scene__body')).not.toContainText('Floride')
    await page.getByRole('button', { name: 'Voyages passés' }).click()
    await expect(page.locator('.scene__body')).toContainText('Floride')
    await page.locator('.listrow', { hasText: 'Gaspésie' }).click()
    await expect(page).toHaveURL(/\/voyage\/soon/)
  })

  test4('no trip at all says so and offers the door', async ({ page, app }) => {
    await app.boot({ route: '/voyage', api: { overrides: { trips: { trips: [] } } }, wait: '.scene__body' })
    await expect(page.locator('.scene__body')).toContainText('Aucun voyage')
    await expect(page.locator('.scene__body a[href="/voyage/new"]')).toBeVisible()
  })
})
