import { test, expect, type Page, type Route } from '@playwright/test'
import { mockApi, seedState, MMID } from './mocks'

// « Make sure we can remove/delete easily from detail popups and such for rendez-vous
// and others on calendar » (Marc, 2026-09-16). Before this, the month panel's corvée and
// entretien peeks had no « Modifier » and no « Supprimer », a planned meal tapped there
// could not be taken off the plan, and the day page — which edits a rendez-vous inline
// instead of opening the peek — had no way to delete one at all. One shared hook
// (components/detail/EntityRemovals) now hands the same doors to the board, the month
// panel and the day page.
//
// Frontend-only harness (Vite + stubbed /api/**). The calendar is pinned to MMID (the
// mocks' frozen local midnight) through `?date=`, and every dated thing sits on that day
// whatever window /api/month is asked for, so the panel always shows the four rows.

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })

const EVENT = { id: 'ev1', title: 'Dentiste', start_at: MMID + 14 * 3600, all_day: 0, member_id: null, contact_id: null, business_id: null, recur_json: null, lead_seconds: null, car_id: null, passengers: null, bring_template_id: null }
const CHORE = { id: 'ch1', title: 'Sortir le recyclage', rotation_json: '[]', current_idx: 0, last_done_at: null, last_done_by: null, color: '#5891AC', recur_json: null, recur_start: MMID, lead_seconds: null, announce_evening: 0 }

async function seed(page: Page, opts: { guest?: boolean } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.routeWebSocket(/\/api\/live/, () => {})
  if (opts.guest) {
    // The link guest's whole identity (the guest-settings spec's boot): no operator
    // session, a `showcase` whoami, and the device-side guest token.
    await mockApi(page, { signedIn: false })
    await page.route('**/api/guest/whoami**', (route: Route) => route.fulfill(json({ kind: 'showcase' })))
    await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
  } else {
    await mockApi(page)
  }
  // Registered AFTER mockApi so they win (Playwright tries routes newest-first).
  await page.route('**/api/month**', (route: Route) =>
    route.fulfill(
      json({
        events: [{ id: 'ev1', title: 'Dentiste', at: MMID + 14 * 3600, all_day: 0, member_id: null, day: MMID }],
        meals: [{ id: 'ml1', slot: 'souper', title: 'Pâté chinois', cook_member_id: null, day: MMID }],
        chores: [{ id: 'ch1', title: 'Sortir le recyclage', color: '#5891AC', who: null, day: MMID }],
        dayNotes: [],
        todos: [],
        homeProjects: [{ id: 'hp1', kind: 'upkeep', title: 'Changer le filtre', color: '#88A36F', day: MMID }],
        trips: [],
        tripPlans: [],
        habits: [],
      }),
    ),
  )
  await page.route('**/api/events**', (route: Route) => route.fulfill(route.request().method() === 'GET' ? json({ events: [EVENT] }) : json({ ok: true })))
  await page.route('**/api/chores**', (route: Route) => route.fulfill(route.request().method() === 'GET' ? json({ chores: [CHORE] }) : json({ ok: true })))
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, boardView: 'month', surface: 'mobile' })
}

async function openMonthPanel(page: Page) {
  await page.goto(`/board?date=${MMID}`)
  await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })
  return page.locator('.monthv__day')
}

const waitDelete = (page: Page, path: string, timeout = 30_000) =>
  page.waitForRequest((r) => r.method() === 'DELETE' && new URL(r.url()).pathname === `/api/${path}`, { timeout })

test.describe('Mois — the day panel’s peeks can delete', () => {
  test('a rendez-vous: « Supprimer » is a visible button in the peek → confirm → DELETE /api/events', async ({ page }) => {
    await seed(page)
    const panel = await openMonthPanel(page)
    await panel.locator('.act', { hasText: 'Dentiste' }).first().click()
    const sheet = page.locator('.detail-sheet')
    await sheet.waitFor({ state: 'visible' })
    const del = sheet.locator('.detail-sheet__actions').getByRole('button', { name: 'Supprimer', exact: true })
    await expect(del).toBeVisible()
    const [req] = await Promise.all([
      waitDelete(page, 'events'),
      (async () => {
        await del.click()
        await page.locator('.confirm__actions').getByRole('button', { name: 'Supprimer' }).click()
      })(),
    ])
    expect(req.postDataJSON()).toMatchObject({ id: 'ev1' })
  })

  test('a corvée: the peek offers « Modifier » (→ Réglages) and « Supprimer » (deferred behind the undo toast)', async ({ page }) => {
    await seed(page)
    const panel = await openMonthPanel(page)
    const row = panel.locator('.act', { hasText: 'Sortir le recyclage' })
    await row.first().click()
    const sheet = page.locator('.detail-sheet')
    await sheet.waitFor({ state: 'visible' })
    await sheet.locator('.action-menu__btn').click()
    await expect(page.getByRole('menuitem', { name: 'Modifier' })).toBeVisible()
    await page.getByRole('menuitem', { name: 'Supprimer' }).click()
    // Deferred: the row leaves the panel now, the toast offers « Annuler », and the
    // DELETE only fires once the undo window closes.
    await expect(row).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible()
    await page.clock.install()
    const [req] = await Promise.all([waitDelete(page, 'chores'), page.clock.runFor(16_000)])
    expect(req.postDataJSON()).toMatchObject({ id: 'ch1' })
  })

  test('an entretien: same two doors, same tier', async ({ page }) => {
    await seed(page)
    const panel = await openMonthPanel(page)
    const row = panel.locator('.act', { hasText: 'Changer le filtre' })
    await row.first().click()
    const sheet = page.locator('.detail-sheet')
    await sheet.waitFor({ state: 'visible' })
    await sheet.locator('.action-menu__btn').click()
    await expect(page.getByRole('menuitem', { name: 'Modifier' })).toBeVisible()
    await page.getByRole('menuitem', { name: 'Supprimer' }).click()
    await expect(row).toHaveCount(0)
    await page.clock.install()
    const [req] = await Promise.all([waitDelete(page, 'home-projects'), page.clock.runFor(16_000)])
    expect(req.postDataJSON()).toMatchObject({ id: 'hp1' })
  })

  test('a planned meal: « Retirer du plan » in the peek → DELETE /api/meals, with an undo', async ({ page }) => {
    await seed(page)
    const panel = await openMonthPanel(page)
    await panel.locator('.act', { hasText: 'Pâté chinois' }).first().click()
    const sheet = page.locator('.detail-sheet')
    await sheet.waitFor({ state: 'visible' })
    // A free-text meal (no recipe doors) keeps its plan actions VISIBLE — « Retirer du
    // plan » is a danger button in the row, not a ⋯ item (buildMeal folds only when the
    // recipe doors are present).
    const [req] = await Promise.all([waitDelete(page, 'meals'), sheet.locator('.detail-sheet__actions').getByRole('button', { name: 'Retirer du plan' }).click()])
    expect(req.postDataJSON()).toMatchObject({ id: 'ml1' })
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible()
  })

  test('a read-only guest sees none of the delete doors', async ({ page }) => {
    await seed(page, { guest: true })
    const panel = await openMonthPanel(page)
    await panel.locator('.act', { hasText: 'Sortir le recyclage' }).first().click()
    const sheet = page.locator('.detail-sheet')
    await sheet.waitFor({ state: 'visible' })
    await expect(sheet.locator('.action-menu__btn')).toHaveCount(0)
    await expect(sheet.getByRole('button', { name: 'Supprimer', exact: true })).toHaveCount(0)
  })
})

test.describe('the day page can delete what it edits', () => {
  test('a rendez-vous edited inline shows « Supprimer le rendez-vous » under the form → confirm → DELETE', async ({ page }) => {
    await seed(page)
    await page.goto(`/kitchen/day/${MMID}`)
    await page.locator('.scene').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('.act', { hasText: 'Dentiste' }).first().click()
    const del = page.getByRole('button', { name: 'Supprimer le rendez-vous' })
    await expect(del).toBeVisible()
    const [req] = await Promise.all([
      waitDelete(page, 'events'),
      (async () => {
        await del.click()
        await page.locator('.confirm__actions').getByRole('button', { name: 'Supprimer' }).click()
      })(),
    ])
    expect(req.postDataJSON()).toMatchObject({ id: 'ev1' })
  })

  test('a corvée edited inline shows « Supprimer la corvée » → the row hides, the write waits behind the toast', async ({ page }) => {
    await seed(page)
    await page.goto(`/kitchen/day/${MMID}`)
    await page.locator('.scene').waitFor({ state: 'visible', timeout: 15_000 })
    const row = page.locator('.act', { hasText: 'Sortir le recyclage' })
    await row.first().click()
    const del = page.getByRole('button', { name: 'Supprimer la corvée' })
    await expect(del).toBeVisible()
    await del.click()
    await expect(row).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible()
    await page.clock.install()
    const [req] = await Promise.all([waitDelete(page, 'chores'), page.clock.runFor(16_000)])
    expect(req.postDataJSON()).toMatchObject({ id: 'ch1' })
  })

  test('an entretien row opens the peek with « Modifier » + « Supprimer »', async ({ page }) => {
    await seed(page)
    await page.goto(`/kitchen/day/${MMID}`)
    await page.locator('.scene').waitFor({ state: 'visible', timeout: 15_000 })
    const row = page.locator('.act', { hasText: 'Changer le filtre' })
    await row.first().click()
    const sheet = page.locator('.detail-sheet')
    await sheet.waitFor({ state: 'visible' })
    await sheet.locator('.action-menu__btn').click()
    await expect(page.getByRole('menuitem', { name: 'Modifier' })).toBeVisible()
    await page.getByRole('menuitem', { name: 'Supprimer' }).click()
    await expect(row).toHaveCount(0)
  })
})
