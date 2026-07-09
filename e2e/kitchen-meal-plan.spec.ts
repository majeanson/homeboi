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
  // so the URL carries the day and the scene holds the day sections.
  await expect(page).toHaveURL(/\/kitchen\/day\/\d+/)
  // The meal planner is always visible now (a « Les repas » section, no disclosure).
  await expect(page.locator('.scene .day-mng__sec').first()).toBeVisible({ timeout: 10_000 })
})

test('day editor lists slots chronologically (note is the headline)', async ({ page }) => {
  await boot(page)
  await page.goto('/kitchen')
  await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })
  // Open the first day's editor straight from the grid (the manage button is
  // icon-only now, named "Gérer · <date>") → navigates to the day scene.
  await page.locator('.kitchen__day').first().getByRole('button', { name: /Gérer/ }).click()
  await expect(page).toHaveURL(/\/kitchen\/day\/\d+/)
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
  await expect(page.locator('.day-mng__sec-head-row .kitchen__slot-add').first()).toBeVisible()
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
