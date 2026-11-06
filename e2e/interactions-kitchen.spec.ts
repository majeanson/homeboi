import { test, expect } from '@playwright/test'
import { boxOf } from './measure'
import { APP, settle, isApi, expectApi } from './interact'

// Interaction coverage, La cuisine: the plan, recipes, the meal peek, a kid pick. The harness and its discipline are at the top of interact.ts:
// a form asserts the request it fires, an optimistic flow asserts what the user sees.

// ──────────────────────────── kitchen ──────────────────────────────────

test.describe('kitchen', () => {
  test.beforeEach(async ({ page }) => {
    await APP('/kitchen')(page)
    await settle(page, '.hub')
  })

  test('add a running-low pantry item', async ({ page }) => {
    await page.locator('.subtabs__opt', { hasText: 'Garde-manger' }).click()
    // The add box waits behind its section's ＋ (SectionAdd) — three permanently-open
    // composers used to own the garde-manger's whole first screen.
    await page.getByRole('button', { name: 'Ajouter un aliment', exact: true }).click()
    const input = page.getByRole('textbox', { name: 'Ajouter un aliment', exact: true })
    await input.fill('Lait')
    await expectApi(page, 'POST', 'pantry', () => input.press('Enter'))
  })

  test('checking a low item adds it to the list (explicit) and clears the reminder', async ({ page }) => {
    await page.locator('.subtabs__opt', { hasText: 'Garde-manger' }).click()
    const lows = page.locator('.kitchen__low li')
    await expect(lows).toHaveCount(3)
    // The explicit check is the ONLY thing that puts a low item on the shopping
    // list (marking something low no longer auto-adds). It posts to /list, then
    // clears the low flag; the row leaves the reminder at once.
    await expectApi(page, 'POST', 'list', () =>
      lows.first().locator('button.checkrow__check').click(),
    )
    await expect(lows).toHaveCount(2)
  })

  test('undo restores a cleared pantry item', async ({ page }) => {
    await page.locator('.subtabs__opt', { hasText: 'Garde-manger' }).click()
    const lows = page.locator('.kitchen__low li')
    await lows.first().locator('button.checkrow__check').click()
    await expect(lows).toHaveCount(2)
    await expect(page.locator('.undo-toast')).toBeVisible()
    await page.locator('.undo-toast__btn').click()
    await expect(lows).toHaveCount(3)
  })

  test('Ctrl+Z takes back the newest undo entry, but not while typing', async ({ page }) => {
    // bmad/12 #16 — the desktop mirror of « Annuler ». The stack was always there;
    // only the touch door existed.
    await page.locator('.subtabs__opt', { hasText: 'Garde-manger' }).click()
    const lows = page.locator('.kitchen__low li')
    await lows.first().locator('button.checkrow__check').click()
    await expect(lows).toHaveCount(2)
    await expect(page.locator('.undo-toast')).toBeVisible()
    await page.keyboard.press('Control+z')
    await expect(lows).toHaveCount(3)

    // …and it must NOT hijack the browser's own undo while a field has focus:
    // there Ctrl+Z means « un-type that », and stealing it to resurrect a row
    // would be the worst kind of surprise.
    await lows.first().locator('button.checkrow__check').click()
    await expect(lows).toHaveCount(2)
    const low = page.locator('section', { has: page.locator('.kitchen__low') })
    await low.locator('.sec-label__actbtn').first().click()
    const field = low.locator('.edit-field input').first()
    await field.fill('abc')
    await expect(field).toBeFocused()
    await page.keyboard.press('Control+z')
    await expect(lows).toHaveCount(2)
  })

  test('planning a supper saves directly on Enter — no "Mettre" pill, no ingredients opt-in', async ({ page }) => {
    // The per-day planning controls live in the day editor SCENE now
    // (/kitchen/day/:date). Souper renders LAST (chronological order). No
    // submitLabel is passed anymore, so EntityCombobox renders an icon-only ✓
    // instead of a labeled "Mettre" pill, and Enter alone still saves.
    await page.locator('.kitchen__day').first().getByRole('button', { name: /Gérer/ }).click()
    const sheet = page.locator('.scene')
    await sheet.locator('[data-dnd-zone="supper"] .day-mng__sec-head-row .sec-label__actbtn').click()
    // The supper title editor is an EntityCombobox (reuses .edit-field styling but
    // is NOT a form — Enter commits the free text → beginSetMeal).
    const edit = sheet.locator('[data-dnd-zone="supper"] .edit-field')
    await expect(edit.getByRole('button', { name: 'Mettre' })).toHaveCount(0)
    await edit.locator('input.input').fill('Pizza maison')
    await expectApi(page, 'POST', 'meals', () => edit.locator('input.input').press('Enter'))

    // The "Ajouter les ingrédients aussi" opt-in was removed with it.
    await expect(page.locator('.kitchen__recipe-staples')).toHaveCount(0)
  })

  test('a day shows its breakfast/lunch/snack slots and sets one (POST meals)', async ({ page }) => {
    await page.locator('.kitchen__day').first().getByRole('button', { name: /Gérer/ }).click()
    const sheet = page.locator('.scene')
    // The day editor exposes the chronological side slots: déjeuner / dîner /
    // collation, each with its own "＋ Ajouter" (the per-slot editing the grid
    // delegates here). (NOTE: the seeded "Crêpes" meal can't be asserted — the
    // mock seeds meal dates at BASE 08:00Z, not local-midnight, so they don't
    // bucket onto the grid; a mocks.ts fix would be needed, see report.)
    await expect(sheet.locator('.day-mng__sec', { hasText: 'Déjeuner' })).toBeVisible()
    await expect(sheet.locator('.day-mng__sec', { hasText: 'Collation' })).toBeVisible()
    // Setting a lunch is a plain title — a straight POST (append, saveSlot), no
    // staples step. The "＋ Ajouter" sits in the Dîner section's header; scope to it.
    const dinerSec = sheet.locator('.day-mng__sec', { hasText: 'Dîner' })
    await dinerSec.locator('.day-mng__sec-head-row .sec-label__actbtn').click()
    // The per-slot title editor is an EntityCombobox (reuses .edit-field styling but
    // is NOT a form — Enter commits the free text → saveSlot → POST meals).
    const edit = dinerSec.locator('.edit-field')
    await edit.locator('input.input').fill('Sandwich au jambon')
    await expectApi(page, 'POST', 'meals', () => edit.locator('input.input').press('Enter'))
  })

  test('shop the week gathers ingredients and adds them to the list', async ({ page }) => {
    // "Magasiner la semaine" moved into the ＋ Add sheet's kitchen-week actions
    // (Repas tab). Tapping it closes the sheet and surfaces the shop prompt on the
    // grid; confirming posts the gathered ingredients to the list.
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    await page.locator('.sheet.show').getByRole('button', { name: /Magasiner la semaine/ }).click()
    await expect(page.locator('.kitchen__shop')).toBeVisible()

    // Every gather tick is a real thumb target. bmad/11 tier-3 reported these at ~27px
    // "beside a read-aloud zone"; measured 2026-08-28 they are 46px, so that item was
    // stale — but nothing held it there, and a chip is exactly the control that shrinks
    // when someone tunes padding. `--touch-target` (44px) is the app's own floor.
    const ticks = page.locator('.kitchen__staples-chips .chip')
    const n = await ticks.count()
    expect(n, 'the shop prompt offers ticks').toBeGreaterThan(0)
    const floor = Number(
      (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--touch-target'))).replace('px', '').trim(),
    )
    for (let i = 0; i < Math.min(n, 5); i++) {
      const box = await boxOf(ticks.nth(i))
      expect(box.height, `gather tick ${i} is a thumb target`).toBeGreaterThanOrEqual(floor)
    }

    // The picker starts all-unchecked now — tick everything, then confirm posts it.
    await page.locator('.kitchen__shop').getByRole('button', { name: 'Tout cocher' }).click()
    await expectApi(page, 'POST', 'recipe-to-list', () =>
      page.locator('.kitchen__shop .btn--primary').click(),
    )
  })

  test('adding a use-soon item posts it (and never touches the list)', async ({ page }) => {
    await page.locator('.subtabs__opt', { hasText: 'Garde-manger' }).click()
    await page.getByRole('button', { name: 'Ajouter un aliment à finir', exact: true }).click()
    // getByRole, not getByLabel: the ＋ and the field it opens share one accessible
    // name (they are the same action), so the generic label locator now matches both.
    const input = page.getByRole('textbox', { name: 'Ajouter un aliment à finir', exact: true })
    await input.fill('Épinards')
    await expectApi(page, 'POST', 'use-soon', () => input.press('Enter'))
  })
})

// ────────────────────────────── recipes ────────────────────────────────

test.describe('recipes', () => {
  test.beforeEach(async ({ page }) => {
    await APP('/kitchen')(page)
    await settle(page, '.hub')
    // The recipe book now lives behind the "Recettes" sub-tab (kitchen de-densify).
    await page.locator('.subtabs__opt', { hasText: 'Recettes' }).click()
  })

  test('the servings scaler rescales ingredient quantities', async ({ page }) => {
    // A card opens the recipe view route directly (the detail peek was removed).
    await page.locator('.recipe-card', { hasText: 'Spaghetti' }).first().click() // 4 servings, 400 g pâtes
    const modal = page.locator('.recipe-modal')
    await expect(modal.locator('.recipe-view__ings')).toContainText('400 g')
    await modal.locator('[aria-label="Plus de portions"]').click() // 4 → 5 servings
    await expect(modal.locator('.recipe-view__ings')).toContainText('500 g')
  })

  test('a recipe pushes its ingredients to the list and opens cook mode', async ({ page }) => {
    await page.locator('.recipe-card').first().click() // → recipe view directly (peek removed)
    const modal = page.locator('.recipe-modal')
    // "Ajouter à la liste" lives in the header's ⋯ overflow now (the footer keeps
    // only Cuisiner + Planifier). It opens an ingredient PICKER (e40f990) with
    // nothing pre-selected; pick all, then confirm — that's what posts recipe-to-list.
    await modal.locator('.action-menu__btn').click()
    // The panel is PORTALED to <body>, so it is NOT a descendant of .recipe-modal —
    // reach for it on the page, not inside the modal (ActionMenu.tsx).
    await page.getByRole('menuitem', { name: 'Ajouter à la liste' }).click()
    await modal.locator('.recipe-list-pick__all').click() // Tout sélectionner
    await expectApi(page, 'POST', 'recipe-to-list', () =>
      modal.locator('.recipe-list-pick__actions .btn--primary').click(),
    )
    await modal.locator('.recipe-actions .btn--primary').click() // Cook
    await expect(page.locator('.cook')).toBeVisible()
  })

  test('a step with a duration offers a tappable cook-mode timer', async ({ page }) => {
    // Cook mode is a standalone route now; go straight to it. The parent (full) view
    // lays out every step, and rc1's "Faire bouillir les pâtes 10 minutes" exposes a
    // tappable timer chip — tapping it starts a counting clock in the timer rail.
    await page.goto('/kitchen/recipe/rc1/cook')
    const cook = page.locator('.cook')
    await expect(cook).toBeVisible()
    const chip = cook.locator('.cook__timer-chip').first()
    await expect(chip).toBeVisible()
    await chip.click()
    await expect(cook.locator('.cook__timer-clock')).toContainText(':') // counting down mm:ss
  })

  test('"quoi cuisiner?" toggles a cookability ranking with badges', async ({ page }) => {
    // "Quoi cuisiner?" is a filter pill (recipePills system), not a standalone toggle —
    // and the pills now wait inside the « Filtrer » panel, shut by default so the book
    // opens on recipes rather than on the machinery for narrowing them.
    await page.locator('.recipe-filter').click()
    const toggle = page.locator('.kitchen__pill', { hasText: 'Quoi cuisiner' })
    await expect(toggle).toBeVisible() // pantry has out-of-stock items to rank against
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    // None of the seeded recipes need Beurre/Café/Papier, so they read as ready.
    await expect(page.locator('.recipe-card__ready').first()).toBeVisible()
  })

  test('tag chips filter the recipe grid', async ({ page }) => {
    const cards = page.locator('.recipe-card')
    await expect(cards).toHaveCount(4)
    // Tag chips share the « Filtrer » panel with the pills.
    await page.locator('.recipe-filter').click()
    const prefere = page.locator('.kitchen__tag-filter .chip', { hasText: 'préféré' })
    const rapide = page.locator('.kitchen__tag-filter .chip', { hasText: 'rapide' })
    await prefere.click()
    await expect(cards).toHaveCount(1) // only the recipe tagged "préféré" (rc1)
    // Tag filters are multi-select with AND semantics now: adding "rapide" keeps
    // only recipes that carry BOTH tags — still just rc1.
    await rapide.click()
    await expect(cards).toHaveCount(1)
    // Deselect "préféré" → filtered by "rapide" alone: the two recipes tagged rapide.
    await prefere.click()
    await expect(cards).toHaveCount(2)
  })

  test('creating a recipe posts it', async ({ page }) => {
    // The recipe builder is a standalone route (/kitchen/recipe/new) rendering the
    // RecipeForm (.recipe-modal). The ＋ FAB → "Ajouter une recette" tile just
    // navigates here (covered by the add-sheet test); go straight to the builder.
    await page.goto('/kitchen/recipe/new')
    const modal = page.locator('.recipe-modal')
    await modal.waitFor({ state: 'visible' })
    await modal.locator('.recipe-title-input').fill('Soupe aux légumes')
    await expectApi(page, 'POST', 'recipes', () =>
      modal.locator('.recipe-modal__foot button[type="submit"]').click(),
    )
  })

  test('a recipe step edits in a memo, one open at a time', async ({ page }) => {
    // Straight to the recipe builder route (the ＋→tile nav is covered elsewhere).
    await page.goto('/kitchen/recipe/new')
    const modal = page.locator('.recipe-modal')
    await expect(modal).toBeVisible()
    // Steps start collapsed — no wall of open boxes.
    await expect(modal.locator('.recipe-step__memo')).toHaveCount(0)
    const addStep = modal.getByRole('button', { name: 'Ajouter une étape' })
    await addStep.click() // a fresh step opens straight into its memo
    await expect(modal.locator('.recipe-step__memo')).toHaveCount(1)
    await modal.locator('.recipe-step__memo').fill('Faire revenir l’oignon.')
    // Opening another step collapses the first → still exactly ONE memo open.
    await addStep.click()
    await expect(modal.locator('.recipe-step__memo')).toHaveCount(1)
    await expect(modal.locator('.recipe-step__text', { hasText: 'Faire revenir' })).toBeVisible()
  })
})

// ──────────────────────── tapping a planned meal ───────────────────────

// The two halves of useOpenMeal (components/detail/useOpenMeal). A meal that resolves a
// recipe navigates to it — pinned as a 1-tap budget in tap-budget.spec.ts. A free-text
// meal has no page to jump to, so it still peeks, and the peek is where the plan actions
// live. « Salade César » is the fixture's recipe-less supper; « Spaghetti maison » matches
// recipe rc1 by title.
test('a recipe-less meal still opens the peek, with its plan actions', async ({ page }) => {
  await APP('/board')(page)
  await settle(page, '.board-wall')
  await page.locator('.now-card__meal').filter({ hasText: 'Salade César' }).first().click()

  const sheet = page.locator('.detail-sheet')
  await sheet.waitFor({ state: 'visible', timeout: 10_000 })
  await expect(sheet.locator('.detail-sheet__title')).toHaveText('Salade César')
  // It stayed put — a peek, not a navigation.
  await expect(page).toHaveURL(/\/board$/)
  // The actions a recipe view could never carry, because they belong to the PLAN.
  const actions = sheet.locator('.detail-sheet__actions')
  await expect(actions.getByText('Voir la journée', { exact: true })).toBeVisible()
  await expect(actions.getByText('Retirer du plan', { exact: true })).toBeVisible()
  // …and no recipe doors, because this meal resolves no recipe. (A meal that DOES is
  // the test below — since 2026-09-02 it peeks too, rather than jumping.)
  await expect(actions.getByText('Ouvrir la recette', { exact: true })).toHaveCount(0)
  await expect(actions.getByText('Cuisiner', { exact: true })).toHaveCount(0)
})

// The other half, REVERSED on 2026-09-02 (Marc): a recipe-linked meal used to navigate
// straight to /kitchen/recipe/:id, which left a planned meal with no door back to its
// day. It peeks now, and the peek is the one surface carrying BOTH halves — the day and
// the recipe. « Spaghetti maison » matches recipe rc1 by title in the fixture.
test('a recipe-linked meal peeks too, carrying the day door AND the recipe doors', async ({ page }) => {
  await APP('/board')(page)
  await settle(page, '.board-wall')
  await page.locator('.now-card__meal').filter({ hasText: 'Spaghetti maison' }).first().click()

  const sheet = page.locator('.detail-sheet')
  await sheet.waitFor({ state: 'visible', timeout: 10_000 })
  // It stayed put — the jump is gone.
  await expect(page).toHaveURL(/\/board$/)
  const actions = sheet.locator('.detail-sheet__actions')
  await expect(actions.getByText('Voir la journée', { exact: true })).toBeVisible()
  await expect(actions.getByText('Ouvrir la recette', { exact: true })).toBeVisible()
  // « Cuisiner » is the primary — it is what you opened a supper for.
  await expect(sheet.locator('.detail-sheet__actions .btn--primary')).toHaveText(/Cuisiner/)
  // The plan-editing tail folded into the ⋯ so the three doors above stay readable.
  await expect(actions.getByText('Retirer du plan', { exact: true })).toHaveCount(0)
  await expect(sheet.locator('.action-menu__btn')).toBeVisible()
  // And the primary really does land in cook mode for THIS meal's recipe.
  await sheet.locator('.detail-sheet__actions .btn--primary').click()
  await expect(page).toHaveURL(/\/kitchen\/recipe\/rc1\/cook/)
})

// ──────────────────────── kid meal suggestion ──────────────────────────

test('a kid recipe pick drops a dated idea into the meal-ideas pool', async ({ page }) => {
  await APP('/kitchen', 'toddler')(page)
  await settle(page, '.hub')
  // Hear-first: a toddler action tile speaks on the FIRST tap and arms; a SECOND
  // tap commits — so nothing happens by accident. Pick a recipe by name (the
  // shelf's first tile is now the "Les collections" door, not a recipe).
  const recipe = page.locator('.kid-pick .bigtile', { hasText: 'Spaghetti maison' }).first()
  await recipe.click()
  await expect(recipe).toHaveClass(/is-armed/)
  await recipe.click()
  await expect(page.locator('.kid-pick .bigtile', { hasText: 'Mardi' })).toBeVisible()
  // Tapping a day (Mardi) no longer schedules the supper — a pre-reader shouldn't
  // silently commit a real day. It drops an IDEA into "Idées de repas" (C-14: the
  // real `date` column now, not the old "<recipe> (Mardi)" title-suffix hack),
  // keeping the recipe link + the chosen day, for a parent to place later. Still
  // gated by the confirming second tap (first arms + speaks).
  const mardi = page.locator('.kid-pick .bigtile', { hasText: 'Mardi' })
  await mardi.click()
  await expect(mardi).toHaveClass(/is-armed/)
  const [req] = await Promise.all([
    page.waitForRequest(isApi('POST', 'meal-ideas'), { timeout: 15_000 }),
    mardi.click(),
  ])
  const body = JSON.parse(req.postData() || '{}')
  expect(body).toMatchObject({ title: 'Spaghetti maison', recipeId: 'rc1' })
  expect(typeof body.date).toBe('number')
})
