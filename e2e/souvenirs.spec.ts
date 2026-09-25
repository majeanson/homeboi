import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, BASE } from './mocks'

// « Souvenirs » (PLAN-mots C1, accepted 2026-09-25 — « put the widget back »): a band card
// that shelves what the household chose to KEEP — kept mots (saved_at, since 0094), kept
// drawings and kept photos (saved_at, 0140) — as one scrolling line of thumbnails and
// hand-written lines. A shelf you visit: no count, no « on this day ». Absent when
// nothing is kept (mode 'auto'). The keep itself is one pin on the photo frame and one on
// each gallery drawing; a kept mot already had its « Garder ».

const MOT = {
  id: 'mo1', member_id: null, author_member_id: 'm2', text: 'Premier jour d’école !',
  media_kind: null, media_key: null, scene_key: null, created_at: BASE - 86_400,
  updated_at: null, opened_at: BASE - 80_000, saved_at: BASE - 79_000, surface_at: null, reply_to: null,
}
const PHOTOS = [
  { id: 'p1', key: 'ph_kept', saved_at: BASE - 3600 },
  { id: 'p2', key: 'ph_plain', saved_at: null },
]
const DRAWINGS = [
  { id: 'dg1', member_id: 'm3', media_key: 'nm_g1', scene_key: 'ns_g1', created_at: BASE, saved_at: BASE - 100 },
  { id: 'dg2', member_id: 'm1', media_key: 'nm_g2', scene_key: null, created_at: BASE - 86_400, saved_at: null },
]

async function boot(page: Page, o: { mots?: object[]; photos?: object[]; drawings?: object[] } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/api/mots**', (route) => (route.request().method() === 'GET' ? route.fulfill(json({ mots: o.mots ?? [] })) : route.fulfill(json({ ok: true }))))
  await page.route('**/api/photos**', (route) => (route.request().method() === 'GET' ? route.fulfill(json({ photos: o.photos ?? [] })) : route.fulfill(json({ ok: true }))))
  await page.route('**/api/drawings**', (route) => (route.request().method() === 'GET' ? route.fulfill(json({ drawings: o.drawings ?? [], more: false })) : route.fulfill(json({ ok: true }))))
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
    } catch {
      /* noop */
    }
  })
  await page.goto('/board')
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
}

const shelf = (page: Page) => page.locator('.wg-slot[data-card="souvenirs"]')

test('the shelf shows exactly what is kept — a photo, a drawing, a mot — and a mot opens its peek', async ({ page }) => {
  await boot(page, { mots: [MOT], photos: PHOTOS, drawings: DRAWINGS })
  const card = shelf(page)
  await expect(card).toBeVisible()
  // Two pictures (the kept photo + the kept drawing), never the unkept ones.
  await expect(card.locator('.souv__tile img')).toHaveCount(2)
  await expect(card.locator('.souv__tile img[src*="ph_kept"]')).toHaveCount(1)
  await expect(card.locator('.souv__tile img[src*="nm_g1"]')).toHaveCount(1)
  await expect(card.locator('img[src*="ph_plain"], img[src*="nm_g2"]')).toHaveCount(0)
  // The kept mot reads as its line, and taps into the same peek the mots card opens.
  const mot = card.locator('.souv__mot', { hasText: 'Premier jour d’école' })
  await expect(mot).toHaveCount(1)
  await mot.click()
  await expect(page.locator('.detail-sheet')).toContainText('Premier jour d’école !')
  // Calm: nothing on the card counts anything.
  await expect(card).not.toContainText(/\b\d+ (souvenirs?|photos?|dessins?|mots?)\b/)
})

test('nothing kept, no shelf — the card does not sit empty on the band', async ({ page }) => {
  await boot(page, { mots: [{ ...MOT, saved_at: null }], photos: [PHOTOS[1]], drawings: [DRAWINGS[1]] })
  await expect(page.locator('.wg-slot[data-card="mots"], .wg-slot[data-card="photos"]').first()).toBeVisible()
  // An 'auto' slot stays MOUNTED and hidden when empty (board-empty-cards.spec says why:
  // a self-fetching card only learns it is empty after fetching) — hidden, never absent.
  await expect(shelf(page)).toBeHidden()
})

test('the photo frame’s pin keeps the photo on show — one PATCH, pressed state', async ({ page }) => {
  await boot(page, { photos: [PHOTOS[1]] })
  const frame = page.locator('.wg-slot[data-card="photos"] .photo-frame')
  await expect(frame).toBeVisible()
  const pin = frame.getByRole('button', { name: 'Garder' })
  await expect(pin).toHaveAttribute('aria-pressed', 'false')
  const patched = page.waitForRequest((r) => r.url().includes('/api/photos') && r.method() === 'PATCH')
  await pin.click()
  expect(JSON.parse((await patched).postData() || '{}')).toEqual({ id: 'p2', saved: true })
})
