import { test, expect, type Request } from '@playwright/test'
import { mockApi, seedState, BASE, MMID } from './mocks'

// Behavioural coverage for two Réglages ▸ Cuisine config panels that were
// screenshot-only, so a broken PATCH would have shipped green (§211). Both persist
// on /api/household; the tests assert the write fires AND carries the right field, so
// a mis-wired save (or a regressed useWrite migration) is caught. The meal-slot panel
// in particular was just moved from raw api() to useWrite — this locks that in.

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
