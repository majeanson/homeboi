import { test, expect } from '@playwright/test'
import { BASE, mockApi, seedState } from './mocks'

// The B-11 lazy-CSS trap, for the third time (after b215d4e's note checkboxes): the
// full-screen NoteEditor's `.note-editor*` rules lived in styles/cercle.css, which only
// the Le cercle routes import — but the board's « Notes (cercle) » card opens the SAME
// editor from its row pencil. On a session that never visited Le cercle the portal
// therefore rendered with no matching rule at all: static flow instead of a fixed
// full-screen overlay, while useModal still scroll-locked the page — the board read as
// frozen with the editor spilled inline underneath it.
//
// This spec deliberately lives apart from note-editor.spec.ts (whose stripped /api/cercle
// stub can't render a board) and never navigates to /cercle: visiting it once loads the
// lazy chunk and hides the very bug being guarded.

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

test('the note editor opens as a full-screen dialog from the board, with Le cercle never visited', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 })
  await mockApi(page)
  await page.route('**/api/family-notes**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes: [NOTE] }) })
  })
  // `cercleNotes` defaults to a HALF card, which renders as a compact tile (CardMini) on a
  // narrow grid — the rows, and so the pencil, only exist at full width.
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', cardPrefs: { size: { cercleNotes: 'full' } } })

  await page.goto('/board')
  await page.locator('.cnote__act').first().click() // the row pencil → NoteEditor

  // The class carries ALL of the editor's modality (fixed / inset:0 / z-index / paper
  // background), so a computed `position: fixed` is exactly the assertion that the
  // stylesheet defining it actually shipped on this route.
  const editor = page.locator('.note-editor')
  await expect(editor).toBeVisible()
  await expect(editor).toHaveCSS('position', 'fixed')
  const box = await editor.boundingBox()
  expect(box?.width).toBeGreaterThan(700) // spans the viewport, not an inline block
})
