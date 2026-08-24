import { test, expect, type Page, type Request } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Behavioural coverage for « Les carnets » — the reversible archive (§8/theme-4, the
// last real e2e gap). A carnet's « supprimer » ARCHIVES (archived_at) rather than
// hard-deleting, so the Carnets tab shows a collapsed "Carnets archivés" list whose
// « Restaurer » PATCHes restore:true and clears archived_at on the subtree. The shared
// mock returns {} for /api/carnets, which would render the empty state — so this stubs
// the tree GET + its ?archived=1 variant, and asserts the restore write (every mock
// write returns {ok:true}, so we assert the request, not a refetched outcome).

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

const HOME = carnet({ id: 'ca1', kind: 'home', name: 'Notre maison' })
const ARCHIVED = carnet({ id: 'ca9', kind: 'auto', name: 'Ancienne Civic', color: '#5891AC' })

// GET /api/carnets → the live tree; GET /api/carnets?archived=1 → the archived roots
// (only fetched for an operator). Writes hand back {ok:true}.
async function stubCarnets(page: Page) {
  await page.route('**/api/carnets**', async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() === 'GET') {
      const body =
        url.searchParams.get('archived') === '1'
          ? { carnets: [ARCHIVED] }
          : { carnets: [HOME], soon: [] }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
})

test('the Carnets tab lists top-level carnets', async ({ page }) => {
  await stubCarnets(page)
  await page.goto('/maison?section=carnets')
  await expect(page.locator('.cercle-row__name', { hasText: 'Notre maison' })).toBeVisible()
})

test('restoring an archived carnet PATCHes restore:true', async ({ page }) => {
  await stubCarnets(page)
  await page.goto('/maison?section=carnets')
  // The reversible-archive list is collapsed by default (calm) — expand it first.
  await page.getByRole('button', { name: /Carnets archivés/ }).click()
  await expect(page.locator('.cercle-row__name', { hasText: 'Ancienne Civic' })).toBeVisible()
  // « Restaurer » sends a PATCH carrying restore:true — assert both.
  const isRestore = (r: Request) =>
    r.method() === 'PATCH' &&
    new URL(r.url()).pathname === '/api/carnets' &&
    (() => {
      try {
        return JSON.parse(r.postData() || '{}').restore === true
      } catch {
        return false
      }
    })()
  await Promise.all([
    page.waitForRequest(isRestore, { timeout: 20_000 }),
    page.getByRole('button', { name: 'Restaurer' }).click(),
  ])
})
