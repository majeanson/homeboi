import { test, expect } from '@playwright/test'
import { BASE, mockApi, seedState } from './mocks'

// The board's « Notes (cercle) » card renders the shared NotesList in its COMPACT
// face (compact-rows pass): a reading surface — no drag grip, no tint dot, no scope
// chip, no pencil/trash — where the row's whole width goes to the text and "who"
// is the title's author tint. Acting on a note (edit/delete/reorder/compose) lives
// in « Les notes » (its own hub tab since the nav restructure split it out of Le
// cercle) behind the footer link — with ONE exception: the header ＋ opens the shared
// NoteQuickAdd in place, so a quick note doesn't cost a trip to the section. Reading
// still works in place: this guards that the row furniture is really gone, that
// expand-to-read survives, AND that the ＋ writes for the picked face.
// (Replaces note-editor-board.spec.ts — the board no longer opens the NoteEditor.)

const NOTE = {
  id: 'n1',
  member_id: null, // Maisonnée → visible whatever face the board has picked
  author_member_id: null,
  title: 'Couture',
  text: 'kit été rouge : short en twill',
  media_kind: null,
  media_key: null,
  scene_key: null,
  position: 0,
  created_at: BASE, // unix SECONDS (formatDay multiplies by 1000) — an ISO string NaNs the row
  updated_at: BASE,
}

test('the board notes card is a compact reading surface — no row actions, expand in place', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 })
  await mockApi(page)
  await page.route('**/api/family-notes**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes: [NOTE] }) })
  })
  // `cercleNotes` defaults to a HALF card, which renders as a compact tile (CardMini) on a
  // narrow grid — the rows only exist at full width.
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', cardPrefs: { size: { cercleNotes: 'full' } } })

  await page.goto('/board')
  const row = page.locator('.cnote-list--compact .cnote', { hasText: 'Couture' })
  await expect(row).toBeVisible()

  // The compact row carries none of the acting furniture.
  await expect(row.locator('.cnote__act')).toHaveCount(0)
  await expect(row.locator('.cnote__grip')).toHaveCount(0)
  await expect(row.locator('.cnote__chip')).toHaveCount(0)
  await expect(row.locator('.cnote__dot')).toHaveCount(0)

  // Reading stays: tapping the body expands the full note in place.
  await row.locator('.cnote__main').click()
  await expect(row).toHaveClass(/cnote--expanded/)
  await expect(row.locator('.cnote__full')).toContainText('short en twill')

  // The door to the acting surface is the footer link into « Les notes ».
  await expect(page.locator('.cnotes-card__more')).toBeVisible()
  await expect(page.locator('.cnotes-card__more')).toHaveAttribute('href', '/notes')
})

test('the header ＋ writes a quick note in place, scoped to the picked face', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 })
  await mockApi(page)
  await page.route('**/api/family-notes**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes: [NOTE] }) })
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', cardPrefs: { size: { cercleNotes: 'full' } } })

  await page.goto('/board')
  const card = page.locator('.bento', { has: page.locator('.cnote-list--compact') })
  await expect(card).toBeVisible()

  // Closed by default — the card is a glance until you ask for the composer.
  await expect(card.locator('.cnotes-card__composer')).toHaveCount(0)

  const add = card.getByRole('button', { name: 'Écrire une note rapide' })
  await add.click()
  const field = card.locator('.cnotes-card__composer input[type="text"], .cnotes-card__composer input:not([type])').first()
  await expect(field).toBeVisible()

  await field.fill('sortir les bacs')
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/api/family-notes') && r.method() === 'POST'),
    field.press('Enter'),
  ])
  const body = JSON.parse(req.postData() || '{}')
  expect(body.text).toBe('sortir les bacs')
  // No face picked on a fresh device → the Maisonnée scope, never a stray member id.
  expect(body.scope).toBe('family')
  expect(body.member_id).toBeNull()

  // Written → the composer folds away and the card is a glance again.
  await expect(card.locator('.cnotes-card__composer')).toHaveCount(0)
})
