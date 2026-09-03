import { test, expect, type Request } from '@playwright/test'
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
  await page.goto('/settings?tab=liste&sub=stores')
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
  await page.goto('/settings?tab=liste&sub=stores')
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

test('« Remettre l’ordre par défaut » patches household with the full aisle order', async ({ page }) => {
  // The aisle order is otherwise reorderable only by dragging, so the reset button
  // is the one mouse/keyboard-reachable write in this panel — and the only handle
  // a test can pull without simulating a pointer drag.
  await page.goto('/settings?tab=liste&sub=aisles')
  const section = page.locator('#operator-panel')
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
    section.getByRole('button', { name: 'Remettre l’ordre par défaut' }).click(),
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
  await page.goto('/settings?tab=maison&sub=todos')
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
  await page.goto('/settings?tab=maison&sub=todos')
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
  await page.goto('/settings?tab=maison&sub=routines')
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
