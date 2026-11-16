import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// bmad/11 tier-2 #10: leftovers were unpostable from a recipe-backed meal. Tapping a
// planned dish ROUTES to /kitchen/recipe/:id, and that scene was the one surface with
// no door onto the Restants pool — you finished supper, tapped the dish, and had to
// walk back out to La cuisine to say there were leftovers.
//
// The door is « Il en reste ? » in the scene's ⋯ overflow (the same action the day
// editor and the board peek already offer, through the same shared hook).
test('a recipe posts its leftovers without leaving the scene', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const posted: Record<string, unknown>[] = []
  await mockApi(page)
  await page.route('**/api/meal-leftovers**', async (route) => {
    if (route.request().method() === 'POST') {
      posted.push(route.request().postDataJSON())
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'lo-new' }) })
    }
    return route.fallback()
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/kitchen')
  await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })

  await page.locator('.subtabs__opt').nth(2).click() // Recettes
  await page.locator('.recipe-card').first().click()
  await expect(page.locator('.recipe-modal')).toBeVisible()

  const overflow = page.locator('.recipe-modal .action-menu__btn')
  await overflow.click()
  const announce = page.getByRole('menuitem', { name: 'Il en reste ?' })
  await expect(announce).toBeVisible()
  await announce.click()

  // It carries the recipe link, so the pool row can open the recipe it came from.
  await expect.poll(() => posted.length).toBe(1)
  expect(posted[0]?.title).toBeTruthy()
  expect(posted[0]?.recipeId).toBeTruthy()
  // No meal behind a recipe opened straight from the book.
  expect(posted[0]!.sourceMealId).toBeNull()

  // NO undo toast from here, and that is deliberate, not an omission: .recipe-modal
  // is z-index 80 and .undo-toast is 40, so an « Annuler » offered from inside this
  // scene is painted UNDERNEATH it — the exact bug cook mode shipped and fixed on
  // 2026-08-27. If a later change re-adds one, this assertion is the alarm.
  await expect(page.locator('.undo-toast')).toBeHidden()

  // The label flip is the confirmation instead, and a second tap can't double-post.
  await overflow.click()
  await expect(page.getByRole('menuitem', { name: 'Dans les restants' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Dans les restants' })).toBeDisabled()
  expect(posted).toHaveLength(1)
})

// Audit 2026-11-15 (« Restants »). The board's meal peek offers « Créer des restants »
// through the same shared hook — but its four doors handed it `{ id, title }` alone, so
// the pool row lost the recipe the peek itself had just resolved (« Spaghetti maison »
// → rc1, by title, in the fixture): no 📖 on the row, a bare title once planned.
test('the board peek’s « Créer des restants » keeps the recipe the peek resolved', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const posted: Record<string, unknown>[] = []
  await mockApi(page)
  await page.route('**/api/meal-leftovers**', async (route) => {
    if (route.request().method() === 'POST') {
      posted.push(route.request().postDataJSON())
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'lo-new' }) })
    }
    return route.fallback()
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/board')
  await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })

  await page.locator('.now-card__meal').filter({ hasText: 'Spaghetti maison' }).first().click()
  const sheet = page.locator('.detail-sheet')
  await sheet.waitFor({ state: 'visible', timeout: 10_000 })
  // A recipe-linked peek folds the plan tail into its ⋯ (the menu portals to <body>).
  await sheet.locator('.action-menu__btn').click()
  await page.getByRole('menuitem', { name: 'Créer des restants' }).click()

  await expect.poll(() => posted.length).toBe(1)
  expect(posted[0]).toMatchObject({ title: 'Spaghetti maison', recipeId: 'rc1', sourceMealId: 'meal1' })
})

// Same audit: planning a pool leftover the server REFUSES still offered « Annuler », and
// that undo re-POSTs the pool row — so one tap put the (never-consumed) leftover in
// Restants twice. A refused plan says « Pas enregistré » and offers nothing to undo.
// (Worse: that undo toast took the bar over the failure notice, so the screen said
// « planifié » about a plan that never happened.)
test('a refused leftover plan offers no « Annuler » (it would duplicate the row)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  const posts: Record<string, unknown>[] = []
  await page.route('**/api/meal-leftovers**', async (route) => {
    const req = route.request()
    if (req.method() === 'POST') {
      posts.push(req.postDataJSON())
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Erreur serveur' }) })
    }
    if (req.method() === 'GET')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ leftovers: [{ id: 'lo1', title: 'Pâté chinois', recipe_id: null, source_meal_id: null, created_at: 0 }] }),
      })
    return route.fallback()
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/kitchen')
  await expect(page.locator('.kitchen__day').first()).toBeVisible({ timeout: 15_000 })

  const row = page.locator('.kitchen__ideas .kitchen__idea', { hasText: 'Pâté chinois' })
  await row.scrollIntoViewIfNeeded()
  await row.getByRole('button', { name: /Pâté chinois/ }).click()
  // Leftovers have no « À placer » chip (no onPark), so the first chip is a real day.
  await row.locator('.meal-plan-pick__days button').first().click()

  await expect(page.getByText('Pas enregistré — réessaie.')).toBeVisible()
  expect(posts).toHaveLength(1)
  expect(posts[0]).toMatchObject({ action: 'plan', id: 'lo1' })
  // The notice rides the same bar as an undo; what must be absent is the undo itself.
  await expect(page.getByText(/« Pâté chinois » planifié/)).toHaveCount(0)
  await expect(page.locator('.undo-toast__btn')).toHaveCount(0)
})

// Audit follow-up (2026-11-15): a leftover planned OFFLINE is only queued, so the
// client never heard the new meal's id — its « Annuler » re-added the leftover and
// left the meal planned (the same dish twice: once in Restants, once on the day). The
// client mints the meal id now, so the queued undo deletes exactly the meal the queued
// plan creates, and the outbox replays them in that order.
test('« Annuler » on a leftover planned offline removes the meal it planned', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  const sent: { method: string; path: string; body: Record<string, unknown> }[] = []
  await page.route('**/api/meal-leftovers**', async (route) => {
    const req = route.request()
    if (req.method() === 'GET')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ leftovers: [{ id: 'lo1', title: 'Pâté chinois', recipe_id: null, source_meal_id: null, created_at: 0 }] }),
      })
    const body = req.postDataJSON() as Record<string, unknown>
    sent.push({ method: req.method(), path: 'meal-leftovers', body })
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body.action === 'plan' ? { ok: true, planned: true, mealId: body.mealId, title: 'Pâté chinois' } : { ok: true, id: 'lo2' }),
    })
  })
  await page.route('**/api/meals', async (route) => {
    const req = route.request()
    if (req.method() !== 'DELETE') return route.fallback()
    sent.push({ method: 'DELETE', path: 'meals', body: req.postDataJSON() as Record<string, unknown> })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/kitchen')
  await expect(page.locator('.kitchen__day').first()).toBeVisible({ timeout: 15_000 })

  const row = page.locator('.kitchen__ideas .kitchen__idea', { hasText: 'Pâté chinois' })
  await row.scrollIntoViewIfNeeded()
  await page.context().setOffline(true)
  await expect(page.locator('.offline-bar')).toBeVisible()
  await row.getByRole('button', { name: /Pâté chinois/ }).click()
  await row.locator('.meal-plan-pick__days button').first().click()
  await page.locator('.undo-toast__btn').click()
  expect(sent, 'offline: nothing went over the wire yet').toEqual([])

  await page.context().setOffline(false)
  await expect.poll(() => sent.length, { timeout: 20_000 }).toBe(3)
  const [planned, undone, readded] = sent
  expect(planned).toMatchObject({ path: 'meal-leftovers', body: { action: 'plan', id: 'lo1' } })
  expect(typeof planned!.body.mealId).toBe('string')
  expect(undone, 'the undo deletes the very meal the plan made').toEqual({ method: 'DELETE', path: 'meals', body: { id: planned!.body.mealId } })
  expect(readded).toMatchObject({ path: 'meal-leftovers', body: { title: 'Pâté chinois' } })
})
