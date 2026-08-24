import { test, expect, type Page, type Route } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Behavioural coverage for « Voyage partagé » — the cross-household shared trip (the
// live twin of the private Voyage notebook). None of its surface had e2e: the shared
// scene + its four sub-tabs, per-household bags, the promote (« Partager en direct »)
// and join (« Rejoindre ») lifecycle, the « Inviter » link/QR sheet, and the board
// « Prochain voyage » card's « Partagé » row. Every endpoint is stubbed from the test
// (the harness has no backend); writes return {ok:true}, so we assert the REQUEST fired
// (path + body) rather than a refetched outcome — the interactions.spec discipline.

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

test('« Rejoindre » previews the invite then joins: POST {token} → the shared scene', async ({ page }) => {
  await stubShared(page, {
    joinId: 'st1',
    joinPreview: { title: 'Chalet en famille', destination: 'Mont-Tremblant', start_at: START, end_at: END, members: 2 },
  })
  await page.goto('/voyage/rejoindre?j=tok')

  // The preview: trip title + the household count.
  await expect(page.getByRole('heading', { name: 'Chalet en famille' })).toBeVisible()
  await expect(page.getByText('2 maisonnées')).toBeVisible()

  const [req] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'POST' && apiPath(r) === '/api/shared-trip-join', { timeout: 20_000 }),
    page.waitForURL(/\/voyage\/partage\/st1/),
    page.getByRole('button', { name: 'Rejoindre le voyage' }).click(),
  ])
  expect(req.postDataJSON()).toMatchObject({ token: 'tok' })
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
