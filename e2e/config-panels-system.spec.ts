import { test, expect, type Page } from '@playwright/test'
import { BASE } from './mocks'
import { isApi, panelsReady } from './interact'

// Réglages config panels, Système (tablets, guest links, AI, photos). Each test asserts the write fires AND carries the right
// field: why a settings panel needs that is written out above `panelsReady` in interact.ts.

test.beforeEach(async ({ page }) => panelsReady(page))

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

// ─────────────────────────────────────────────────────────────────────────────
// THE SECOND SWEEP (2026-09-08). Re-measured after the 28 → 14 merge: of the 17
// panels that write, these nine still asserted nothing — a settings card commits
// optimistically, so each read « saved » whether or not its write ever left.
// Every test below navigates by SECTION (?tab=&focus=, the address that survives a
// pill reshuffle) and scopes to the card's #op-<key> anchor, never to a pill label.
// Each was run against a planted bug (the id dropped from the body, the endpoint
// misspelled) and seen to fail before it was trusted.
//
// Deferred deletes (a device revoke, a photo) HOLD their write behind the undo
// toast; the test asserts the hold (nothing sent), then fires `pagehide` — the
// teardown flush every held write commits on (lib/toast) — and asserts the write.
// ─────────────────────────────────────────────────────────────────────────────

const flushHeldWrites = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('pagehide')))

test('revoking a paired tablet is held behind the undo, then posts revokeId on teardown', async ({ page }) => {
  let posts = 0
  await page.goto('/settings?tab=settings&focus=devices')
  await page.route('**/api/pair/devices**', async (route) => {
    if (route.request().method() === 'GET') return route.fallback()
    posts += 1
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  const card = page.locator('#op-devices')
  await card.getByRole('button', { name: 'Révoquer' }).first().click()
  await expect(page.locator('.undo-toast')).toBeVisible()
  // Held: a mis-tap must cost nothing, so nothing has left yet.
  expect(posts).toBe(0)
  const [req] = await Promise.all([page.waitForRequest(isApi('POST', 'pair/devices'), { timeout: 20_000 }), flushHeldWrites(page)])
  expect(JSON.parse(req.postData() || '{}')).toMatchObject({ revokeId: 'd1' })
})

test('revoking a live guest link posts revokeId (the token dies at once)', async ({ page }) => {
  await page.route('**/api/guest-links**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            links: [{ id: 'l1', kind: 'sitter', target_key: null, standing: 0, label: 'Mamie', created_at: BASE, expires_at: BASE + 86_400 }],
          }),
        })
      : route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
  )
  await page.goto('/settings?tab=settings&focus=guestLinks')
  const list = page.locator('.operator__guest-links')
  await expect(list).toBeVisible()
  const [req] = await Promise.all([
    page.waitForRequest(isApi('POST', 'guest-links'), { timeout: 20_000 }),
    list.getByRole('button', { name: 'Révoquer' }).first().click(),
  ])
  expect(JSON.parse(req.postData() || '{}')).toMatchObject({ revokeId: 'l1' })
})

test('the sitter info block patches household with the typed fields', async ({ page }) => {
  // The block seeds itself from a mount fetch, so wait for that to land before
  // typing: the field must hold what we typed at the moment we save, not whatever
  // the seed put there. (The product no longer clobbers a keystroke either — see
  // `typed` in ShareInfoEditor — but a spec that types into a half-loaded form is
  // testing the race, not the write.)
  const seeded = page.waitForResponse((r) => r.url().includes('/api/household') && r.request().method() === 'GET')
  await page.goto('/settings?tab=settings&focus=guestLinks')
  await seeded
  const card = page.locator('.operator__section', { hasText: 'Infos à partager' })
  const wifi = card.getByLabel('Réseau Wi-Fi')
  await wifi.fill('Maison-5G')
  await expect(wifi).toHaveValue('Maison-5G')
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
    card.getByRole('button', { name: 'Enregistrer' }).click(),
  ])
  expect(JSON.parse(req.postData() || '{}')).toMatchObject({ wifiSsid: 'Maison-5G' })
})

test('a keystroke typed while the sitter block is still loading survives the seed', async ({ page }) => {
  // The block starts EMPTY and fills itself from a mount fetch. Hold that fetch open,
  // type into the field the way a fast operator on a slow phone would, THEN let the
  // household answer: the seed must not overwrite what was typed — or the save would
  // PATCH the value the operator thought they had replaced. Found on CI 2026-09-08,
  // where the runner is slow enough to lose the race every time (green locally).
  let release = () => {}
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/api/household**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await held
    return route.fallback()
  })
  await page.goto('/settings?tab=settings&focus=guestLinks')
  const wifi = page.locator('.operator__section', { hasText: 'Infos à partager' }).getByLabel('Réseau Wi-Fi')
  await wifi.fill('Maison-5G')
  release()
  await page.waitForResponse((r) => r.url().includes('/api/household') && r.request().method() === 'GET')
  await expect(wifi, 'the seed clobbered a keystroke').toHaveValue('Maison-5G')
})

test('« Tester l’IA » probes the binding with a POST (never a queued write)', async ({ page }) => {
  await page.route('**/api/ai-test**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ checks: [] }) }),
  )
  await page.goto('/settings?tab=settings&focus=aiLog')
  await Promise.all([
    page.waitForRequest(isApi('POST', 'ai-test'), { timeout: 20_000 }),
    page.getByRole('button', { name: 'Tester l’IA' }).click(),
  ])
})

test('« Vider le journal » DELETEs the AI error log', async ({ page }) => {
  await page.route('**/api/ai-errors**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ id: 'e1', feature: 'capture', message: 'boom', created_at: BASE }] }),
        })
      : route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
  )
  await page.goto('/settings?tab=settings&focus=aiLog')
  const card = page.locator('#op-aiLog')
  await expect(card.locator('.ai-log__row')).toHaveCount(1)
  await Promise.all([
    page.waitForRequest(isApi('DELETE', 'ai-errors'), { timeout: 20_000 }),
    card.getByRole('button', { name: 'Vider le journal' }).click(),
  ])
})

test('removing a household photo is held behind the undo, then DELETEs by id on teardown', async ({ page }) => {
  const deletes: string[] = []
  await page.route('**/api/photos**', (route) => {
    const m = route.request().method()
    if (m === 'GET')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ photos: [{ id: 'p1', key: 'k1', created_at: BASE }] }),
      })
    deletes.push(route.request().postData() || '')
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  await page.goto('/settings?tab=settings&focus=photos')
  const card = page.locator('#op-photos')
  await expect(card.locator('.photo-grid__item')).toHaveCount(1)
  await card.getByRole('button', { name: 'Supprimer' }).first().click()
  await expect(page.locator('.undo-toast')).toBeVisible()
  expect(deletes).toEqual([])
  await Promise.all([page.waitForRequest(isApi('DELETE', 'photos'), { timeout: 20_000 }), flushHeldWrites(page)])
  expect(JSON.parse(deletes[0] || '{}')).toMatchObject({ id: 'p1' })
})

// The photo half of « THE LAST TWO » (the note is in config-panels-maison.spec.ts).

/** The smallest real PNG: 1×1, so `resizeImage` has actual pixels to decode. */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test('adding a photo uploads the blob to photos', async ({ page }) => {
  await page.goto('/settings?tab=settings&focus=photos')
  const card = page.locator('#op-photos')
  const [req] = await Promise.all([
    page.waitForRequest(isApi('POST', 'photos'), { timeout: 20_000 }),
    card.locator('input[type="file"]').setInputFiles({ name: 'frigo.png', mimeType: 'image/png', buffer: PNG_1x1 }),
  ])
  // The body is the resized image itself, not a JSON envelope — so the assertion is
  // that real bytes went up. An empty POST is exactly what a broken resize produces.
  expect((req.postDataBuffer() ?? Buffer.alloc(0)).byteLength, 'the upload sent no bytes').toBeGreaterThan(0)
})
