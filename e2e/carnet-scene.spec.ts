import { test, expect, type Page, type Request, type Route } from '@playwright/test'
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

// ---- The write seams: care-log, « en cas de pépin » pins, attached docs ------
//
// Everything above reads. What follows drives the seams a silent break costs real
// data on: the DEFERRED-REMOVAL undo (a row that resurrects mid-undo, or a DELETE
// that fires despite « Annuler ») and the R2 doc strip (a blob that can't be opened).
// Both were behaviourally uncovered — the scene's coverage stopped at render + the
// carnet's own DELETE.

const PIN = { id: 'hp1', carnetId: 'ca1', kind: 'water', label: 'Valve principale', detail: 'Sous-sol, derriere la trappe.', mediaKey: null, sort: 0 }

// Same stub as above, but with the care-log / pin frames per test and a request log
// so a test can assert a write did NOT happen (the interesting half of an undo).
function stubWritable(page: Page, opts: { entries?: unknown[]; pins?: unknown[] } = {}) {
  const seen: { method: string; path: string }[] = []
  const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  const wire = async (route: Route, get: unknown) => {
    const m = route.request().method()
    const path = new URL(route.request().url()).pathname
    if (m === 'GET') return json(route, get)
    seen.push({ method: m, path })
    return json(route, { ok: true })
  }
  return {
    seen,
    install: async () => {
      await page.route('**/api/carnets**', async (route) => {
        const url = new URL(route.request().url())
        if (route.request().method() === 'GET') {
          return json(route, url.searchParams.get('archived') === '1' ? { carnets: [] } : { carnets: [HOME, HEATER], soon: [] })
        }
        seen.push({ method: route.request().method(), path: url.pathname })
        return json(route, { ok: true })
      })
      await page.route('**/api/care-log**', (route) => wire(route, { entries: opts.entries ?? ENTRIES }))
      await page.route('**/api/home-pins**', (route) => wire(route, { pins: opts.pins ?? [] }))
    },
  }
}

const logRow = (page: Page, title: string) => page.locator('.carnet-logrow', { hasText: title })
const pinRow = (page: Page, label: string) => page.locator('.carnet-pinrow', { hasText: label })
const careLogCalls = (seen: { method: string; path: string }[]) => seen.filter((r) => r.path === '/api/care-log')

test('Annuler on a care-log delete puts the row back and never sends the DELETE', async ({ page }) => {
  // The undo seam. `removeLog` holds the write behind the toast (useDeferredRemoval),
  // so an undo must leave the server completely untouched — not delete-then-recreate.
  const api = stubWritable(page)
  await api.install()
  await page.goto('/cercle/carnet/ca1')
  const row = logRow(page, 'Ramonage')
  await expect(row).toBeVisible()

  await row.getByRole('button', { name: 'Supprimer' }).click()
  await expect(row).toHaveCount(0) // hidden at once — no waiting on the server
  await expect(page.locator('.undo-toast')).toBeVisible()

  await page.locator('.undo-toast__btn').first().click()
  await expect(row).toBeVisible()
  // The whole point: the write never ran, so there is nothing to reconcile.
  expect(careLogCalls(api.seen)).toEqual([])
})

test('a refetch mid-undo cannot resurrect the deleted care-log row', async ({ page }) => {
  // The bug useDeferredRemoval exists to kill: the list is `live` (staleTime 0), so a
  // poll / realtime nudge lands while the DELETE is still held, and the row flashes
  // back from a server frame that legitimately still contains it. `visible()` filters
  // it out of the render, so no refetch can put it back. Driven here by the focus
  // refetch (`live.refetchOnWindowFocus`) rather than by waiting out the poll.
  const api = stubWritable(page)
  await api.install()
  await page.goto('/cercle/carnet/ca1')
  const row = logRow(page, 'Ramonage')
  await expect(row).toBeVisible()

  await row.getByRole('button', { name: 'Supprimer' }).click()
  await expect(row).toHaveCount(0)

  // Force a real GET while the removal is still pending, and prove one arrived.
  const refetched = page.waitForRequest((r) => r.method() === 'GET' && new URL(r.url()).pathname === '/api/care-log')
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await refetched

  // The server frame still lists the entry; the row must stay gone regardless.
  await expect(row).toHaveCount(0)
  await expect(page.locator('.undo-toast')).toBeVisible()
})

test('letting the undo expire sends the DELETE once', async ({ page }) => {
  // The other half: no Annuler → the held write commits. 15 s hold
  // (toast.tsx DEFAULT_UNDO_MS), which is why this one waits.
  const api = stubWritable(page)
  await api.install()
  await page.goto('/cercle/carnet/ca1')
  await logRow(page, 'Ramonage').getByRole('button', { name: 'Supprimer' }).click()
  await expect(page.locator('.undo-toast')).toBeVisible()

  // Poll the recorded calls rather than reading them once after waitForRequest:
  // that resolves when the request is ISSUED, which can beat the route handler that
  // records it. (Cost one red run — the DELETE had fired and the log was still empty.)
  await expect
    .poll(() => careLogCalls(api.seen).filter((r) => r.method === 'DELETE').length, { timeout: 30_000 })
    .toBe(1)
})

test('deleting a care-log entry does not hide a pin (separate removal scopes)', async ({ page }) => {
  // useDeferredRemoval buckets by the query key's RESOURCE HEAD, so care-log and
  // home-pins are independent. Ids are globally unique, but a shared bucket would
  // still be the wrong model — and this is the cheapest way to say so out loud.
  const api = stubWritable(page, { pins: [PIN] })
  await api.install()
  await page.goto('/cercle/carnet/ca1')
  const pin = pinRow(page, 'Valve principale')
  await expect(pin).toBeVisible()

  await logRow(page, 'Ramonage').getByRole('button', { name: 'Supprimer' }).click()
  await expect(logRow(page, 'Ramonage')).toHaveCount(0)
  await expect(pin).toBeVisible()
})

test('Annuler on a pin delete puts it back and never sends the DELETE', async ({ page }) => {
  const api = stubWritable(page, { pins: [PIN] })
  await api.install()
  await page.goto('/cercle/carnet/ca1')
  const pin = pinRow(page, 'Valve principale')
  await expect(pin).toBeVisible()

  await pin.getByRole('button', { name: 'Supprimer' }).click()
  await expect(pin).toHaveCount(0)
  await page.locator('.undo-toast__btn').first().click()
  await expect(pin).toBeVisible()
  expect(api.seen.filter((r) => r.path === '/api/home-pins')).toEqual([])
})

test('adding a care-log entry POSTs it', async ({ page }) => {
  const api = stubWritable(page)
  await api.install()
  await page.goto('/cercle/carnet/ca1')
  // SectionAdd unfolds the form under Historique.
  await page.locator('.sec-label__actbtn[aria-label="Ajouter au carnet"]').click()
  await page.getByLabel('Titre').fill('Changement d anode')
  // A NEW entry's submit label is « Ajouter au carnet » too (FormFooter saveLabel) —
  // the same string as the toggle that opened the form, so scope to the form itself.
  await Promise.all([
    page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/care-log'),
    page.locator('.operator__inline-form').getByRole('button', { name: 'Ajouter au carnet' }).click(),
  ])
})

test('editing a care-log entry seeds the form and PATCHes it', async ({ page }) => {
  const api = stubWritable(page)
  await api.install()
  await page.goto('/cercle/carnet/ca1')
  await logRow(page, 'Ramonage').getByRole('button', { name: 'Modifier' }).click()
  const title = page.getByLabel('Titre')
  await expect(title).toHaveValue('Ramonage cheminée') // seeded from the row, not blank
  await title.fill('Ramonage, 2e passe')
  await Promise.all([
    page.waitForRequest((r) => r.method() === 'PATCH' && new URL(r.url()).pathname === '/api/care-log'),
    page.getByRole('button', { name: 'Enregistrer' }).click(),
  ])
})

test('an attached PDF opens the read sheet; a photo stays an image', async ({ page }) => {
  // The R2 read seam (CarnetDocs). A key's `.pdf` suffix picks the tile: PDF → a
  // button that opens the inline <iframe> sheet, anything else → a zoomable <img>.
  // A break here is silent — the doc is still stored, just unreachable.
  const api = stubWritable(page, {
    entries: [{ ...ENTRIES[0], mediaKeys: ['care/fac1.pdf', 'care/photo1.jpg'] }],
  })
  await api.install()
  // The blobs never resolve in this harness; serve a real 1px GIF so the <img> does
  // not hit DocTile's onError path and flip itself into a PDF tile.
  await page.route('**/api/img/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') }),
  )
  await page.goto('/cercle/carnet/ca1')
  const docs = logRow(page, 'Ramonage').locator('.carnet-docs')
  await expect(docs.locator('.carnet-docs__pdf')).toHaveCount(1)
  await expect(docs.locator('img')).toHaveCount(1)

  await docs.locator('.carnet-docs__pdf').click()
  const frame = page.locator('.carnet-docsheet__frame')
  await expect(frame).toBeVisible()
  await expect(frame).toHaveAttribute('src', '/api/img/care/fac1.pdf')
})
