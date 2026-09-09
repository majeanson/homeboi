import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, MMID } from './mocks'

// The toddler lens on La cuisine — the other half of the wall tablet's kid face, and
// screenshot-only until now. `toddler-board.spec.ts` covers the board's guarantee
// (hear-first, no tap can write at all). The kitchen is the surface where a child CAN
// commit something, so its guarantees are different and need their own guard:
//
//   · a child's pick is an IDEA (POST meal-ideas), never a plan — nothing may ever
//     reach /api/meals from here, or a pre-reader's finger rewrites the household's week
//   · one tap never commits: every acting tile arms first, and only the second tap fires
//   · a day that already has a supper is TAKEN — greyed, and it stays read-only
//   · a read-only guest keeps the week (reading is fine) and loses the pick shelf
//
// THE CLOCK IS FROZEN, same reason as the toddler board: the week here is "the next 7
// days" off the real date, and which day cells are empty is what these tests point at.
// Frozen to the fixture's own anchor (a Sunday), today and tomorrow carry a supper and
// the rest of the week is free.
async function kidKitchen(page: Page, opts: Parameters<typeof mockApi>[1] = {}) {
  await page.clock.setFixedTime(new Date((MMID + 12 * 3600) * 1000))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, opts)
  await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', calm: true })
  await page.goto('/kitchen')
  await page.locator('.kid__main').waitFor({ state: 'visible', timeout: 15_000 })
}

// Every non-GET /api/* call the page makes, watched by METHOD rather than by path —
// the point is that nothing unexpected is written, so an allow-list would be the wrong
// shape here.
function watchWrites(page: Page): { method: string; path: string; body: string }[] {
  const writes: { method: string; path: string; body: string }[] = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (r.method() !== 'GET' && u.pathname.startsWith('/api/')) {
      writes.push({ method: r.method(), path: u.pathname.replace('/api/', ''), body: r.postData() || '' })
    }
  })
  return writes
}

// « Quel jour ? » — the SECOND step of the pick. Both steps are a `.kid-pick`
// section; only the day chooser carries the « ← Retour » door, so that is what tells
// them apart (asserting on `.kid-pick` alone silently matches the shelf too).
const dayStep = (page: Page) => page.locator('.kid-pick:has(.kid-pick__back)')

// BigTiles arms on the first tap and commits on the second (« tape encore »). Both
// taps are the product behaviour, so the helper is deliberately not called "click".
async function tapTwice(tile: ReturnType<Page['locator']>) {
  await tile.click()
  await expect(tile).toHaveClass(/is-armed/)
  await tile.click()
}

test('the kid lens replaces the parent kitchen, week first', async ({ page }) => {
  await kidKitchen(page)
  // The control: without this, every assertion below could pass on a surface that
  // simply has no tiles to tap.
  await expect(page.locator('.bigtile').first()).toBeVisible()
  // …and it is the KID surface: the parent kitchen's sub-tab row is not rendered.
  await expect(page.locator('.subtabs')).toHaveCount(0)
  // Today's planned supper is on it, named.
  await expect(page.locator('.bigtile', { hasText: 'Spaghetti maison' }).first()).toBeVisible()
})

test('a child’s pick is an IDEA, never a plan — meal-ideas is written, meals is not', async ({ page }) => {
  await kidKitchen(page)
  const writes = watchWrites(page)

  // Pick a recipe off the shelf, then a free day for it.
  await tapTwice(page.locator('.bigtile', { hasText: 'Tacos au poulet' }).first())
  await expect(dayStep(page)).toBeVisible()
  const freeDay = dayStep(page).locator('.bigtile:not(.is-done)').first()
  await tapTwice(freeDay)

  await expect.poll(() => writes.length, { timeout: 5000 }).toBeGreaterThan(0)
  expect(writes.map((w) => w.path)).toEqual(['meal-ideas'])
  const body = JSON.parse(writes[0].body || '{}')
  expect(body).toMatchObject({ title: 'Tacos au poulet', recipeId: 'rc2' })
  expect(typeof body.date, 'the idea carries the day the child chose').toBe('number')
  // The pick closes itself, so a wandering finger can't fire it twice.
  await expect(dayStep(page)).toHaveCount(0)
})

test('one tap never commits — the tile arms and waits', async ({ page }) => {
  await kidKitchen(page)
  const writes = watchWrites(page)

  const recipe = page.locator('.bigtile', { hasText: 'Tacos au poulet' }).first()
  await recipe.click()
  await expect(recipe).toHaveClass(/is-armed/)
  // A single tap opened nothing and wrote nothing: it only read the tile aloud.
  await expect(dayStep(page)).toHaveCount(0)
  expect(writes).toEqual([])
})

test('a day that already has a supper is taken — tapping it writes nothing', async ({ page }) => {
  await kidKitchen(page)
  const writes = watchWrites(page)

  await tapTwice(page.locator('.bigtile', { hasText: 'Tacos au poulet' }).first())
  const taken = dayStep(page).locator('.bigtile.is-done').first()
  // Today's supper is planned, so the week always has at least one taken day.
  await expect(taken).toBeVisible()
  await taken.click()
  await taken.click()
  // It never arms (no onTap), and nothing is written over the plan that exists.
  await expect(taken).not.toHaveClass(/is-armed/)
  expect(writes).toEqual([])
})

test('a read-only guest still hears the week, but is offered no pick', async ({ page }) => {
  await kidKitchen(page)
  await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
  await page.goto('/kitchen')
  await page.locator('.kid__main').waitFor({ state: 'visible', timeout: 15_000 })

  // The week reads as before — a sitter's toddler can still hear what supper is.
  await expect(page.locator('.bigtile', { hasText: 'Spaghetti maison' }).first()).toBeVisible()
  // …and the shelf that commits a suggestion is not there at all.
  await expect(page.locator('.bigtile', { hasText: 'Tacos au poulet' })).toHaveCount(0)
})
