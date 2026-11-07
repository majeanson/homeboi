import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'
import { APP, settle, expectApi } from './interact'

// Interaction coverage, the board: faces, chores, fridge notes, toddler habits. The harness and its discipline are at the top of interact.ts:
// a form asserts the request it fires, an optimistic flow asserts what the user sees.

test.describe('profile', () => {
  test('picking a face greets you on the board', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    await page.locator('.profile-chip').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    await page.locator('.profile-face', { hasText: 'Maman' }).click()
    await expect(page.locator('.greet')).toContainText('Maman')
  })

  test('the shared list shows who added an item', async ({ page }) => {
    await APP('/liste')(page)
    await settle(page, '.today-feed')
    // l1 (Lait) is seeded added_by m1 (Maman, #B06A93) → since the compact-rows
    // pass, "who" is the TITLE's tint (tintInk inlines the member hex), not an
    // avatar disc.
    const title = page.locator('.list-row', { hasText: 'Lait' }).locator('.title')
    await expect(title).toHaveAttribute('style', /#B06A93/i)
  })

  test('kiosk switcher flips between a member and Maisonnée', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })
    await page.goto('/board')
    await settle(page, '.hub')
    await expect(page.locator('.mswitch')).toBeVisible()
    await page.locator('.mswitch__opt', { hasText: 'Papa' }).click()
    await expect(page.locator('.greet')).toContainText('Papa')
    await page.locator('.mswitch__opt', { hasText: 'Maisonnée' }).click()
    await expect(page.locator('.greet')).not.toContainText('Papa')
  })
})

test.describe('recurring chores on the board', () => {
  test('a chore due today shows in Aujourd\'hui and checks off (PATCH complete)', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    const chore = page.locator('.act', { hasText: 'Sortir les poubelles' })
    await expect(chore).toBeVisible()
    await expect(chore).toContainText('Léa') // whose turn
    // The row is split now (body peeks the detail, the check disc ticks) — click the check.
    await expectApi(page, 'PATCH', 'chores', () => chore.locator('.act__checkbtn').click())
  })

  test('an upcoming chore shows under À venir with its day', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    await expect(page.locator('.act', { hasText: 'Vaisselle' })).toBeVisible()
  })

  test('a task can be given a weekly schedule in its own scene (PATCH recur)', async ({ page }) => {
    // Tasks left Réglages: the peek's « Modifier » opens /chore/:id, one editor with the
    // RecurPicker, the same form that creates one.
    await APP('/chore/c1')(page)
    const form = page.locator('.scene .operator__chore-form')
    await form.locator('.recur select').selectOption('weekly')
    await expectApi(page, 'PATCH', 'chores', () =>
      form.getByRole('button', { name: 'Enregistrer' }).click(),
    )
  })
})

test.describe('fridge notes', () => {
  test('a note shows on the board and clears with a tap (DELETE)', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    const note = page.locator('.note-card', { hasText: 'examen' })
    await expect(note).toBeVisible()
    // The paper is a card since 0142 (its « Garder » badge can't sit inside a button); the
    // tap that takes it down is its own target.
    await expectApi(page, 'DELETE', 'notes', () => note.locator('.note-card__tap').click())
    await expect(note).toHaveCount(0) // optimistically removed
  })

  test('toddler sees the note too (read-aloud, not cleared)', async ({ page }) => {
    await APP('/board', 'toddler')(page)
    await settle(page, '.kid__main')
    await expect(page.locator('.notes--kid .note-card', { hasText: 'examen' })).toBeVisible()
  })

  // Tidy seam #1: « Tout effacer » empties the whole strip as ONE undoable action —
  // the notes hide at once, the writes wait behind the single undo toast, and
  // « Annuler » brings every note back (nothing was deleted server-side yet).
  test('« Tout retirer » batch-dismisses the strip behind one undo toast', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    // Scope to the fridge-notes strip — the DAY note (DayNote, .notes.day-note)
    // wears .note-card too but is read-only and must survive the sweep.
    const notes = page.locator('.notes:not(.day-note) .note-card')
    await expect(notes).toHaveCount(2)
    await page.getByRole('button', { name: 'Tout retirer' }).click()
    await expect(notes).toHaveCount(0)
    await expect(page.locator('.undo-toast')).toBeVisible()
    await page.locator('.undo-toast__btn').click()
    await expect(notes).toHaveCount(2)
  })
})

// F6 × D8 (Wave T): the toddler board now folds « Mes habitudes » in as read-aloud
// tiles, so a pre-reader hears what today is still asking (« brosse tes dents »).
test('toddler board shows « Mes habitudes » due today, read-aloud not marked', async ({ page }) => {
  await APP('/board', 'toddler')(page)
  await settle(page, '.kid__main')
  // « Bouger un peu » is an every-day 'hours' household habit — due today under any
  // clock — so it surfaces as a picture-first hear-first tile (no frozen clock needed).
  const tile = page.locator('.today-kid__section .bigtile', { hasText: 'Bouger un peu' })
  await expect(tile).toBeVisible()
  // Reading is a nicety, not a mark: a tap on a habit tile must NOT fire a habits write
  // (a parent still marks it in « Le point du jour »).
  let wrote = false
  page.on('request', (r) => {
    if (r.method() !== 'GET' && new URL(r.url()).pathname.endsWith('/api/habits')) wrote = true
  })
  await tile.click()
  await expect(tile).toBeVisible()
  expect(wrote).toBe(false)
})
