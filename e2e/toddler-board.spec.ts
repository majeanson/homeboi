import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, BOARD } from './mocks'

// The toddler board — the wall tablet's other face, and until now screenshot-only.
// A picture can't test what actually matters here, which is what a tap DOESN'T do.
//
// On the kid lens the board is **hear-first**: a chore, an event, a meal is a tile
// you tap to have read to you, and that is all. None of them carries an `onTap`, so
// none of them can be checked off from here — a pre-reader's finger wanders across a
// wall tablet all day, and a board where touching « Sortir les poubelles » ticked it
// would quietly corrupt the household's day. (The two-tap arm exists for the few
// tiles that DO commit — the défi, the routine filmstrip — and is covered where those
// live; on the board the guarantee is stronger: no write at all.)
//
// Also covered: the « Rien de prévu » all-clear, which is deliberately a WIDER check
// than the parent board's `dayClear` (boardModel: weather/notes/tomorrow count for
// the kid lens, decided in bmad/10) — so an empty day still reads as intentional to
// someone who can't read the empty sections.

async function kidBoard(page: Page, opts: Parameters<typeof mockApi>[1] = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, opts)
  await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', calm: true })
  await page.goto('/board')
  await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
}

test('the toddler board renders picture tiles, not the parent bento', async ({ page }) => {
  await kidBoard(page)
  await expect(page.locator('.bigtile').first()).toBeVisible()
  // The control: without this the assertions below could pass against a parent
  // surface that simply has no `.bigtile` to click.
  await expect(page.locator('.today-kid__section').first()).toBeVisible()
  await expect(page.locator('.wg-slot')).toHaveCount(0)
})

test('tapping a tile reads it aloud and writes nothing — the board is hear-first', async ({ page }) => {
  await kidBoard(page)

  // Any /api/* write at all would be a bug here, so watch for the method, not a path.
  const writes: string[] = []
  page.on('request', (r) => {
    if (r.method() !== 'GET' && new URL(r.url()).pathname.startsWith('/api/')) writes.push(r.url())
  })

  const chore = page.locator('.bigtile', { hasText: 'Sortir les poubelles' })
  await expect(chore).toBeVisible()
  await chore.click()
  // The tap registers visibly even when the device has no FR-CA voice installed —
  // otherwise a child taps and nothing at all happens.
  await expect(chore).toHaveClass(/is-speaking/)

  // Tap again: still nothing committed. A read-aloud tile never arms, so a second
  // touch can't become a confirmation by accident.
  await chore.click()
  await expect(chore).not.toHaveClass(/is-armed/)
  await page.waitForTimeout(300)
  expect(writes, 'the toddler board must not write from a tile tap').toEqual([])
  // …and the chore is still not marked done.
  await expect(chore).not.toHaveClass(/is-done/)
})

test('an empty day says « Rien de prévu » instead of leaving a blank wall', async ({ page }) => {
  // Two things `fresh` alone doesn't clear, and the kid all-clear counts both — which
  // is exactly the point of it being a WIDER check than the parent's `dayClear`:
  //   • the sky — `weather` is FRESH_EXEMPT (a new household still has weather);
  //   • the suppers — `fresh` empties arrays, and `tonight`/`tomorrowMeal` are objects
  //     (see the note in mocks.ts), so they have to be nulled explicitly.
  await kidBoard(page, {
    fresh: true,
    overrides: {
      weather: { weather: null, tomorrow: null, hours: [] },
      board: { ...BOARD, tonight: null, tomorrowMeal: null, dayNote: null, tomorrowNote: null },
    },
  })

  const clear = page.locator('.today-kid__clear')
  await expect(clear).toBeVisible()
  await expect(clear).toContainText('Rien de prévu')
  // Tap-to-hear, like everything else on this lens: the audience can't read it.
  await expect(clear).toHaveJSProperty('tagName', 'BUTTON')
  await expect(page.locator('.bigtile')).toHaveCount(0)
})

test('the weather stays on an otherwise empty day — and then it is NOT all-clear', async ({ page }) => {
  // The other side of that same wider check: rain tomorrow is something to tell a
  // pre-reader about, so the all-clear line must not claim the day is empty.
  await kidBoard(page, { fresh: true })
  await expect(page.locator('.today-kid__clear')).toHaveCount(0)
  await expect(page.locator('.today-hero--weather')).toBeVisible()
})
