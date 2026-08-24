import { test, expect, type Page, type Request } from '@playwright/test'
import { mockApi, seedState, BASE } from './mocks'

// Behavioural coverage for the carnet SCENE (/cercle/carnet/:id) — §8/theme-4. The
// scene is a 2-segment toggle (« À surveiller » = what's due; « Le carnet » = the
// identity + tree + service history). This drives: both segments render, the tree
// (Ses choses → tapping a child carnet navigates into it, surfacing the breadcrumb),
// the service history from care-log, and the confirm-then-DELETE removal. Stubs the
// carnets tree + care-log + home-pins (the shared mock returns {} for all three).

const DAY = 86400
const carnet = (over: Record<string, unknown>) => ({
  parentId: null,
  kind: 'home',
  mediaKey: null,
  color: '#88a36f',
  facts: null,
  installedAt: null,
  lifespanMonths: null,
  linkId: null,
  notes: null,
  sort: 0,
  ...over,
})

// A house with one child thing (the water heater) — exercises the tree + breadcrumb.
const HOME = carnet({ id: 'ca1', kind: 'home', name: 'Notre maison', installedAt: BASE - 3650 * DAY, notes: 'Construite en 1996.' })
const HEATER = carnet({ id: 'ca2', parentId: 'ca1', kind: 'appliance', name: 'Chauffe-eau', color: '#F2A03D', installedAt: BASE - 1000 * DAY, lifespanMonths: 144 })
const ENTRIES = [
  { id: 'cl1', carnetId: 'ca1', at: BASE - 30 * DAY, kind: 'service', title: 'Ramonage cheminée', note: 'Fait par Roy Ramonage', costCents: 14000, businessId: null, mediaKeys: [] },
]

async function stubCarnet(page: Page) {
  await page.route('**/api/carnets**', async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() === 'GET') {
      const body = url.searchParams.get('archived') === '1' ? { carnets: [] } : { carnets: [HOME, HEATER], soon: [] }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  await page.route('**/api/care-log**', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: ENTRIES }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  await page.route('**/api/home-pins**', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pins: [] }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
})

test('the carnet scene shows the hero + both segments', async ({ page }) => {
  await stubCarnet(page)
  await page.goto('/cercle/carnet/ca1')
  await expect(page.locator('.scene.carnet-scene')).toHaveAttribute('aria-label', 'Notre maison')
  await expect(page.locator('.carnet-hero__main h2', { hasText: 'Notre maison' })).toBeVisible()
  for (const label of ['À surveiller', 'Le carnet']) {
    await expect(page.locator('.subtabs__opt', { hasText: label })).toBeVisible()
  }
})

test('« Le carnet » shows identity, the child thing, and the service history', async ({ page }) => {
  await stubCarnet(page)
  await page.goto('/cercle/carnet/ca1')
  // Default segment is « Le carnet » (nothing due → soon empty).
  await expect(page.getByText('Identité')).toBeVisible()
  await expect(page.locator('.carnet-chose__name', { hasText: 'Chauffe-eau' })).toBeVisible()
  await expect(page.locator('.cercle-row__name', { hasText: 'Ramonage cheminée' })).toBeVisible()
})

test('tapping a child thing navigates into its carnet (breadcrumb appears)', async ({ page }) => {
  await stubCarnet(page)
  await page.goto('/cercle/carnet/ca1')
  await page.locator('.carnet-chose', { hasText: 'Chauffe-eau' }).click()
  await page.waitForURL(/\/cercle\/carnet\/ca2/)
  // A child sits inside a parent → the ancestor breadcrumb renders.
  await expect(page.locator('.carnet-crumbs')).toBeVisible()
  await expect(page.locator('.carnet-crumbs__here', { hasText: 'Chauffe-eau' })).toBeVisible()
})

test('« À surveiller » surfaces recent history entries', async ({ page }) => {
  await stubCarnet(page)
  await page.goto('/cercle/carnet/ca1')
  await page.locator('.subtabs__opt', { hasText: 'À surveiller' }).click()
  await expect(page.getByText('Dernières entrées')).toBeVisible()
  await expect(page.locator('.cercle-row__name', { hasText: 'Ramonage cheminée' })).toBeVisible()
})

test('deleting the carnet confirms then DELETEs', async ({ page }) => {
  await stubCarnet(page)
  await page.goto('/cercle/carnet/ca1')
  // The carnet's own edit/delete moved out of the Identité block (invisible from the
  // « Surveiller » tab) into the scene head's ⋯ overflow — one tab-independent door.
  await page.locator('.scene__head .action-menu__btn').click()
  await page.getByRole('menuitem', { name: 'Supprimer le carnet' }).click()
  // The heavy delete asks first (useConfirm, confirmLabel « Supprimer le carnet »).
  const isDelete = (r: Request) => r.method() === 'DELETE' && new URL(r.url()).pathname === '/api/carnets'
  await Promise.all([
    page.waitForRequest(isDelete, { timeout: 20_000 }),
    page.getByRole('button', { name: 'Supprimer le carnet' }).click(),
  ])
})
