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

// D-18 (bmad/10) « Le pont » — the guest-link mint form (Réglages ▸ Système ▸
// « Partager un accès ») grows a durable (standing) option for EVERY guest kind: pick
// « Durable — jusqu'à révocation » in the SAME duration <select> instead of a TTL.
test.describe('guest link mint — durable (standing) links', () => {
  test.beforeEach(async ({ page }) => {
    // No links yet by default — ActiveLinksList hides itself until minted/overridden.
    await page.route('**/api/guest-links', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ links: [] }) }),
    )
  })

  test('the durable option exists for every kind, and switching kind resets off it', async ({ page }) => {
    await page.goto('/settings?tab=settings&sub=guest')
    const ttlSelect = page.getByLabel('Durée')
    await expect(ttlSelect).toBeVisible()
    await expect(ttlSelect.locator('option', { hasText: 'Durable' })).toHaveCount(1)

    // Pick it, then switch kind — chooseKind resets the duration to that kind's
    // sensible default, so a stray standing pick can't silently ride to another kind.
    await ttlSelect.selectOption({ label: 'Durable — jusqu’à révocation' })
    await expect(page.getByLabel('Pour qui ?')).toBeVisible()
    await page.getByLabel('Type d’accès').selectOption('welcome')
    await expect(page.getByLabel('Pour qui ?')).toHaveCount(0)
    await expect(ttlSelect.locator('option', { hasText: 'Durable' })).toHaveCount(1)
  })

  test('picking « Durable » requires a name, then mints standing:true + label, marked « N’expire pas »', async ({ page }) => {
    let mintBody: Record<string, unknown> | null = null
    await page.route('**/api/guest/start', (route) => {
      try {
        mintBody = JSON.parse(route.request().postData() || '{}')
      } catch {
        /* no body */
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          guestToken: 'tok_e2e',
          guestId: 'g_e2e',
          kind: 'sitter',
          standing: true,
          label: 'Mamie',
          lang: null,
          ttlSeconds: 315360000,
          expiresAt: 9_999_999_999,
          targetKey: null,
        }),
      })
    })

    await page.goto('/settings?tab=settings&sub=guest')
    await page.getByLabel('Durée').selectOption({ label: 'Durable — jusqu’à révocation' })

    // Required name — Generate refuses (client-side, no request fires) without one.
    await page.getByRole('button', { name: 'Générer le lien' }).click()
    await expect(page.getByText('Un nom est requis pour un lien durable.')).toBeVisible()
    expect(mintBody).toBeNull()

    await page.getByLabel('Pour qui ?').fill('Mamie')
    await page.getByRole('button', { name: 'Générer le lien' }).click()
    await expect(page.getByRole('textbox', { name: 'Partager un accès (lecture seule)' })).toBeVisible()

    expect(mintBody).toMatchObject({ standing: true, label: 'Mamie', kind: 'sitter' })
    await expect(page.getByText('N’expire pas')).toBeVisible()
  })

  test('an active standing link is marked « N’expire pas », and revoking it asks to confirm first', async ({ page }) => {
    let revokes = 0
    await page.route('**/api/guest-links', (route) => {
      if (route.request().method() === 'POST') {
        revokes++
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          links: [{ id: 'g1', kind: 'sitter', target_key: null, standing: 1, label: 'Mamie', created_at: 0, expires_at: 9_999_999_999 }],
        }),
      })
    })

    await page.goto('/settings?tab=settings&sub=guest')
    const row = page.locator('.operator__guest-links').filter({ hasText: 'Mamie' })
    await expect(row).toBeVisible()
    await expect(row.getByText('N’expire pas')).toBeVisible()

    // Cancel — no revoke fires; the row stays.
    await row.getByRole('button', { name: 'Révoquer' }).click()
    const dialog = page.locator('.confirm')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Annuler' }).click()
    await expect(dialog).toBeHidden()
    expect(revokes).toBe(0)

    // Confirm — the POST fires.
    await row.getByRole('button', { name: 'Révoquer' }).click()
    await page.locator('.confirm').getByRole('button', { name: 'Révoquer', exact: true }).click()
    await expect.poll(() => revokes).toBeGreaterThan(0)
  })
})
