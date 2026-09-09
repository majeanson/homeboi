import { test, expect, type Route } from '@playwright/test'
import { mockApi, seedState, BASE } from './mocks'
import { boxOf } from './measure'

// The event detail peek now offers basic actions — Modify / Delete / Share — alongside
// « Voir la journée ». Opened from a board activity row (.act__hit → .detail-sheet). We
// assert the buttons render and that Delete confirms then fires DELETE /api/events, and
// that Modify opens the pre-filled event form. (Matches BOARD's 'Rendez-vous dentiste' = e2.)
//
// Since the ⋯ fold, the peek splits its actions: « Voir la journée » + Modifier stay
// visible in `.detail-sheet__actions`; Itinéraire / Partager / Supprimer live behind the
// head's `.action-menu__btn` as `menuitem`s (same pattern as the recipe view).

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })

const EVENT = {
  id: 'e2',
  title: 'Rendez-vous dentiste',
  start_at: BASE + 6 * 3600,
  all_day: 0,
  member_id: 'm4',
  contact_id: null,
  business_id: null,
  recur_json: null,
  lead_seconds: null,
  car_id: null,
  passengers: null,
  bring_template_id: null,
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.routeWebSocket(/\/api\/live/, () => {})
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  // Freeze at BASE so today's timed events read as upcoming-and-live (the board otherwise
  // folds past-timed items into a « Déjà passé » disclosure vs the real clock).
  await page.clock.setFixedTime(new Date(BASE * 1000))
  // Events endpoint: GET feeds the Modify form (EventEditModal reads the base row); writes → {ok}.
  await page.route('**/api/events', (route: Route) =>
    route.fulfill(route.request().method() === 'GET' ? json({ events: [EVENT] }) : json({ ok: true })),
  )
})

async function openEventPeek(page: import('@playwright/test').Page) {
  await page.goto('/board')
  // An event row (no checkbox) renders as a single .act button; tapping it opens the peek.
  await page.locator('.act', { hasText: 'Rendez-vous dentiste' }).first().click()
  await page.locator('.detail-sheet').waitFor({ state: 'visible', timeout: 10_000 })
}

// Open the peek's ⋯ overflow (head corner) so its menuitems are clickable.
const openPeekMenu = (page: import('@playwright/test').Page) =>
  page.locator('.detail-sheet .action-menu__btn').click()

test('the event peek offers Modify / Delete / Share; Delete confirms → DELETE /api/events', async ({ page }) => {
  await openEventPeek(page)
  const actions = page.locator('.detail-sheet__actions')
  await expect(actions.getByText('Voir la journée', { exact: true })).toBeVisible()
  await expect(actions.getByText('Modifier', { exact: true })).toBeVisible()
  // Partager + Supprimer moved behind the ⋯ — the visible row no longer carries them.
  await expect(actions.getByText('Partager', { exact: true })).toHaveCount(0)
  await openPeekMenu(page)
  await expect(page.getByRole('menuitem', { name: 'Partager' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Supprimer' })).toBeVisible()

  // Delete → the sheet closes, the danger confirm opens → confirm fires DELETE {id}.
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'DELETE' && new URL(r.url()).pathname === '/api/events', { timeout: 20_000 }),
    (async () => {
      await page.getByRole('menuitem', { name: 'Supprimer' }).click()
      await page.locator('.confirm__actions').getByRole('button', { name: 'Supprimer' }).click()
    })(),
  ])
  expect(req.postDataJSON()).toMatchObject({ id: 'e2' })
})

test('Modify opens the event form pre-filled', async ({ page }) => {
  await openEventPeek(page)
  await page.locator('.detail-sheet__actions').getByText('Modifier', { exact: true }).click()
  const modal = page.locator('.kit-modal')
  await expect(modal).toBeVisible()
  // The EventForm's first input is the title, pre-filled from the event being edited.
  await expect(modal.locator('input').first()).toHaveValue('Rendez-vous dentiste', { timeout: 10_000 })
})

// « Itinéraire » — a rendez-vous whose « Avec » (business/contact) has an address
// offers one-tap turn-by-turn: the peek opens Google Maps DIRECTIONS to it. The
// fixture's dentist (e2) rides a business with an address; an address-less event
// (e1 Garderie) must NOT grow the button.
test('« Itinéraire » opens Google Maps directions when the rendez-vous has an address', async ({ page }) => {
  // The popup would load the real google.com in CI — stub the route at the context
  // level (popups inherit context routes, not page routes).
  await page.context().route('**/maps/dir/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: '<title>maps</title>' }),
  )
  await openEventPeek(page)
  await openPeekMenu(page)
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('menuitem', { name: 'Itinéraire' }).click(),
  ])
  expect(popup.url()).toContain('google.com/maps/dir')
  expect(popup.url()).toContain(encodeURIComponent('18 boul. Jacques-Cartier, Sherbrooke'))
  await popup.close()

  // No address → no menu row: the Garderie peek stays Itinéraire-free.
  await page.keyboard.press('Escape')
  await page.locator('.detail-sheet').waitFor({ state: 'hidden' })
  await page.locator('.act', { hasText: 'Garderie' }).first().click()
  await page.locator('.detail-sheet').waitFor({ state: 'visible' })
  await openPeekMenu(page)
  await expect(page.getByRole('menuitem', { name: 'Itinéraire' })).toHaveCount(0)
})

test('at phone width the peek’s buttons fill the sheet — the ⋯/✕ float steals no width', async ({ page }) => {
  // Reported from the phone 2026-09-09: the peek's action buttons stopped ~100px short
  // of the right edge and read as off-centre. The cause was pure CSS mechanics, and
  // worth naming because it will happen again: the head cluster (⋯ + ✕) is
  // `float: right` so the TITLE can flow beside it, and `.detail-sheet__body` was a
  // flex column. A flex container establishes a block formatting context, and a BFC may
  // not overlap a float — so the body shrank by the cluster's width for its WHOLE
  // height, not just the title's line. A quarter of a 390px sheet.
  //
  // The body is a block now; the HEAD still shrinks (the title must not run under the
  // buttons), which is why this asserts on both halves rather than on one width.
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await openEventPeek(page)

  const sheet = await boxOf(page.locator('.detail-sheet'))
  const actions = await boxOf(page.locator('.detail-sheet__actions'))
  const head = await boxOf(page.locator('.detail-sheet__head'))
  const menu = await boxOf(page.locator('.detail-sheet .sheet__head-actions'))

  // Symmetric gutters: whatever padding the sheet has on the left, the buttons end the
  // same distance from the right. The bug read as 16px left / 118px right.
  const left = actions.x - sheet.x
  const right = sheet.x + sheet.width - (actions.x + actions.width)
  expect(Math.abs(right - left), `action row gutters: ${left} left vs ${right} right`).toBeLessThan(8)

  // …and the head still yields to the ⋯/✕ cluster, so the title never runs under it.
  expect(head.x + head.width, 'the head stops before the ⋯/✕').toBeLessThanOrEqual(menu.x + 1)
})
