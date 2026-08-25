import { test, expect, type Page } from '@playwright/test'
import { BASE, mockApi, seedState } from './mocks'

// « Les notes » wears two faces, one device flag (src/lib/notesMode):
//
//   SIMPLE (the default) — maximum note per pixel. No section title/subtitle, a small
//     face chip, a COLLAPSED loupe, one plain text box where Enter writes the note
//     (no mic, no 📎, no « Ajouter » button — those live in the ＋ FAB's composer),
//     and the board card's compact rows, keeping only the pencil/trash so a note can
//     still be edited or deleted from the page that owns it.
//   AVANCÉ — what the tab used to be: header, roomy rows with grip + scope chip,
//     mic + attachment inline, « Nouvelle note » into the rich editor.
//
// This guards the default face doesn't quietly grow its furniture back, and that the
// toggle really returns the old one.

const NOTE = {
  id: 'n1',
  member_id: null, // Maisonnée → visible under any picked face
  author_member_id: null,
  title: 'Couture',
  text: 'kit été rouge : short en twill',
  media_kind: null,
  media_key: null,
  scene_key: null,
  position: 0,
  created_at: BASE, // unix SECONDS (formatDay multiplies by 1000)
  updated_at: BASE,
}

async function openNotes(page: Page, advanced = false) {
  await page.setViewportSize({ width: 800, height: 1280 })
  await mockApi(page)
  await page.route('**/api/family-notes**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes: [NOTE] }) })
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  if (advanced) await page.addInitScript(() => localStorage.setItem('babillard-notes-advanced', '1'))
  await page.goto('/notes')
  await expect(page.locator('.cercle-notes')).toBeVisible()
}

test('simple (default): no section header, compact rows that still edit + delete', async ({ page }) => {
  await openNotes(page)

  // The header block is gone — the hub header above already says « Les notes ».
  await expect(page.locator('.cercle-notes__head')).toHaveCount(0)
  await expect(page.locator('.cercle-notes--lean')).toBeVisible()

  const row = page.locator('.cnote-list--compact .cnote', { hasText: 'Couture' })
  await expect(row).toBeVisible()
  // Compact drops the furniture…
  await expect(row.locator('.cnote__grip')).toHaveCount(0)
  await expect(row.locator('.cnote__chip')).toHaveCount(0)
  await expect(row.locator('.cnote__dot')).toHaveCount(0)
  // …but NOT the two doors that act on a note: this is the page the board's glance
  // card hands off to, so dropping them would leave no mouse/keyboard path at all.
  await expect(row.locator('.cnote__act')).toHaveCount(2)
})

test('simple: the composer is text only — Enter writes the note', async ({ page }) => {
  await openNotes(page)

  const composer = page.locator('.cercle-notes__composer')
  await expect(composer).toBeVisible()
  // No mic, no 📎, no « Ajouter » button competing with the text for width.
  await expect(composer.locator('button')).toHaveCount(0)

  const field = composer.locator('input[type="text"], input:not([type])').first()
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
  await expect(field).toHaveValue('')
})

test('simple: the loupe is a small button until you ask for it', async ({ page }) => {
  await openNotes(page)

  await expect(page.locator('.cercle-notes__search.searchfield')).toHaveCount(0)
  const loupe = page.locator('.searchfield__open')
  await expect(loupe).toBeVisible()

  await loupe.click()
  const field = page.locator('.searchfield__input')
  await expect(field).toBeVisible()
  await field.fill('couture')
  await expect(page.locator('.cnote', { hasText: 'Couture' })).toBeVisible()
  await field.fill('zzzz')
  await expect(page.locator('.cnote')).toHaveCount(0)

  // The ✕ clears AND folds it back to the loupe (advanced keeps the field open).
  await page.locator('.searchfield__clear').click()
  await expect(page.locator('.cercle-notes__search.searchfield')).toHaveCount(0)
  await expect(loupe).toBeVisible()
})

test('the toggle brings the old face back — header, roomy rows, mic, rich-editor door', async ({ page }) => {
  await openNotes(page)

  await page.locator('.notes-mode').click()
  await expect(page.locator('.cercle-notes--advanced')).toBeVisible()
  await expect(page.locator('.cercle-notes__head')).toBeVisible()
  await expect(page.locator('.cnote-list--compact')).toHaveCount(0)
  // The roomy row's own furniture is back…
  await expect(page.locator('.cnote').first().locator('.cnote__chip')).toBeVisible()
  // …the composer carries the mic + 📎 again…
  await expect(page.locator('.cercle-notes__composer button').first()).toBeVisible()
  // …and « Nouvelle note » opens the rich editor (with its title field + BETA chip).
  await page.locator('.cercle-notes__new').click()
  await expect(page.locator('.note-editor')).toBeVisible()
  await expect(page.locator('.note-editor__title')).toBeVisible()
  await expect(page.locator('.note-editor__toggle')).toBeVisible()
})

test('simple: the rich editor drops the title field and the BETA chip', async ({ page }) => {
  await openNotes(page)

  // The row pencil is the editor door in simple mode.
  await page.locator('.cnote', { hasText: 'Couture' }).locator('.cnote__act').first().click()
  await expect(page.locator('.note-editor')).toBeVisible()
  await expect(page.locator('.note-editor__title')).toHaveCount(0)
  await expect(page.locator('.note-editor__toggle')).toHaveCount(0)
  // The stored title folded into the body's first line — iOS style, nothing lost.
  await expect(page.locator('.note-editor__body')).toContainText('Couture')
  await expect(page.locator('.note-editor__body')).toContainText('short en twill')
})

test('the mode toggle is device-local — a read-only guest may flip it', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 })
  await mockApi(page, { signedIn: false })
  await page.route('**/api/guest/whoami**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'showcase' }) }),
  )
  await page.route('**/api/family-notes**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes: [NOTE] }) })
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
  await page.goto('/notes')
  await expect(page.locator('.cercle-notes')).toBeVisible()

  // No composer, no row actions (those ARE household writes)…
  await expect(page.locator('.cercle-notes__composer')).toHaveCount(0)
  await expect(page.locator('.cnote__act')).toHaveCount(0)
  // …but the presentation flag is this browser's localStorage, not the household's.
  await page.locator('.notes-mode').click()
  await expect(page.locator('.cercle-notes--advanced')).toBeVisible()
})
