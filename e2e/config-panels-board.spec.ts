import { test, expect } from '@playwright/test'
import { mockApi, seedState, BASE, MMID } from './mocks'
import { isApi, panelsReady } from './interact'

// Réglages config panels, Le babillard (« La rentrée »). Each test asserts the write fires AND carries the right
// field: why a settings panel needs that is written out above `panelsReady` in interact.ts.

test.beforeEach(async ({ page }) => panelsReady(page))

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
