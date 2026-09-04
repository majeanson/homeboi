import { test, expect, type Page } from '@playwright/test'
import { BASE, mockApi, seedState } from './mocks'

// « Les notes » (2026-09-04): ONE face, iOS-Notes style — the old Simple/Avancé
// split (src/lib/notesMode, retired) is gone. No section title (the hub header
// already says « Les notes »), roomy rows (grip · tint dot · scope chip), a "..."
// on each, and a tap opens the note straight in the full-screen editor — there's
// no expand-in-place here any more, the editor IS the detail view. Creating a note
// is always the ＋ FAB (a blank editor on tap; the quick voice/text/📎 composer on
// a hold — see nav-restructure.spec.ts and fab-hold-voice.spec.ts). The board's own
// « Notes (cercle) » glance card is untouched — replaces notes-lean.spec.ts, which
// guarded the split this file no longer has.

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

async function openNotes(page: Page, notes: unknown[] = [NOTE], viewport = { width: 800, height: 1280 }) {
  await page.setViewportSize(viewport)
  await mockApi(page)
  await page.route('**/api/family-notes**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes }) })
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/notes')
  await expect(page.locator('.cercle-notes')).toBeVisible()
}

test('one face: no section header, roomy rows with a "..." — never the compact board face', async ({ page }) => {
  await openNotes(page)

  await expect(page.locator('.cercle-notes__head')).toHaveCount(0)
  await expect(page.getByText('Notes & recommandations')).toHaveCount(0)
  await expect(page.locator('.cnote-list--compact')).toHaveCount(0)

  const row = page.locator('.cnote-list .cnote', { hasText: 'Couture' })
  await expect(row).toBeVisible()
  await expect(row.locator('.cnote__chip')).toBeVisible()
  await expect(row.locator('.action-menu__btn')).toBeVisible()
})

test('tapping a note opens it straight in the editor — no expand in place', async ({ page }) => {
  await openNotes(page)

  const row = page.locator('.cnote-list .cnote', { hasText: 'Couture' })
  await row.locator('.cnote__main').click()

  const editor = page.locator('.note-editor')
  await expect(editor).toBeVisible()
  await expect(editor).toHaveAttribute('aria-label', 'Modifier la note')
  // No expand-in-place happened underneath — the row never grew a `.cnote__full`.
  await expect(row).not.toHaveClass(/cnote--expanded/)
})

test('"..." offers Supprimer — a deferred delete, no confirm dialog', async ({ page }) => {
  const deletes: string[] = []
  await page.setViewportSize({ width: 800, height: 1280 })
  await mockApi(page)
  await page.route('**/api/family-notes**', async (route) => {
    const m = route.request().method()
    if (m === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes: [NOTE] }) })
    if (m === 'DELETE') deletes.push(m)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/notes')
  await expect(page.locator('.cercle-notes')).toBeVisible()

  const row = page.locator('.cnote-list .cnote', { hasText: 'Couture' })
  await row.locator('.action-menu__btn').click()
  const panel = page.locator('.action-menu__panel')
  await expect(panel).toBeVisible()
  // Modifier isn't listed — the row tap already does that job.
  await expect(panel.getByText('Modifier', { exact: false })).toHaveCount(0)

  await panel.getByRole('menuitem', { name: 'Supprimer la note' }).click()
  await expect(row).toHaveCount(0) // held behind the undo toast, not in the live rows
  await expect(page.locator('.undo-toast')).toBeVisible()
  // Nothing sent yet — that's the whole point of a deferred delete
  // (useDeferredRemoval, see settings-delete-undo.spec.ts).
  expect(deletes).toEqual([])
})

test('the loupe stays a small button until asked for', async ({ page }) => {
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

  await page.locator('.searchfield__clear').click()
  await expect(page.locator('.cercle-notes__search.searchfield')).toHaveCount(0)
  await expect(loupe).toBeVisible()
})

test('the board glance card is unaffected — still expand-in-place, no "..." at all', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 })
  await mockApi(page)
  await page.route('**/api/family-notes**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes: [NOTE] }) })
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', cardPrefs: { size: { cercleNotes: 'full' } } })
  await page.goto('/board')

  const row = page.locator('.cnote-list--compact .cnote', { hasText: 'Couture' })
  await expect(row).toBeVisible()
  await expect(row.locator('.action-menu__btn')).toHaveCount(0)

  await row.locator('.cnote__main').click()
  await expect(row).toHaveClass(/cnote--expanded/)
  await expect(page.locator('.note-editor')).toHaveCount(0)
})

// A run of the same day says its date ONCE. Notes arrive in bursts, so the identical
// « mar. 14 nov. » was leading every row and pushing each preview onto a second
// line. The date still prints when the day CHANGES, which is where it carried
// information, and an expanded row (the board's glance card) always states its own
// full moment (it's a detail view there).
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
  await openNotes(page, [note('a', 'Un', DAY), note('b', 'Deux', DAY), note('c', 'Trois', DAY - 2 * 86_400)], { width: 390, height: 844 })

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

test('a read-only guest reads a note in place — the tap never opens the editor', async ({ page }) => {
  // `openOnTap` sends a tap straight into the full-screen rich editor, whose every
  // write a guest's session would only 403 at close — and whose auto-save-on-close
  // makes "just looking" indistinguishable from editing. A guest falls through to
  // the same expand-in-place read the board's glance card uses instead: the note is
  // still fully readable, it just isn't opened in a surface that can't save.
  await page.setViewportSize({ width: 800, height: 1280 })
  await mockApi(page, { signedIn: false })
  await page.route('**/api/guest/whoami**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'showcase' }) }),
  )
  await page.route('**/api/family-notes**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      // Two lines, so the row is `expandable` — a one-line note is entirely its own
      // title and has nothing left to expand.
      body: JSON.stringify({ notes: [{ ...NOTE, text: 'kit été rouge : short en twill\net la doublure beige' }] }),
    })
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
  await page.goto('/notes')
  await expect(page.locator('.cercle-notes')).toBeVisible()

  const row = page.locator('.cnote-list .cnote', { hasText: 'Couture' })
  const main = row.locator('.cnote__main')
  await expect(main).toHaveAttribute('aria-expanded', 'false') // the read toggle, not « Modifier »
  await main.click()
  await expect(page.locator('.note-editor')).toHaveCount(0)
  await expect(main).toHaveAttribute('aria-expanded', 'true')
  await expect(row).toContainText('doublure beige')
})
