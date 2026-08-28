import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// REVIEW-PASS « voy »: a trip with no dates yet was filtered out of the board's
// « Prochain voyage » card, and that card plus /search are the only two places trips
// are listed at all. So you could create « on veut aller en Gaspésie, un jour », close
// the scene, and never find it again unless you remembered the name well enough to
// search it.
//
// Requiring dates would have been the wrong fix — an early idea legitimately has none,
// and a made-up date to keep the trip visible is worse than no date. So undated trips
// fill the REMAINDER of the card: they are reachable, but they never displace a real
// upcoming departure off a three-row list.

const DAY = 86400
const soon = (d: number) => Math.floor(Date.now() / 1000 / DAY) * DAY + d * DAY

const dated = (id: string, title: string, inDays: number) => ({
  id, title, colour: '#2a8f85', destination: null, notes: null, members: [],
  media_kind: null, media_key: null, position: 0, created_at: 1, updated_at: null,
  start_at: soon(inDays), end_at: soon(inDays + 3),
})
const undated = (id: string, title: string, created: number) => ({
  id, title, colour: '#2a8f85', destination: null, notes: null, members: [],
  media_kind: null, media_key: null, position: 0, created_at: created, updated_at: null,
  start_at: null, end_at: null,
})

async function board(page: Page, trips: unknown[]) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await page.route('**/api/trips**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ trips }) }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })
  await page.goto('/board')
}

test('an undated trip is reachable from the board instead of vanishing', async ({ page }) => {
  await board(page, [undated('t1', 'Gaspésie un jour', 100)])
  const card = page.locator('.voyage-card')
  await expect(card).toBeVisible()
  const row = card.locator('a[href="/voyage/t1"]')
  await expect(row).toBeVisible()
  await expect(row).toContainText('Gaspésie un jour')
  // It says so plainly rather than computing a countdown from a null — the first
  // draft of this rendered « dans NaN jours ».
  await expect(row).toContainText('Sans dates')
  await expect(row).not.toContainText('NaN')
})

test('undated trips fill the remainder — they never displace an upcoming departure', async ({ page }) => {
  // Three someday-ideas plus one real departure. The card holds three rows; the
  // departure must be one of them, and it must come first.
  await board(page, [
    undated('u1', 'Idée un', 300),
    undated('u2', 'Idée deux', 200),
    undated('u3', 'Idée trois', 100),
    dated('d1', 'Départ la semaine prochaine', 7),
  ])
  const rows = page.locator('.voyage-card__row')
  await expect(rows).toHaveCount(3)
  await expect(rows.first()).toContainText('Départ la semaine prochaine')
  // Newest-first among the undated, since they have nothing else to sort by.
  await expect(rows.nth(1)).toContainText('Idée un')
  await expect(rows.nth(2)).toContainText('Idée deux')
})

test('with no trips at all the card still reports empty (no blank shell)', async ({ page }) => {
  await board(page, [])
  await expect(page.locator('.voyage-card')).toHaveCount(0)
})

// ---- The cover photo, no longer a write-only dead branch ---------------------
//
// `trips.media_key` had a column, a PATCH branch and correct old-blob cleanup since
// the feature shipped — but no picker anywhere and no render anywhere, so it could
// never be anything but null. Now: picked in the trip form (the shared PhotoField),
// shown as the board row's thumbnail.

test('the trip form offers a cover picker, and the picked key is what gets saved', async ({ page }) => {
  let patched: Record<string, unknown> | null = null
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await page.route('**/api/trips**', async (route) => {
    const m = route.request().method()
    if (m === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ trips: [dated('t1', 'Gaspésie', 7)] }) })
    }
    if (m === 'PATCH') patched = route.request().postDataJSON()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  // The blob upload hands back the opaque key the row then stores.
  await page.route('**/api/trip-doc-media**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: 'tn_cover.png', kind: 'image' }) }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/voyage/t1')

  await page.locator('.scene__head .action-menu__btn').click()
  await page.getByRole('menuitem', { name: 'Modifier le voyage' }).click()

  const input = page.locator('.business-form__photo input[type="file"]')
  await expect(input).toHaveCount(1)
  await input.setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') })
  // The upload resolved → the field shows the picture instead of the placeholder.
  await expect(page.locator('.business-form__photo-img')).toBeVisible()

  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect.poll(() => patched, { timeout: 10_000 }).not.toBeNull()
  expect((patched as unknown as { media_key?: string }).media_key).toBe('tn_cover.png')
})

test('a trip with a cover shows it on the board row; one without shows no broken tile', async ({ page }) => {
  await board(page, [
    { ...dated('t1', 'Avec photo', 7), media_kind: 'image', media_key: 'tn_cover.png' },
    dated('t2', 'Sans photo', 9),
  ])
  await page.route('**/api/img/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') }),
  )
  const withPhoto = page.locator('.voyage-card__row', { hasText: 'Avec photo' })
  const without = page.locator('.voyage-card__row', { hasText: 'Sans photo' })
  await expect(withPhoto.locator('img.voyage-card__cover')).toHaveCount(1)
  await expect(without.locator('img.voyage-card__cover')).toHaveCount(0)
  // Decorative: the title carries the meaning, so the image is not announced.
  await expect(withPhoto.locator('img.voyage-card__cover')).toHaveAttribute('alt', '')
})
