import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, BASE } from './mocks'

// The nav restructure (2026-08): the six hub tabs went from
// board/kitchen/liste/cercle/routines/settings to board/kitchen/liste/notes/
// maison/settings. « Le cercle » + Routines merged into ONE /maison tab
// (Routines · Famille · Social · Business · Carnets, Routines the default
// section); « Le cercle »'s family-notes board split out into its own /notes
// tab. This spec pins the query-preserving legacy redirects (router.tsx's
// LegacyHubRedirect) and the toddler-lens split that the merge/split created —
// coverage the per-file specs (nav-tabs, interactions, cercle-visual, …) don't
// exercise end-to-end as a REDIRECT.

async function boot(page: Page, audience: 'parent' | 'toddler' = 'parent') {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience, lang: 'fr', calm: true, surface: 'mobile' })
}

test.describe('legacy hub redirects (query-preserving)', () => {
  test('/routines?plus=1 redirects to /maison and opens the ＋ sheet', async ({ page }) => {
    await boot(page)
    await page.goto('/routines?plus=1')
    await expect(page).toHaveURL(/\/maison/)
    await expect(page).not.toHaveURL(/plus=/) // consumed, not replayed on back/refresh
    // Maison's ＋ has more than one tile (routine-pick + the cercle add-set), so
    // '?plus=1' opens the blank chooser sheet, not a single form.
    await expect(page.locator('.sheet.show')).toBeVisible()
    await expect(page.locator('.sheet.show .cat-grid')).toBeVisible()
  })

  test('/cercle?section=notes&item=<id> redirects to /notes?item=<id> and focuses the note', async ({ page }) => {
    const NOTE = {
      id: 'nr1',
      member_id: null,
      author_member_id: null,
      title: 'Recommandation',
      text: 'Plombier de mamie',
      media_kind: null,
      media_key: null,
      scene_key: null,
      created_at: BASE,
      updated_at: BASE,
    }
    await boot(page)
    await page.route('**/api/family-notes**', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes: [NOTE] }) })
    })
    await page.goto('/cercle?section=notes&item=nr1')
    await expect(page).toHaveURL(/\/notes/)
    await expect(page).not.toHaveURL(/section=notes/) // the stray `view`/`section` params are dropped
    await expect(page).not.toHaveURL(/item=/) // consumed by Notes.tsx's own one-shot door
    await expect(page.locator('.cnote.is-focus')).toBeVisible()
  })

  test('/cercle?add=business&import=<url> redirects to /maison with the business form open, import pre-filled', async ({ page }) => {
    const MAPS_URL = 'https://maps.app.goo.gl/hCpMvxRRDUhwLCPi9?g_st=ic'
    await boot(page)
    await page.route('**/api/place-import**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ name: 'Garage Roy', address: '1 rue Principale', category: 'Garage', photoKey: null, lat: null, lng: null, mapUrl: MAPS_URL, empty: false }),
      })
    })
    const importReq = page.waitForRequest((r) => r.url().includes('/api/place-import') && r.method() === 'POST')
    await page.goto(`/cercle?add=business&import=${encodeURIComponent(MAPS_URL)}`)
    await expect(page).toHaveURL(/\/maison/)
    await expect(page).not.toHaveURL(/add=|import=/) // stripped by Maison's own one-shot door
    await importReq
    const form = page.locator('.kit-modal .operator__inline-form')
    await expect(form).toBeVisible()
    await expect(form.getByRole('textbox', { name: 'Nom' })).toHaveValue('Garage Roy')
  })

  test('bare /cercle redirects to /maison?section=family (the old cercle default)', async ({ page }) => {
    await boot(page)
    await page.goto('/cercle')
    await expect(page).toHaveURL(/\/maison\?section=family$/)
    // Scoped to the section pill row (data-tour="maison-sections") — Famille also
    // renders its own Liste/Liens/Arbre view switch, a second `.subtabs__opt` row.
    await expect(page.locator('[data-tour="maison-sections"] .subtabs__opt[aria-selected="true"]')).toHaveText(/Famille/)
  })

  test('/kid redirects to /maison, landing a toddler on the routine picture-story picker', async ({ page }) => {
    await boot(page, 'toddler')
    await page.goto('/kid')
    await expect(page).toHaveURL(/\/maison$/)
    await expect(page.locator('.kid__faces')).toBeVisible()
  })
})

test.describe('toddler lens split (Maison vs Les notes)', () => {
  test('toddler /notes is the hear-first read-only list — no composer, no « Nouvelle note »', async ({ page }) => {
    const NOTE = {
      id: 'nk1',
      member_id: null,
      author_member_id: null,
      title: 'Liste d’épicerie de mamie',
      text: 'Pain, lait, oeufs',
      media_kind: null,
      media_key: null,
      scene_key: null,
      created_at: BASE,
      updated_at: BASE,
    }
    await boot(page, 'toddler')
    await page.route('**/api/family-notes**', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes: [NOTE] }) })
    })
    await page.goto('/notes')
    await expect(page.locator('.cercle-kid__grid')).toBeVisible()
    await expect(page.getByText('Liste d’épicerie de mamie')).toBeVisible()
    await expect(page.locator('.note-editor')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Nouvelle note' })).toHaveCount(0)
    await expect(page.locator('.add-fab')).toHaveCount(0) // toddler lens never gets the ＋
  })

  test('toddler /maison (default section) is the kid routine picture-story view', async ({ page }) => {
    await boot(page, 'toddler')
    await page.goto('/maison')
    await expect(page.locator('.kid__faces')).toBeVisible()
    await expect(page.locator('.cercle-kid__grid')).toHaveCount(0)
  })

  test('toddler /maison?section=family is the circle kid faces grid', async ({ page }) => {
    await boot(page, 'toddler')
    await page.goto('/maison?section=family')
    await expect(page.locator('.cercle-kid__grid')).toBeVisible()
    await expect(page.locator('.kid__faces')).toHaveCount(0)
  })
})

test('the ＋ on /notes opens a blank note directly — no sheet, no chooser', async ({ page }) => {
  // /notes carries a single add-mode ('cnote'), but it's in FORM_ROUTES (2026-09-04:
  // iOS-Notes style) — so a tap NAVIGATES to /notes?add=1 and opens the full-screen
  // NoteEditor, never the sheet. Holding the ＋ still opens the quick voice/text/📎
  // composer (VOICE_MODES, see fab-hold-voice.spec.ts) — that door didn't move.
  await boot(page)
  await page.goto('/notes')
  await page.locator('.add-fab').click()
  await expect(page.locator('.sheet.show')).toHaveCount(0)
  const editor = page.locator('.note-editor')
  await expect(editor).toBeVisible()
  await expect(editor.locator('.note-editor__title')).toHaveCount(0) // no title field, ever
  await expect(editor.locator('.note-editor__toggle')).toHaveCount(0) // no BETA chip, ever

  // Closing (back arrow) auto-saves what was typed — no Cancel, iOS-Notes style.
  await editor.locator('.note-tiptap').click()
  await page.keyboard.type('Rapport de la piscine')
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/api/family-notes') && r.method() === 'POST'),
    page.locator('.note-editor__back').click(),
  ])
  const posted = JSON.parse(req.postData() || '{}')
  expect(posted.text).toBe('Rapport de la piscine')
  expect(posted.title).toBe('') // derived from the first line, never stored
  await expect(page.locator('.note-editor')).toHaveCount(0)
})

test('/notes?add=1 still opens the rich editor — every time, not just once', async ({ page }) => {
  // The rich-editor door survives as a URL (a stray deep-link out in the wild), and
  // it's what the ＋ FAB itself now navigates to on every tap.
  await boot(page)
  await page.goto('/notes?add=1')
  await expect(page.locator('.note-editor')).toBeVisible()
  await expect(page).not.toHaveURL(/add=/) // the one-shot door strips it once opened

  // The regression this guards: asking again while ALREADY on /notes is a same-route
  // navigation, so the page never remounts. The door used to be read once at mount
  // (a lazy `useState` initializer), which made it work on a fresh arrival and then
  // go silently dead for the rest of the session. It's a bumped nonce now.
  await page.locator('.note-editor__back').click()
  await expect(page.locator('.note-editor')).toHaveCount(0)
  await page.goto('/notes?add=1')
  await expect(page.locator('.note-editor')).toBeVisible()
})
