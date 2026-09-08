import { test, expect, type Page, type Request } from '@playwright/test'
import { mockApi, seedState, BASE, MMID } from './mocks'

// Behavioural coverage for the Réglages config panels that were screenshot-only, so
// a broken PATCH would have shipped green (§211). Each test asserts the write fires
// AND carries the right field, so a mis-wired save (or a regressed useWrite
// migration) is caught. The meal-slot panel in particular was moved from raw api()
// to useWrite — this locks that in.
//
// Why this file keeps growing (2026-09-03): a settings panel is the one surface where
// « renders correctly » and « works » come apart completely. Every control here
// commits optimistically, so the row reads saved whether or not the write ever left —
// which is why a screenshot sweep passes over a panel that persists nothing. Measured
// that day: 24 subs in SETTINGS_SUBS, 17 panels that write, and only a handful (here
// plus interactions.spec) asserted a request at all. Adding a panel to Réglages means
// adding its write here.
//
// Re-measured 2026-09-08, after the 28 → 14 merge: 17 writing sections, and with the
// second sweep at the foot of this file every one of them asserts its write (the
// a-regler snooze in a-regler-snooze.spec, the recipe-tag slots in
// recipe-tag-slots.spec). Left unasserted, deliberately named: a member DELETE (the
// confirm-gated cascade) and a photo UPLOAD (a multipart POST the mock can't shape).
//
// Every assertion below has been run against a planted bug — the wrong field name, a
// dropped id, a missing colour — and seen to fail. A green settings test that has
// never been shown red is decoration (CLAUDE.md, the guard rule).

const isApi = (method: string, path: string) => (r: Request) =>
  r.method() === method && new URL(r.url()).pathname === `/api/${path}`

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
})

// Réglages ▸ Cuisine (tab 'recipes') shows one sub-section at a time behind a SubTabs
// row (tags / pills / measures / meal-slots / réserve). Deep-link straight to the sub
// (?tab=recipes&sub=<key>) so only that section renders in the panel, and scope
// assertions to the tabpanel (#operator-panel).

test('hiding a meal slot patches household with the hidden slot', async ({ page }) => {
  await page.goto('/settings?tab=recipes&sub=meals')
  const section = page.locator('#operator-panel')
  await expect(section).toBeVisible()
  // Every slot starts « Affiché » (no mealHidden in the fixture). Toggling the first
  // one off saves the whole household setting — a whole-array PATCH via useWrite.
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
    section.getByRole('button', { name: 'Affiché' }).first().click(),
  ])
  const body = JSON.parse(req.postData() || '{}') as { mealHidden?: string[] }
  expect(Array.isArray(body.mealHidden)).toBe(true)
  expect(body.mealHidden!.length).toBe(1)
  // The button flips to « Masqué » optimistically.
  await expect(section.getByRole('button', { name: 'Masqué' })).toHaveCount(1)
})

test('adding a réserve location patches household with the new list', async ({ page }) => {
  await page.goto('/settings?tab=recipes&sub=reserve')
  const section = page.locator('#operator-panel')
  await expect(section).toBeVisible()
  await section.getByLabel('Ajouter un emplacement…').fill('Congélateur du sous-sol')
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
    // EditField submits on Enter (its submit button also works); Enter is simplest.
    section.getByLabel('Ajouter un emplacement…').press('Enter'),
  ])
  const body = JSON.parse(req.postData() || '{}') as { reserveLocations?: { name: string }[] }
  expect(Array.isArray(body.reserveLocations)).toBe(true)
  expect(body.reserveLocations!.some((l) => l.name === 'Congélateur du sous-sol')).toBe(true)
})

// D-17 « La rentrée » (bmad/10) — SchoolYearSection stacks under the SAME 'events'
// pill as EventsSection (Réglages ▸ Le babillard ▸ Rendez-vous, C-15 rule: a new
// setting merges into an existing sub). Same PATCH /api/household pattern as above.
test('setting school-year bounds patches household with schoolYear', async ({ page }) => {
  await page.goto('/settings?tab=board&sub=events')
  const section = page.locator('#operator-panel')
  await expect(section.getByRole('heading', { name: 'Année scolaire' })).toBeVisible()
  await section.getByLabel('Rentrée (premier jour)').fill('2026-09-01')
  await section.getByLabel('Dernier jour').fill('2027-06-18')
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
    section.getByRole('button', { name: 'Enregistrer' }).click(),
  ])
  const body = JSON.parse(req.postData() || '{}') as {
    schoolYear?: { firstDay: number; lastDay: number; breaks: unknown[] }
  }
  expect(body.schoolYear).toBeTruthy()
  expect(body.schoolYear!.firstDay).toBeLessThan(body.schoolYear!.lastDay)
  expect(Array.isArray(body.schoolYear!.breaks)).toBe(true)
})

// The READ side of the same feature: a household whose school-year bounds make
// TOMORROW la rentrée must show the board's 🎒 qualifier line — silent every other
// day by design (lib/year.schoolDayKind), so this is the one day it's provable.
test('a household schoolYear with tomorrow as la rentrée shows the board Demain 🎒 line', async ({ page }) => {
  await page.clock.setFixedTime(new Date(BASE * 1000))
  await mockApi(page)
  const rentree = MMID + 24 * 3600 // tomorrow, local midnight — MMID's weekday is a Sunday, so +1 day is a Monday
  await page.route('**/api/household', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        name: 'Famille',
        postal: 'H2X 1Y4',
        includedStores: [],
        aiEnabled: true,
        schoolYear: { firstDay: rentree, lastDay: rentree + 250 * 24 * 3600, breaks: [] },
      }),
    })
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/board')
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  await expect(page.locator('.tomorrow-school')).toContainText('École demain', { timeout: 15_000 })
})


// « Jours affichés » — the rolling meal-plan window, added 2026-08-27 with bmad/11
// tier-1 seam #1 (a Tuesday-anchored block could not reach the coming weekend from a
// Sunday evening). It stacks under the SAME 'meals' pill as the slot panel above
// (C-15), so this also asserts the two sections coexist there.
test('« Jours affichés » patches household with the chosen window', async ({ page }) => {
  await page.goto('/settings?tab=recipes&sub=meals')
  const section = page.locator('#operator-panel')
  await expect(section).toBeVisible()

  // The window select lives in its own section under the slot list.
  const select = section.getByLabel('La grille montre')
  await expect(select).toBeVisible()
  // The fixture household has never set one, so it reads the default.
  await expect(select).toHaveValue('10')

  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
    select.selectOption('14'),
  ])
  const body = JSON.parse(req.postData() || '{}') as { mealWindowDays?: number }
  expect(body.mealWindowDays).toBe(14)
  await expect(select).toHaveValue('14')
})

test('the window picker only offers what the rest of the app supports', async ({ page }) => {
  // The bounds are load-bearing, not taste: below 7 the toddler kitchen's
  // week.slice(0, 7) would drop days; above 14 the AI snapshot (ask.ts, today+14d)
  // would stop seeing the plan. If someone widens the picker, they have to fix
  // those surfaces first — so the offered set is pinned here.
  await page.goto('/settings?tab=recipes&sub=meals')
  const select = page.locator('#operator-panel').getByLabel('La grille montre')
  await expect(select).toBeVisible()
  const values = await select.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))
  expect(values).toEqual(['7', '10', '14'])
})

// ─────────────────────────────────────────────────────────────────────────────
// Réglages ▸ La liste — « Mes magasins » and « Ordre des allées ». Both persist on
// /api/household like the kitchen panels above, and neither had a behavioural test.
// This class of panel fails SILENTLY when mis-wired: every control here flips
// optimistically, so the row looks saved whether or not the write ever left. That
// is the same shape as the two defects this repo has already shipped and caught by
// hand (NoteEditor's swallowed auto-save, the trip cover that could never be set).

test('excluding a store patches household with the remaining allowlist', async ({ page }) => {
  await page.goto('/settings?tab=liste&sub=shop&focus=storeFilter')
  const section = page.locator('#operator-panel')
  // The flyer fixture holds Super C + IGA (two IGA flyers fold to one store row),
  // sorted by merchant — so row 0 is IGA. The household has includedStores: [],
  // which the panel reads as « unconfigured = every store kept », so each row
  // starts « Inclus » and toggling one OFF is the write.
  const row = section.locator('.store-filter__row').first()
  await expect(row).toBeVisible()
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
    row.getByRole('button', { name: 'Inclus', exact: true }).click(),
  ])
  const body = JSON.parse(req.postData() || '{}') as { includedStores?: string[] }
  // The allowlist is sent WHOLE (not a delta), keyed by lowercased merchant.
  expect(body.includedStores).toEqual(['super c'])
  await expect(row.getByRole('button', { name: 'Exclu', exact: true })).toBeVisible()
})

test('the à-la-caisse flag is independent of the include allowlist', async ({ page }) => {
  // The two flags are deliberately separate fields (migration 0066): « Inclus »
  // governs whether a store reaches deal/flyer lookups at all, « À la caisse »
  // only hides its deals from the till surface — the store you shop at yourself.
  // Wiring the till toggle into includedStores would silently drop that store's
  // deals everywhere, which is exactly the mistake a screenshot cannot see.
  await page.goto('/settings?tab=liste&sub=shop&focus=storeFilter')
  const row = page.locator('#operator-panel').locator('.store-filter__row').first()
  await expect(row).toBeVisible()
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
    row.getByRole('button', { name: 'À la caisse: Oui' }).click(),
  ])
  const body = JSON.parse(req.postData() || '{}') as {
    cashierExcludedStores?: string[]
    includedStores?: string[]
  }
  expect(body.cashierExcludedStores).toEqual(['iga'])
  // The include allowlist must NOT ride along on this PATCH.
  expect(body.includedStores).toBeUndefined()
})

test('« Remettre l’ordre de départ » patches household with the full aisle order', async ({ page }) => {
  // The aisle order is otherwise reorderable only by dragging, so the reset button
  // is the one mouse/keyboard-reachable write in this panel — and the only handle
  // a test can pull without simulating a pointer drag.
  await page.goto('/settings?tab=liste&sub=shop&focus=aisleOrder')
  const section = page.locator('#operator-panel')
  // The reset now confirms first (2026-09-03 predictability audit — a one-tap
  // factory reset sharing undo's icon, with no confirm, was finding #1).
  await section.getByRole('button', { name: 'Remettre l’ordre de départ' }).click()
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
    page.locator('.confirm').getByRole('button', { name: 'Remettre l’ordre de départ', exact: true }).click(),
  ])
  const body = JSON.parse(req.postData() || '{}') as { aisleOrder?: string[] }
  expect(Array.isArray(body.aisleOrder)).toBe(true)
  // Reorder-only: the whole orderable set is sent, and 'autres' is never in it
  // (it is pinned last by aisleRanks, and the panel renders it inert).
  expect(body.aisleOrder!.length).toBeGreaterThan(1)
  expect(body.aisleOrder).not.toContain('autres')
  expect(new Set(body.aisleOrder!).size).toBe(body.aisleOrder!.length)
})

// ─────────────────────────────────────────────────────────────────────────────
// Réglages ▸ Maison — « Listes à compléter » (the todo templates) and the routine
// moment-of-day chip. The templates panel is the heaviest uncovered writer in
// Réglages: create / rename / delete / reorder / duplicate all POST or PATCH
// /api/todo-templates, and every one of them is fire-and-forget (`void write(...)`
// with a swallowed .catch), so nothing on screen changes if the write is lost.

test('adding a todo template posts it', async ({ page }) => {
  await page.goto('/settings?tab=maison&sub=routines&focus=routines&focus=todoTemplates')
  const section = page.locator('#operator-panel')
  const add = section.getByLabel('Nom de la liste').last()
  await expect(add).toBeVisible()
  await add.fill('Sac de piscine')
  const [req] = await Promise.all([
    page.waitForRequest(isApi('POST', 'todo-templates'), { timeout: 20_000 }),
    add.press('Enter'),
  ])
  const body = JSON.parse(req.postData() || '{}') as { title?: string; items?: unknown[] }
  expect(body.title).toBe('Sac de piscine')
  // A new template starts empty — items is sent, not left undefined, so the server
  // never has to guess (the JSON column is NOT NULL, defaulted '[]').
  expect(body.items).toEqual([])
})

test('renaming a todo template patches it by id', async ({ page }) => {
  await page.goto('/settings?tab=maison&sub=routines&focus=routines&focus=todoTemplates')
  const section = page.locator('#operator-panel')
  // Row 0 is « Avant de partir » (tpl1) in the fixture; its title is an inline
  // editable field. The id must ride along or the rename lands on the wrong list.
  const name = section.getByLabel('Nom de la liste').first()
  await expect(name).toHaveValue('Avant de partir')
  await name.fill('Avant de sortir')
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'todo-templates'), { timeout: 20_000 }),
    name.blur(),
  ])
  const body = JSON.parse(req.postData() || '{}') as { id?: string; title?: string }
  expect(body.id).toBe('tpl1')
  expect(body.title).toBe('Avant de sortir')
})

test('the routine moment chip patches that routine’s timeOfDay', async ({ page }) => {
  await page.goto('/settings?tab=maison&sub=routines&focus=routines')
  const section = page.locator('#operator-panel')
  // « Matin » (r1) starts timeOfDay 'morning'; the chip cycles
  // anytime → matin → après-midi → soir → anytime, one write per tap. The routineId
  // must ride along — the cue is per-routine, and the panel lists several.
  const chip = section.getByRole('button', { name: /^Moment :/ }).first()
  await expect(chip).toBeVisible()
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'routines'), { timeout: 20_000 }),
    chip.click(),
  ])
  const body = JSON.parse(req.postData() || '{}') as { routineId?: string; timeOfDay?: string | null }
  expect(body.routineId).toBe('r1')
  // 'morning' is index 0 of ROUTINE_TODS, so one tap advances to the next cue —
  // whatever it is named, it must not stay 'morning' and must not be omitted.
  expect(body).toHaveProperty('timeOfDay')
  expect(body.timeOfDay).not.toBe('morning')
})

// ─────────────────────────────────────────────────────────────────────────────
// Réglages ▸ Maison ▸ « La maisonnée » and Réglages ▸ Système ▸ « Tablettes ».
// Member admin is the most consequential panel in Réglages (it is operator-only
// and kiosk-gated for that reason) and had no write test at all; the household
// name and the tablet label are both blur-committed fields, the shape most prone
// to saving nothing while looking saved.

test('adding a member posts name, child flag and colour', async ({ page }) => {
  await page.goto('/settings?tab=maison&sub=members')
  const section = page.locator('#operator-panel')
  const add = section.getByLabel('Nom', { exact: true }).last()
  await expect(add).toBeVisible()
  await add.fill('Mathis')
  const [req] = await Promise.all([
    page.waitForRequest(isApi('POST', 'members'), { timeout: 20_000 }),
    add.press('Enter'),
  ])
  const body = JSON.parse(req.postData() || '{}') as { name?: string; isChild?: boolean; color?: string }
  expect(body.name).toBe('Mathis')
  // A member is created with a colour already chosen — the avatar disc and every
  // face tint downstream read it, so leaving it to the server would flash a
  // default. isChild is sent explicitly rather than inferred.
  expect(typeof body.isChild).toBe('boolean')
  expect(body.color).toBeTruthy()
})

test('renaming the maisonnée patches household on blur', async ({ page }) => {
  await page.goto('/settings?tab=maison&sub=members')
  const field = page.locator('#operator-panel').getByLabel('Nom de la maisonnée')
  await expect(field).toHaveValue('Maison Tremblay')
  await field.fill('Famille Tremblay-Roy')
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
    field.blur(),
  ])
  const body = JSON.parse(req.postData() || '{}') as { name?: string }
  expect(body.name).toBe('Famille Tremblay-Roy')
})

test('renaming a paired tablet patches it by id', async ({ page }) => {
  await page.goto('/settings?tab=settings&sub=tablets')
  const section = page.locator('#operator-panel')
  // The pairing form above uses the same field label, so scope to the paired list.
  const list = section.locator('.operator__section', { hasText: 'Tablettes jumelées' })
  await list.getByRole('button', { name: 'Renommer la tablette' }).first().click()
  const field = list.getByLabel('Nom de la tablette')
  await expect(field).toBeVisible()
  await field.fill('Tablette du salon')
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'pair/devices'), { timeout: 20_000 }),
    field.press('Enter'),
  ])
  const body = JSON.parse(req.postData() || '{}') as { id?: string; label?: string }
  // The id must ride along: a household can have several tablets, and the panel
  // renders them as identical rows.
  expect(body.id).toBe('d1')
  expect(body.label).toBe('Tablette du salon')
})

// ─────────────────────────────────────────────────────────────────────────────
// THE SECOND SWEEP (2026-09-08). Re-measured after the 28 → 14 merge: of the 17
// panels that write, these nine still asserted nothing — a settings card commits
// optimistically, so each read « saved » whether or not its write ever left.
// Every test below navigates by SECTION (?tab=&focus=, the address that survives a
// pill reshuffle) and scopes to the card's #op-<key> anchor, never to a pill label.
// Each was run against a planted bug (the id dropped from the body, the endpoint
// misspelled) and seen to fail before it was trusted.
//
// Deferred deletes (a device revoke, a photo) HOLD their write behind the undo
// toast; the test asserts the hold (nothing sent), then fires `pagehide` — the
// teardown flush every held write commits on (lib/toast) — and asserts the write.
// ─────────────────────────────────────────────────────────────────────────────

const flushHeldWrites = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('pagehide')))

test('renaming a member patches it by id, keeping colour and child flag', async ({ page }) => {
  await page.goto('/settings?tab=maison&focus=members')
  const card = page.locator('#op-members')
  await card.getByRole('button', { name: 'Modifier la personne' }).first().click()
  const field = card.locator('.member-card--editing').getByLabel('Nom', { exact: true })
  await expect(field).toHaveValue('Maman')
  await field.fill('Maman R.')
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'members'), { timeout: 20_000 }),
    field.press('Enter'),
  ])
  const body = JSON.parse(req.postData() || '{}') as { id?: string; name?: string; colour?: string; isChild?: boolean }
  expect(body.id).toBe('m1')
  expect(body.name).toBe('Maman R.')
  // A rename must not silently reset the face: colour + child flag ride along.
  expect(body.colour).toBeTruthy()
  expect(typeof body.isChild).toBe('boolean')
})

test('revoking a paired tablet is held behind the undo, then posts revokeId on teardown', async ({ page }) => {
  let posts = 0
  await page.goto('/settings?tab=settings&focus=devices')
  await page.route('**/api/pair/devices**', async (route) => {
    if (route.request().method() === 'GET') return route.fallback()
    posts += 1
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  const card = page.locator('#op-devices')
  await card.getByRole('button', { name: 'Révoquer' }).first().click()
  await expect(page.locator('.undo-toast')).toBeVisible()
  // Held: a mis-tap must cost nothing, so nothing has left yet.
  expect(posts).toBe(0)
  const [req] = await Promise.all([page.waitForRequest(isApi('POST', 'pair/devices'), { timeout: 20_000 }), flushHeldWrites(page)])
  expect(JSON.parse(req.postData() || '{}')).toMatchObject({ revokeId: 'd1' })
})

test('a season seed posts a dated upkeep with its cadence and lead time', async ({ page }) => {
  await page.goto('/settings?tab=maison&focus=chores')
  // ChoresTabPanel's own inner row (corvées · projets · entretien) sits ABOVE the
  // #op-chores card and swaps it for Entretien's — so go through the panel, and
  // scope the seed to the Entretien card by its title.
  const panel = page.locator('#operator-panel')
  await expect(page.locator('#op-chores')).toBeVisible()
  await panel.getByRole('tab', { name: 'Entretien' }).click()
  const card = panel.locator('.operator__section', { hasText: 'Idées de saison' })
  const [req] = await Promise.all([
    page.waitForRequest(isApi('POST', 'home-projects'), { timeout: 20_000 }),
    card.getByRole('button', { name: /Poser les pneus/ }).click(),
  ])
  const body = JSON.parse(req.postData() || '{}') as { kind?: string; title?: string; at?: number; recur?: unknown; leadSeconds?: number }
  expect(body.kind).toBe('upkeep')
  expect(body.title).toBe('Poser les pneus d’hiver / d’été')
  expect(typeof body.at).toBe('number')
  expect(body.recur).toEqual({ freq: 'monthly', interval: 6 })
  // A-6: an annual ritual gets a week-scale « Bientôt » — three weeks for the tires.
  expect(body.leadSeconds).toBe(3 * 7 * 86_400)
})

test('a new work-hours block posts the member, the minutes and holdsCar', async ({ page }) => {
  await page.goto('/settings?tab=maison&focus=schedule')
  await page.locator('#op-schedule').getByRole('button', { name: 'Ajouter un horaire' }).click()
  const form = page.locator('.operator__inline-form').last()
  await form.getByRole('button', { name: 'Papa', exact: true }).click()
  const times = form.locator('input[type="time"]')
  await times.nth(0).fill('08:00')
  await times.nth(1).fill('16:30')
  const [req] = await Promise.all([
    page.waitForRequest(isApi('POST', 'schedule'), { timeout: 20_000 }),
    form.getByRole('button', { name: 'Ajouter', exact: true }).click(),
  ])
  const body = JSON.parse(req.postData() || '{}') as { memberId?: string; startMin?: number; endMin?: number; weekdays?: number[]; holdsCar?: boolean }
  expect(body.memberId).toBe('m2')
  // Minutes since midnight, not "HH:MM" — the car planner does arithmetic on these.
  expect(body.startMin).toBe(8 * 60)
  expect(body.endMin).toBe(16 * 60 + 30)
  expect(Array.isArray(body.weekdays)).toBe(true)
  expect(typeof body.holdsCar).toBe('boolean')
})

test('deleting a cercle group confirms first, then deletes it by id', async ({ page }) => {
  await page.route('**/api/cercle**', (route) =>
    route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/cercle'
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            contacts: [],
            links: [],
            members: [],
            groups: [{ id: 'g1', name: 'Les cousins', kind: 'family', colour: null, memberKeys: [] }],
          }),
        })
      : route.fallback(),
  )
  await page.goto('/settings?tab=maison&focus=cercleGroups')
  const card = page.locator('#op-cercleGroups')
  await card.getByRole('button', { name: 'Supprimer le groupe — Les cousins' }).click()
  // A heavy delete: the confirm dialog, not the undo toast.
  const dialog = page.locator('.confirm')
  await expect(dialog).toBeVisible()
  const [req] = await Promise.all([
    page.waitForRequest(isApi('DELETE', 'cercle-groups'), { timeout: 20_000 }),
    dialog.getByRole('button', { name: /^(Supprimer|Confirmer)$/ }).click(),
  ])
  expect(JSON.parse(req.postData() || '{}')).toMatchObject({ id: 'g1' })
})

test('revoking a live guest link posts revokeId (the token dies at once)', async ({ page }) => {
  await page.route('**/api/guest-links**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            links: [{ id: 'l1', kind: 'sitter', target_key: null, standing: 0, label: 'Mamie', created_at: BASE, expires_at: BASE + 86_400 }],
          }),
        })
      : route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
  )
  await page.goto('/settings?tab=settings&focus=guestLinks')
  const list = page.locator('.operator__guest-links')
  await expect(list).toBeVisible()
  const [req] = await Promise.all([
    page.waitForRequest(isApi('POST', 'guest-links'), { timeout: 20_000 }),
    list.getByRole('button', { name: 'Révoquer' }).first().click(),
  ])
  expect(JSON.parse(req.postData() || '{}')).toMatchObject({ revokeId: 'l1' })
})

test('the sitter info block patches household with the typed fields', async ({ page }) => {
  // The block seeds itself from a mount fetch, so wait for that to land before
  // typing: the field must hold what we typed at the moment we save, not whatever
  // the seed put there. (The product no longer clobbers a keystroke either — see
  // `typed` in ShareInfoEditor — but a spec that types into a half-loaded form is
  // testing the race, not the write.)
  const seeded = page.waitForResponse((r) => r.url().includes('/api/household') && r.request().method() === 'GET')
  await page.goto('/settings?tab=settings&focus=guestLinks')
  await seeded
  const card = page.locator('.operator__section', { hasText: 'Infos à partager' })
  const wifi = card.getByLabel('Réseau Wi-Fi')
  await wifi.fill('Maison-5G')
  await expect(wifi).toHaveValue('Maison-5G')
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
    card.getByRole('button', { name: 'Enregistrer' }).click(),
  ])
  expect(JSON.parse(req.postData() || '{}')).toMatchObject({ wifiSsid: 'Maison-5G' })
})

test('a keystroke typed while the sitter block is still loading survives the seed', async ({ page }) => {
  // The block starts EMPTY and fills itself from a mount fetch. Hold that fetch open,
  // type into the field the way a fast operator on a slow phone would, THEN let the
  // household answer: the seed must not overwrite what was typed — or the save would
  // PATCH the value the operator thought they had replaced. Found on CI 2026-09-08,
  // where the runner is slow enough to lose the race every time (green locally).
  let release = () => {}
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/api/household**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await held
    return route.fallback()
  })
  await page.goto('/settings?tab=settings&focus=guestLinks')
  const wifi = page.locator('.operator__section', { hasText: 'Infos à partager' }).getByLabel('Réseau Wi-Fi')
  await wifi.fill('Maison-5G')
  release()
  await page.waitForResponse((r) => r.url().includes('/api/household') && r.request().method() === 'GET')
  await expect(wifi, 'the seed clobbered a keystroke').toHaveValue('Maison-5G')
})

test('« Tester l’IA » probes the binding with a POST (never a queued write)', async ({ page }) => {
  await page.route('**/api/ai-test**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ checks: [] }) }),
  )
  await page.goto('/settings?tab=settings&focus=aiLog')
  await Promise.all([
    page.waitForRequest(isApi('POST', 'ai-test'), { timeout: 20_000 }),
    page.getByRole('button', { name: 'Tester l’IA' }).click(),
  ])
})

test('« Effacer le journal » DELETEs the AI error log', async ({ page }) => {
  await page.route('**/api/ai-errors**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ id: 'e1', feature: 'capture', message: 'boom', created_at: BASE }] }),
        })
      : route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
  )
  await page.goto('/settings?tab=settings&focus=aiLog')
  const card = page.locator('#op-aiLog')
  await expect(card.locator('.ai-log__row')).toHaveCount(1)
  await Promise.all([
    page.waitForRequest(isApi('DELETE', 'ai-errors'), { timeout: 20_000 }),
    card.getByRole('button', { name: 'Effacer le journal' }).click(),
  ])
})

test('removing a household photo is held behind the undo, then DELETEs by id on teardown', async ({ page }) => {
  const deletes: string[] = []
  await page.route('**/api/photos**', (route) => {
    const m = route.request().method()
    if (m === 'GET')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ photos: [{ id: 'p1', key: 'k1', created_at: BASE }] }),
      })
    deletes.push(route.request().postData() || '')
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  await page.goto('/settings?tab=settings&focus=photos')
  const card = page.locator('#op-photos')
  await expect(card.locator('.photo-grid__item')).toHaveCount(1)
  await card.getByRole('button', { name: 'Supprimer' }).first().click()
  await expect(page.locator('.undo-toast')).toBeVisible()
  expect(deletes).toEqual([])
  await Promise.all([page.waitForRequest(isApi('DELETE', 'photos'), { timeout: 20_000 }), flushHeldWrites(page)])
  expect(JSON.parse(deletes[0] || '{}')).toMatchObject({ id: 'p1' })
})

