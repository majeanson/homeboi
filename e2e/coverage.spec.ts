import { test, type Page } from '@playwright/test'
import { mockApi, seedState, type Audience, type Surface, type Theme } from './mocks'

// Full visual coverage of the surfaces the static sweep (screenshots.spec) and
// the overlay sweep (sheets.spec) DON'T reach: every sub-tab, inline editor, and
// shared form/modal that only exists after an interaction. The goal is one PNG
// per distinct UI state so a human/agent can audit the whole app for style + UX
// in one pass. Writes to e2e/screenshots; not pixel-regression. Run:
//   npx playwright test coverage.spec.ts
// then look at e2e/screenshots/*.png.

const PHONE = { width: 390, height: 844 }
const WALL = { width: 1280, height: 800 }

// Boot a page the same way the other overlay specs do: reduced motion (so sheets
// settle instantly), mocked API, seeded localStorage, then navigate and wait for
// the page shell + webfonts.
async function boot(
  page: Page,
  path: string,
  opts: { theme?: Theme; audience?: Audience; surface?: Surface; format?: { width: number; height: number } } = {},
) {
  const { theme = 'day', audience = 'parent', surface = 'mobile', format = PHONE } = opts
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(format)
  await mockApi(page)
  await seedState(page, { theme, audience, lang: 'fr', calm: true, surface })
  await page.goto(path)
  await page.locator('.hub, .page, main').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {})
}

const shoot = (page: Page, name: string, fullPage = true) =>
  page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage })

// ── Kitchen sub-tabs ───────────────────────────────────────────────────────
// The static sweep only ever shoots the default 'meals' tab. Capture the Pantry
// (garde-manger) and Recipes (book) tabs too — they only render one at a time.
// Tab order is meals(0) / pantry(1) / recipes(2); click by index, robust to text.
for (const theme of ['day', 'night'] as Theme[]) {
  const sfx = theme === 'night' ? '-night' : ''

  test(`kitchen-pantry${sfx}`, async ({ page }) => {
    await boot(page, '/kitchen', { theme })
    await page.locator('.subtabs__opt').nth(1).click()
    await page.getByRole('textbox', { name: 'Ajouter un aliment', exact: true }).waitFor({ state: 'visible' })
    await page.waitForTimeout(250)
    await shoot(page, `kitchen-pantry-phone${sfx}`)
  })

  test(`kitchen-recipes${sfx}`, async ({ page }) => {
    await boot(page, '/kitchen', { theme })
    await page.locator('.subtabs__opt').nth(2).click()
    await page.locator('.recipe-grid').waitFor({ state: 'visible' })
    await page.waitForTimeout(250)
    await shoot(page, `kitchen-recipes-phone${sfx}`)
  })
}

// Wide (wall) layout of the two kitchen tabs — column counts and card grids read
// differently at 1280px; worth a day-only look.
test('kitchen-pantry-wall', async ({ page }) => {
  await boot(page, '/kitchen', { surface: 'kiosk', format: WALL })
  await page.locator('.subtabs__opt').nth(1).click()
  await page.getByRole('textbox', { name: 'Ajouter un aliment', exact: true }).waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  await shoot(page, 'kitchen-pantry-wall')
})

test('kitchen-recipes-wall', async ({ page }) => {
  await boot(page, '/kitchen', { surface: 'kiosk', format: WALL })
  await page.locator('.subtabs__opt').nth(2).click()
  await page.locator('.recipe-grid').waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  await shoot(page, 'kitchen-recipes-wall')
})

// ── Liste overlays + states ────────────────────────────────────────────────
for (const theme of ['day', 'night'] as Theme[]) {
  const sfx = theme === 'night' ? '-night' : ''

  // ⚡ Quick add: the re-stock page of past/predicted items (now a full-screen scene).
  test(`list-quick-add${sfx}`, async ({ page }) => {
    await boot(page, '/liste', { theme })
    await page.locator('.add-fab').click() // Ajout rapide lives in the ＋ sheet now
    // Scope to the sheet (dialog): the liste page also has a direct « Ajout rapide »
    // shortcut button now, so an unscoped name lookup is ambiguous.
    await page.getByRole('dialog').getByRole('button', { name: 'Ajout rapide' }).click()
    await page.locator('.scene .qa__list').waitFor({ state: 'visible' })
    await page.waitForTimeout(250)
    await shoot(page, `list-quick-add-phone${sfx}`, false)
  })

  // Tap a row's NAME → the edit scene (rename / synonyms / unlink deal / delete).
  test(`list-item-sheet${sfx}`, async ({ page }) => {
    await boot(page, '/liste', { theme })
    await page.locator('.list-row__name').first().click()
    await page.locator('.scene .li-edit').waitFor({ state: 'visible' })
    await page.waitForTimeout(250)
    await shoot(page, `list-item-sheet-phone${sfx}`, false)
  })
}

// The "checked / in the cart" row state + the "Clear checked" action bar it
// reveals — the single most-used interaction on the list, never captured before.
test('list-checked', async ({ page }) => {
  await boot(page, '/liste')
  await page.locator('.list-row__toggle').first().click()
  await page.locator('.list-row__main.done').first().waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  await shoot(page, 'list-checked-phone')
})

// DealsBrowser, "by item" tab, START state (before a search) — the empty/seed
// state with the staple chips. The results state is already in sheets.spec.
test('list-deals-start', async ({ page }) => {
  await boot(page, '/liste')
  await page.locator('.add-fab').click() // flyer browser lives in the ＋ sheet now
  await page.getByRole('dialog').getByRole('button', { name: /Parcourir/ }).click()
  await page.locator('.scene').waitFor({ state: 'visible' })
  await page.locator('.deal-stores').first().waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  await shoot(page, 'list-deals-start-phone', false)
})

// ── Board overlays ─────────────────────────────────────────────────────────
// Pick-your-face (ProfilePicker) — mobile-only header sheet.
for (const theme of ['day', 'night'] as Theme[]) {
  const sfx = theme === 'night' ? '-night' : ''
  test(`board-profile-picker${sfx}`, async ({ page }) => {
    await boot(page, '/board', { theme })
    await page.locator('.profile-chip').click()
    await page.locator('.profile-faces').waitFor({ state: 'visible' })
    await page.waitForTimeout(300)
    await shoot(page, `board-profile-picker-phone${sfx}`, false)
  })
}

// The two tall operator forms — now full-screen SCENES, not in-sheet forms (tall
// forms strand inputs under the mobile keyboard in a height-capped sheet). The
// board ＋ chooser tiles (order: capture(0) / event(1) / « Corvées »(2) /
// routine(…)) are mostly navigate-only; « Corvées » first expands an in-sheet
// sub-choice (Corvée · Entretien · Projets) before the scene.
test('scene-add-chore', async ({ page }) => {
  await boot(page, '/board')
  await page.locator('.add-fab').click()
  // Target « Corvées » by label (the tile order shifted as ride/activity tiles were
  // added), then its first sub-choice (Corvée → /chore/new scene).
  await page.getByRole('dialog').locator('.cat-pick', { hasText: 'Corvées' }).click()
  await page.locator('.addsheet__chorepick .cat-pick').first().click()
  await page.locator('.scene .operator__chore-form').waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  await shoot(page, 'scene-add-chore-phone', false)
})

test('scene-add-routine', async ({ page }) => {
  // The board ＋ no longer carries a routine tile (routines have their own hub
  // section), so capture the add-routine scene by its route directly.
  await boot(page, '/routine/new')
  await page.locator('.scene .operator__routine-form').waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  await shoot(page, 'scene-add-routine-phone', false)
})

// ── Settings interactive sub-states ────────────────────────────────────────
// Section nav order: household(0) agenda(1) chores(2) routines(3) … — the
// existing settings-sections.spec captures each section's DEFAULT; these are the
// states that only appear after a click inside a section.

// RecurPicker, weekly: the weekday chip row only renders once "weekly" is picked.
// The EventForm is now EDIT-only in Réglages; adding navigates to the /event/new
// scene from the agenda tab's "Ajouter un rendez-vous" button, where the form lives.
test('settings-recur-weekly', async ({ page }) => {
  await boot(page, '/settings')
  await page.locator('.operator__tabs').getByRole('tab', { name: 'Le babillard' }).click() // events sub is first
  await page.getByRole('button', { name: 'Ajouter un rendez-vous' }).click() // → /event/new scene
  await page.locator('.recur select').first().waitFor({ state: 'visible' })
  await page.locator('.recur select').first().selectOption('weekly')
  await page.locator('.recur__days').waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  await shoot(page, 'settings-recur-weekly-phone', false)
})

// CardDeckEditor emoji palette — add a card, then open its emoji palette. The
// RoutineForm is now reached from the routines tab's "Créer une routine" button,
// which navigates to the /routine/new scene (Réglages no longer carries a blank
// add form).
test('settings-deck-palette', async ({ page }) => {
  // Routines are their own sub-section under « Corvées & routines » — deep-link to it.
  await boot(page, '/settings?tab=chores&sub=routines')
  await page.getByRole('button', { name: 'Créer une routine' }).click() // → /routine/new scene
  await page.locator('.deck__add').waitFor({ state: 'visible' })
  await page.locator('.deck__add').click() // add a blank card
  await page.locator('.deck__emoji').first().click() // open its palette
  await page.locator('.emoji-picker').waitFor({ state: 'visible' }) // shared EmojiPicker now
  await page.waitForTimeout(250)
  await shoot(page, 'settings-deck-palette-phone', false)
})

// Rename-a-tag inline form (Réglages ▸ Recettes ▸ used-tags). recipes = nth(5).
test('settings-tag-rename', async ({ page }) => {
  await boot(page, '/settings')
  await page.getByRole('tab', { name: 'La cuisine' }).click() // recipes (tags)
  await page.locator('.tag-admin__row').first().waitFor({ state: 'visible' })
  // Each row ends in the uniform RowActions pair (✏️ Renommer / 🗑️ Retirer); the
  // row also carries a 🖌 colour button before them, so target the rename by its
  // accessible name rather than position. Tapping it reveals the inline rename form.
  await page.locator('.tag-admin__row').first().getByRole('button', { name: 'Renommer' }).click()
  await page.locator('.tag-admin__rename').waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  await shoot(page, 'settings-tag-rename-phone', false)
})

// ── Kitchen meals-tab prompts ──────────────────────────────────────────────
// The two banner/prompt states the meals tab grows after a tap — neither needs
// AI or the network (both are pure client computations over the seeded data).

// "Avec mes recettes" → a single book suggestion banner. The kitchen week's
// actions moved into the ＋ Add sheet (lib/kitchenActions → AddSheet tiles), so
// open the sheet first; tapping the tile closes it and the suggestion card
// lands on the meals grid behind it.
test('kitchen-suggestion', async ({ page }) => {
  await boot(page, '/kitchen')
  await page.locator('.add-fab').click()
  await page.getByRole('button', { name: /Avec mes recettes/ }).click()
  await page.locator('.kitchen__suggestion').waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  await shoot(page, 'kitchen-suggestion-phone', false)
})

// "Magasiner la semaine" → the staples-to-buy picker (starts all-unchecked; you
// tick what you want). Same move into the ＋ Add sheet; the .kitchen__shop confirm
// panel renders on the grid behind.
test('kitchen-shop-week', async ({ page }) => {
  await boot(page, '/kitchen')
  await page.locator('.add-fab').click()
  await page.getByRole('button', { name: /Magasiner la semaine/ }).click()
  await page.locator('.kitchen__shop').waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  await shoot(page, 'kitchen-shop-week-phone', false)
})

// ── Recipe sheet + Cook mode deeper frames ─────────────────────────────────
// Open the first recipe card (Spaghetti — has steps, ingredients, servings) from
// the Recettes sub-tab; the base recipe modal is already in sheets.spec.
async function openRecipe(page: Page) {
  await page.locator('.subtabs__opt').nth(2).click() // Recettes
  // A recipe card now navigates STRAIGHT to the recipe view route
  // (/kitchen/recipe/:id) where the .recipe-modal lives — the old detail peek
  // (with its "Ouvrir la recette" button) was removed.
  await page.locator('.recipe-card').first().click()
  await page.locator('.recipe-modal').waitFor({ state: 'visible' })
}

// Cook mode is a standalone route now (/kitchen/recipe/:id/cook); the 'step'
// stepper vs 'full' page follows the active PROFILE (no in-cook toggle). A
// toddler reaches it by tapping a planned meal in the kid kitchen, which calls
// nav(`/kitchen/recipe/${r.id}/cook`) — so booting that route in the toddler
// audience lands on the exact same stepper, without depending on the seeded
// meal week happening to surface a cookable planned tile. rc1 (Spaghetti) has
// steps + a "10 minutes" duration in step 1, which the timer test needs.
async function openKidCook(page: Page) {
  await page.goto('/kitchen/recipe/rc1/cook')
  await page.locator('.cook').waitFor({ state: 'visible' })
}

// Plan-a-supper day picker (slot picker + week chips) revealed by "Planifier".
test('recipe-plan', async ({ page }) => {
  await boot(page, '/kitchen')
  await openRecipe(page)
  await page.getByRole('button', { name: /^Planifier$/ }).click()
  // The recipe sheet's "Planifier" now opens the shared MealPlanPicker
  // (slot picker + week chips), which renders .meal-plan-pick / __days.
  await page.locator('.meal-plan-pick__days').waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  await shoot(page, 'recipe-plan-phone', false)
})

// The 📜 "as written / original" paper view of a recipe.
test('recipe-original', async ({ page }) => {
  await boot(page, '/kitchen')
  await openRecipe(page)
  await page.locator('.recipe-original-toggle').click()
  await page.locator('.recipe-original').waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  await shoot(page, 'recipe-original-phone', false)
})

// CookMode 'full' view — the whole recipe on one scrolling page. This is what the
// parent profile gets straight from the recipe sheet's "Cuisiner" (no toggle).
test('cook-full', async ({ page }) => {
  await boot(page, '/kitchen')
  await openRecipe(page)
  await page.locator('.recipe-actions .btn--primary').click() // Cuisiner
  await page.locator('.cook').waitFor({ state: 'visible' })
  await page.locator('.cook__full').waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  await shoot(page, 'cook-full-phone', false)
})

// CookMode running timer — the toddler stepper's step 1 has a "10 minutes"
// duration; start it. Step view follows the toddler profile, so go via the kid
// kitchen.
test('cook-timer-running', async ({ page }) => {
  await boot(page, '/kitchen', { audience: 'toddler' })
  await openKidCook(page)
  await page.locator('.cook__arrow--next').click() // ingredients → step 1
  await page.locator('.cook__timer-chip').first().click() // start the timer
  await page.locator('.cook__timer').waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  await shoot(page, 'cook-timer-running-phone', false)
})

// CookMode last step — Next disables at the end (no full-width "Bonne appétit"
// button anymore; the way out is the bar's small ✕).
test('cook-last', async ({ page }) => {
  await boot(page, '/kitchen', { audience: 'toddler' })
  await openKidCook(page)
  // ingredients(0) → step1(1) → step2(2) → step3/last(3): three Next taps.
  for (let i = 0; i < 3; i++) await page.locator('.cook__arrow--next').click()
  await page.locator('.cook__arrow--next').waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  await shoot(page, 'cook-last-phone', false)
})
