import { test, expect, type Page } from '@playwright/test'
import { BASE, mockApi, seedState } from './mocks'

// « Les notes » wears two faces, one device flag (src/lib/notesMode):
//
//   SIMPLE (the default) — a READING page, maximum note per pixel. No section
//     title/subtitle, a small face chip, a COLLAPSED loupe, an icon-only ⚙ mode
//     button, and one plain text box where Enter writes the note (no mic, no 📎, no
//     « Ajouter » button — those live in the ＋ FAB's composer). The rows are the
//     board card's compact ones carrying NO pencil/trash either, spending the width
//     and height that frees on three wrapped lines of the note itself.
//   AVANCÉ — the ACTING face, and what the tab used to be: roomy rows with grip +
//     scope chip + pencil/trash, mic + attachment inline, « Nouvelle note » into the
//     rich editor. NOT a header: neither face carries a section title/subtitle.
//
// This guards the default face doesn't quietly grow its furniture back, and that the
// ⚙ really returns every door it drops.

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

test('simple (default): no section header, and rows carrying nothing but the note', async ({ page }) => {
  await openNotes(page)

  // The header block is gone — the hub header above already says « Les notes ».
  await expect(page.locator('.cercle-notes__head')).toHaveCount(0)
  await expect(page.getByText('Notes & recommandations')).toHaveCount(0)
  await expect(page.locator('.cercle-notes--lean')).toBeVisible()

  const row = page.locator('.cnote-list--compact .cnote', { hasText: 'Couture' })
  await expect(row).toBeVisible()
  // EVERY piece of row furniture is gone — grip, tint dot, scope chip, pencil, trash.
  await expect(row.locator('.cnote__grip')).toHaveCount(0)
  await expect(row.locator('.cnote__chip')).toHaveCount(0)
  await expect(row.locator('.cnote__dot')).toHaveCount(0)
  await expect(row.locator('.cnote__act')).toHaveCount(0)

  // The room that frees goes to the note: the preview WRAPS now (it used to be one
  // clipped line), so a row shows several lines of what the note actually says.
  await expect(row.locator('.cnote__meta')).toHaveCSS('white-space', 'normal')

  // The mode button carries no word — just the ⚙, named for what the next tap does.
  const mode = page.locator('.notes-mode')
  await expect(mode).toHaveText('')
  await expect(mode).toHaveAttribute('aria-pressed', 'false')
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

test('the ⚙ opens Avancé WITHOUT stealing the caret into the search', async ({ page }) => {
  await openNotes(page)

  await page.locator('.notes-mode').click()
  await expect(page.locator('.cercle-notes--advanced')).toBeVisible()

  // Avancé swaps the collapsed loupe for the always-open field. That expansion must
  // NOT focus it: the ⚙ is a "show me the tools" tap, and landing the caret there
  // pops the keyboard over a page nobody asked to type on. The field is present and
  // usable — just not focused. (SearchField keys its focus to the loupe TAP, never
  // to becoming expanded.)
  const field = page.locator('.cercle-notes__search .searchfield__input')
  await expect(field).toBeVisible()
  await expect(field).not.toBeFocused()
  // …and the ⚙ itself keeps the focus it was given by the click.
  await expect(page.locator('.notes-mode')).toBeFocused()
})

test('the ⚙ brings the ACTING face back — row actions, mic, rich editor', async ({ page }) => {
  await openNotes(page)

  await page.locator('.notes-mode').click()
  await expect(page.locator('.cercle-notes--advanced')).toBeVisible()
  await expect(page.locator('.notes-mode')).toHaveAttribute('aria-pressed', 'true')
  // Still no section header — the ⚙ brings back tools, not a second page title.
  await expect(page.locator('.cercle-notes__head')).toHaveCount(0)
  await expect(page.locator('.cnote-list--compact')).toHaveCount(0)
  // The roomy row's own furniture is back — the scope chip, and the pencil/trash the
  // lean face deliberately doesn't carry (this toggle IS how you reach them).
  const row = page.locator('.cnote', { hasText: 'Couture' })
  await expect(row.locator('.cnote__chip')).toBeVisible()
  await expect(row.locator('.cnote__act')).toHaveCount(2)
  // …the composer carries the mic + 📎 again…
  await expect(page.locator('.cercle-notes__composer button').first()).toBeVisible()
  // …and the row pencil opens the rich editor, title field + BETA chip included.
  await row.locator('.cnote__act').first().click()
  await expect(page.locator('.note-editor')).toBeVisible()
  await expect(page.locator('.note-editor__title')).toBeVisible()
  await expect(page.locator('.note-editor__toggle')).toBeVisible()
})

test('simple: the rich editor drops the title field and the BETA chip', async ({ page }) => {
  await openNotes(page)

  // Simple mode has no pencil — /notes?add=1 is its one editor door (a NEW note).
  await page.goto('/notes?add=1')
  await expect(page.locator('.note-editor')).toBeVisible()
  await expect(page.locator('.note-editor__title')).toHaveCount(0)
  await expect(page.locator('.note-editor__toggle')).toHaveCount(0)
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

  // No composer, and no row actions even after the flip (those ARE household writes)…
  await expect(page.locator('.cercle-notes__composer')).toHaveCount(0)
  await expect(page.locator('.cnote__act')).toHaveCount(0)
  // …but the presentation flag is this browser's localStorage, not the household's.
  await page.locator('.notes-mode').click()
  await expect(page.locator('.cercle-notes--advanced')).toBeVisible()
  await expect(page.locator('.cnote__act')).toHaveCount(0)
})

// A run of the same day says its date ONCE. Notes arrive in bursts, so the identical
// « mar. 14 nov. · » was leading every row and pushing each preview onto a second
// line — on the page whose whole brief is maximum note per pixel (LEAN.md pattern 6).
// The date still prints when the day CHANGES, which is where it carried information,
// and an expanded row always states its own full moment (it's a detail view).
test('the date leads a day, not every row', async ({ page }) => {
  const DAY = 1_700_000_000
  const note = (id: string, title: string, at: number) => ({
    ...NOTE,
    id,
    title,
    text: `corps de ${title}`,
    created_at: at,
    updated_at: at,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route('**/api/family-notes**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      // two the same day, then one two days earlier
      body: JSON.stringify({ notes: [note('a', 'Un', DAY), note('b', 'Deux', DAY), note('c', 'Trois', DAY - 2 * 86_400)] }),
    })
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/notes')
  await expect(page.locator('.cercle-notes')).toBeVisible()

  const metas = page.locator('.cnote__meta')
  const first = (await metas.nth(0).textContent()) ?? ''
  const second = (await metas.nth(1).textContent()) ?? ''
  const third = (await metas.nth(2).textContent()) ?? ''

  // Row 1 opens the day; row 2 repeats neither the date nor a dangling separator.
  expect(first).toMatch(/nov\./)
  expect(second).not.toMatch(/nov\./)
  expect(second.trim().startsWith('·')).toBe(false)
  // Row 3 is a different day — the date comes back.
  expect(third).toMatch(/nov\./)
  expect(third).not.toBe(second)
})
