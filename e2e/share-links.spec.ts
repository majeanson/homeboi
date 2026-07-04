import { test, expect, type Route } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « Partager » (wave 2) — the SENDER flow: from a recipe view, « Partager » mints a real
// /partage link (POST /api/share {kind:'recipe'}) and the sheet shows the copyable URL +
// a scannable QR. The harness has no backend; the write returns a stub url, so we assert
// the REQUEST fired (path + body) and the minted link renders — the interactions.spec
// discipline. The public /partage page it points at is covered in partage-public.spec.ts.

const SHARE_URL = 'https://babillard.test/partage/shX'
const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.routeWebSocket(/\/api\/live/, () => {})
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  // Stub the share rail. POST → a minted link; GET (ledger) → one live share. Registered
  // AFTER mockApi's catch-all so it wins for /api/share (and NOT /api/share-public — the
  // recipe sender never calls that; the glob **/api/share** would match it, but this spec
  // stays on /api/share only).
  await page.route('**/api/share', (route: Route) =>
    route.fulfill(
      route.request().method() === 'POST'
        ? json({ id: 'shX', url: SHARE_URL, expiresAt: 0 })
        : json({ shares: [{ id: 'shX', kind: 'recipe', label: 'Spaghetti maison', createdAt: 0, expiresAt: null }] }),
    ),
  )
})

test('a recipe view « Partager » mints a /partage link: POST {kind,recipeId} → URL input + copy + QR', async ({ page }) => {
  await page.goto('/kitchen/recipe/rc1')

  // The « Partager » foot button (operator + non-toddler) opens the sheet, which
  // auto-mints the link on open (POST /api/share) — assert the request shape + the URL.
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/share', { timeout: 20_000 }),
    page.getByRole('button', { name: 'Partager' }).click(),
  ])
  expect(req.postDataJSON()).toMatchObject({ kind: 'recipe', recipeId: 'rc1' })

  // The minted link shows: the read-only input, the copy button, and the scannable QR.
  await expect(page.getByRole('textbox', { name: 'Copier le lien' })).toHaveValue(SHARE_URL)
  await expect(page.getByRole('button', { name: 'Copier le lien' })).toBeVisible()
  await expect(page.locator('.qrcode img')).toBeVisible()
})
