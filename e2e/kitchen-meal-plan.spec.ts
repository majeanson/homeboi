import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// La cuisine meal-planning UX: the ＋ "Planifier un repas" is a day picker that
// opens that day's editor SCENE (/kitchen/day/:date — one editor, two entry
// points). The day scene now LEADS with the day's agenda; the meal planner is
// demoted into a collapsed « Les repas » disclosure at the bottom and lists slots
// chronologically (déjeuner → dîner → collation → souper). The day note is the
// scene's headline now, not a slot section. The recipe builder fills the screen
// (no stale-keyboard dead space).

async function boot(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
    } catch {
      /* noop */
    }
  })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
}

test('＋ Planifier un repas → day picker → opens that day’s editor scene', async ({ page }) => {
  await boot(page)
  await page.goto('/kitchen')
  await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })

  await page.locator('.add-fab').click()
  await expect(page.locator('.sheet.show')).toBeVisible()
  // The kitchen ＋ opens a blank chooser now — pick "Planifier un repas" to reveal
  // the day picker.
  await page.getByRole('dialog').getByRole('button', { name: 'Planifier un repas' }).click()
  const dayChip = page.locator('.addsheet__days .chip').first()
  await expect(dayChip).toBeVisible()
  await dayChip.click()

  // The day's full editor is a full-screen .scene route now (was a bottom sheet),
  // so the URL carries the day — and a MEAL door lands straight on the scene's
  // « Repas » face (?vue=repas), the meal planner showing without another tap.
  await expect(page).toHaveURL(/\/kitchen\/day\/\d+\?vue=repas/)
  await expect(page.locator('.scene .day-mng__sec').first()).toBeVisible({ timeout: 10_000 })
})

test('day editor lists slots chronologically (note is the headline)', async ({ page }) => {
  await boot(page)
  await page.goto('/kitchen')
  await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })
  // Open the first day's editor straight from the grid (the manage button is
  // icon-only now, named "Gérer · <date>") → navigates to the day scene's
  // « Repas » face (the pencil is a meal door).
  await page.locator('.kitchen__day').first().getByRole('button', { name: /Gérer/ }).click()
  await expect(page).toHaveURL(/\/kitchen\/day\/\d+\?vue=repas/)
  await expect(page.locator('.scene .day-mng__sec').first()).toBeVisible({ timeout: 10_000 })

  const heads = await page.locator('.day-mng__sec-head').allInnerTexts()
  const order = heads.map((h) => h.trim())
  // The note is the day's HEADLINE at the top now, no longer a slot section — the
  // planner lists the five meal slots in the HOUSEHOLD's order (Réglages ▸ Repas),
  // which defaults to DEFAULT_SLOT_ORDER: strictly chronological. The hero souper is
  // rendered at its own place in that run (it used to be pinned last, which put the
  // dessert before it); only its grocery-staples step sets it apart. See DayEditor.tsx.
  expect(order).toEqual(['Déjeuner', 'Dîner', 'Collation', 'Souper', 'Dessert'])

  // The add affordance shares the slot's header line (not a row of its own).
  await expect(page.locator('.day-mng__sec-head-row .sec-label__actbtn').first()).toBeVisible()
})

test('recipe builder fills the screen (no stale-keyboard dead space)', async ({ page }) => {
  await boot(page)
  await page.goto('/kitchen/recipe/new')
  const modal = page.locator('.recipe-modal')
  await expect(modal).toBeVisible({ timeout: 15_000 })
  // No keyboard → the scene must fill the viewport, not a shrunken --vvh band.
  const kbOpen = await page.evaluate(() => document.documentElement.classList.contains('kb-open'))
  expect(kbOpen).toBe(false)
  const { h, vh } = await page.evaluate(() => ({
    h: (document.querySelector('.recipe-modal') as HTMLElement).getBoundingClientRect().height,
    vh: window.innerHeight,
  }))
  expect(h).toBeGreaterThanOrEqual(vh - 2)
})

// The week grid no longer agglomerates a day's suppers behind one tap-to-peek
// summary line (Marc, 2026-09-04) — each supper is its own row, and tapping it
// goes STRAIGHT to its recipe (like the board's meal rows). A meal with no linked
// recipe falls back to that day's full editor (the same door the pencil opens).
test('a day’s meal row opens its recipe directly; an unlinked meal falls back to the day editor', async ({ page }) => {
  await boot(page)
  await page.goto('/kitchen')
  await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })

  const today = page.locator('.kitchen__day').first()
  // « Spaghetti maison » is linked to recipe rc1 in the fixture — its row goes
  // straight there, no peek in between.
  await today.locator('.kitchen__day-meal', { hasText: 'Spaghetti maison' }).click()
  await expect(page).toHaveURL(/\/kitchen\/recipe\/rc1$/)
  await page.goBack()
  await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })

  // « Salade César » has no recipe_id — its row opens the day's full editor instead.
  await page.locator('.kitchen__day').first().locator('.kitchen__day-meal', { hasText: 'Salade César' }).click()
  await expect(page).toHaveURL(/\/kitchen\/day\/\d+\?vue=repas/)
})

// « Restants » and « Idées de repas » both render through the shared MealPool, and
// both led with a permanently-open combobox sitting ABOVE their own empty state:
// heading, empty field, « Pas de restants. Tant mieux ! ». LEAN's first smell, and it
// survived every lean pass for one reason — those sections live BELOW THE FOLD on the
// kitchen tab, and the state matrix only shot the viewport until 2026-09-13.
//
// The exception is the other half of the same rule: the IdeasDrawer is a surface you
// deliberately OPENED to write in, so its field stays open. Lean to scan, generous
// once inside — both directions are pinned here, because a fold applied everywhere
// would be the mirror-image mistake.
test('the meal pools lead with their content; the composer waits behind its ＋', async ({ page }) => {
  await boot(page)
  await page.goto('/kitchen')
  await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })

  const pools = page.locator('.kitchen__ideas')
  await expect(pools.first()).toBeVisible()
  // No pool shows a composer at rest…
  await expect(page.locator('.kitchen__ideas .kitchen__ideas-combo')).toHaveCount(0)
  // …and every one of them offers the ＋ that reveals it.
  const plus = pools.first().locator('.sec-label__actbtn')
  await expect(plus).toHaveAttribute('aria-expanded', 'false')
  await plus.click()
  await expect(pools.first().locator('.kitchen__ideas-combo')).toBeVisible()
  await expect(plus).toHaveAttribute('aria-expanded', 'true')
})

test('…but the ideas DRAWER keeps its field open — you opened it to write', async ({ page }) => {
  await boot(page)
  await page.goto('/kitchen')
  await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })

  await page.locator('.kitchen__ideas-opener .btn--primary').click()
  const drawer = page.locator('.ideas-drawer .scene__body')
  await expect(drawer).toBeVisible()
  await expect(drawer.locator('.kitchen__ideas-combo').first()).toBeVisible()
  // …and it carries no ＋ to fold it away, because there is nothing to fold.
  await expect(drawer.locator('.kitchen__ideas .sec-label__actbtn')).toHaveCount(0)
})
