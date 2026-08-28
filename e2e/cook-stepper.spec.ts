import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Cook mode's STEPPER — one step on screen at a time, with ← / → and a "3 / 5"
// counter. It had a screenshot and a timer-chip test but no navigation coverage,
// which is the half that can silently break: `idx` is clamped at both ends and the
// arrows disable off `atFirst`/`atLast`, so an off-by-one shows up as a dead arrow
// or a step you can walk past, neither of which a screenshot catches.
//
// The other half asserted here is the audience contract (memory: cook mode, toddler
// LOCKED to the stepper): a parent gets the « Affichage » switcher and can leave the
// stepper for a scroll view; a toddler must not — a pre-reader dropped into the full
// ingredient wall has no way back, and there is no in-app escape from the kid lens.
//
// rc1 « Spaghetti maison » has 3 steps, so the stepper's stages are walkable end to
// end in one test without depending on how many intro/ingredient stages precede them.

async function openCook(page: Page, audience: 'parent' | 'toddler') {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience, lang: 'fr', surface: 'mobile' })
  await page.goto('/kitchen/recipe/rc1/cook')
  await expect(page.locator('.cook')).toBeVisible()
}

// "2 / 6" → [2, 6]
async function counter(page: Page): Promise<[number, number]> {
  const text = (await page.locator('.cook__count').innerText()).trim()
  const [a, b] = text.split('/').map((s) => Number(s.trim()))
  return [a, b]
}

test('the toddler stepper walks forward and back, and the counter follows', async ({ page }) => {
  await openCook(page, 'toddler')

  const nav = page.locator('.cook__nav')
  const prev = nav.locator('.cook__arrow').first()
  const next = nav.locator('.cook__arrow--next')
  await expect(nav).toBeVisible()

  // Opens on the first stage: nowhere behind, so ← is disabled rather than absent
  // (the control keeps its place — the row doesn't jump when it becomes usable).
  const [first, total] = await counter(page)
  expect(first).toBe(1)
  expect(total).toBeGreaterThan(1)
  await expect(prev).toBeDisabled()
  await expect(next).toBeEnabled()

  await next.click()
  expect((await counter(page))[0]).toBe(2)
  await expect(prev).toBeEnabled()

  await prev.click()
  expect((await counter(page))[0]).toBe(1)
  await expect(prev).toBeDisabled()
})

test('the stepper stops at the last stage instead of walking past it', async ({ page }) => {
  await openCook(page, 'toddler')
  const next = page.locator('.cook__arrow--next')
  const [, total] = await counter(page)

  // Walk to the end. One extra click at the end must change nothing — the clamp is
  // the thing under test (a bad Math.min shows up as a blank page, not an error).
  for (let i = 1; i < total; i++) await next.click()
  expect((await counter(page))[0]).toBe(total)
  await expect(next).toBeDisabled()

  await next.click({ force: true })
  expect((await counter(page))[0]).toBe(total)
  await expect(page.locator('.cook__step-n')).toBeVisible() // still rendering a real stage
})

test('arrow keys drive the stepper too — it is not touch-only', async ({ page }) => {
  // Standing rule: nothing may be reachable ONLY by a touch gesture. Cook mode
  // binds swipe AND ArrowLeft/ArrowRight; the keyboard path is the mirror.
  await openCook(page, 'toddler')
  expect((await counter(page))[0]).toBe(1)

  await page.keyboard.press('ArrowRight')
  expect((await counter(page))[0]).toBe(2)
  await page.keyboard.press('ArrowLeft')
  expect((await counter(page))[0]).toBe(1)
  // At the first stage ArrowLeft is a no-op, not an underflow.
  await page.keyboard.press('ArrowLeft')
  expect((await counter(page))[0]).toBe(1)
})

// The gear that opens layout / text-size / step-ingredient options. Targeted by its
// accessible name, not `.cook__autoread` — that class is worn by two different
// buttons in the bar (this one and the step-ingredients toggle).
const displayGear = (page: Page) => page.getByRole('button', { name: 'Affichage', exact: true })

test('a toddler is LOCKED to the stepper: no « Affichage » switcher to leave it with', async ({ page }) => {
  await openCook(page, 'toddler')
  // A pre-reader dropped into the full ingredient wall has no way back — and the
  // toddler lens has no in-app escape — so the view switcher must not exist at all.
  await expect(displayGear(page)).toHaveCount(0)
  // …and the stepper's own nav IS there, i.e. we really are locked in 'step' mode.
  await expect(page.locator('.cook__nav')).toBeVisible()
})

test('a parent gets the « Affichage » switcher and can leave the stepper for a scroll view', async ({ page }) => {
  await openCook(page, 'parent')

  const gear = displayGear(page)
  await expect(gear).toBeVisible() // the difference from the toddler lens
  await gear.click()
  await expect(gear).toHaveAttribute('aria-expanded', 'true')

  // Focus = the stepper. Land there first so the switch away is a real transition.
  await page.getByRole('button', { name: 'Focus', exact: true }).click()
  await expect(page.locator('.cook__nav')).toBeVisible()

  // Switching to a scroll layout retires the stepper furniture: no arrows, no
  // "n / total" — a scroll page's way out is the small ✕ in the bar instead.
  await page.getByRole('button', { name: 'Recette', exact: true }).click()
  await expect(page.locator('.cook__nav')).toHaveCount(0)
  await expect(page.locator('.cook__count')).toHaveCount(0)

  // …and back, so the switch isn't one-way.
  await page.getByRole('button', { name: 'Focus', exact: true }).click()
  await expect(page.locator('.cook__nav')).toBeVisible()
})

test('the ✕ closes cook mode and lands back on the recipe', async ({ page }) => {
  await openCook(page, 'toddler')
  await page.locator('.cook__bar').getByRole('button', { name: /fermer|close/i }).click()
  await expect(page.locator('.cook')).toHaveCount(0)
  await expect(page).not.toHaveURL(/\/cook$/)
})

// « Il en manque » mid-cook (bmad/11 tier-2 #10).
//
// You find out you're out of something with your hands in the bowl. The only doors
// were La cuisine ▸ Garde-manger and the ＋ sheet — both of which mean abandoning
// cook mode mid-step. This is the same pantry-low write those use: no new endpoint,
// no new noun, and emphatically not a quantity (the calm tenet).
test('a parent can flag an ingredient low without leaving the recipe', async ({ page }) => {
  const posted: Record<string, unknown>[] = []
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await page.route('**/api/pantry', async (route) => {
    if (route.request().method() === 'POST') {
      posted.push(route.request().postDataJSON())
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    }
    return route.fallback()
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/kitchen/recipe/rc1/cook')
  await expect(page.locator('.cook')).toBeVisible()

  // The scroll view is where the whole ingredient list lives (the stepper shows a
  // step's own ingredients); a parent can switch to it, a toddler cannot.
  await page.locator('.cook__autoread').first().click()
  const full = page.locator('.cook__view-opt', { hasText: /Tout/ })
  if (await full.count()) await full.first().click()

  const low = page.locator('.cook__ing-low').first()
  await expect(low).toBeVisible()
  await low.click()

  await expect.poll(() => posted.length, { timeout: 5000 }).toBe(1)
  // Only the NAME travels — « 250 ml de beurre » would be a recipe line on a
  // shopping reminder, not a thing you're out of.
  const item = String(posted[0].item ?? '')
  expect(item).toBeTruthy()
  expect(item).not.toMatch(/\d/)
  // It's a TOGGLE, not a one-way flag, and that isn't a preference: cook mode is a
  // full-screen scene at z-index 90 while the undo bar sits at 40, so an « Annuler »
  // offered from here would be painted UNDER the recipe — an undo nobody could tap.
  // Taking it back happens on the button itself.
  await expect(low).toHaveAttribute('aria-pressed', 'true')

  const deleted: Record<string, unknown>[] = []
  await page.route('**/api/pantry', async (route) => {
    const req = route.request()
    if (req.method() === 'DELETE') {
      deleted.push(req.postDataJSON())
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    }
    if (req.method() === 'GET') {
      // The un-flag has to LOOK the row up (POST answers { ok } with no id). Its
      // payload key is `low`, not `items` — which is exactly how this shipped
      // wrong the first time, silently, because nothing exercised the path.
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ low: [{ id: 'pl-new', item, marked_at: 1 }] }),
      })
    }
    return route.fallback()
  })

  await low.click()
  await expect.poll(() => deleted.length, { timeout: 5000 }).toBe(1)
  expect(deleted[0]).toMatchObject({ id: 'pl-new' })
  await expect(low).toHaveAttribute('aria-pressed', 'false')
})

test('a toddler never sees the flag-low control', async ({ page }) => {
  // The kid lens is hear-first and writes nothing — the same contract the toddler
  // board holds. A pre-reader must not be able to edit the household's pantry.
  await openCook(page, 'toddler')
  await expect(page.locator('.cook__ing-low')).toHaveCount(0)
})
