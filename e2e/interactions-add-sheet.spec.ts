import { test, expect } from '@playwright/test'
import { boxOf } from './measure'
import { mockApi, seedState } from './mocks'
import { APP, settle, isApi, expectApi } from './interact'

// Interaction coverage, the ＋ capture sheet, section by section. The harness and its discipline are at the top of interact.ts:
// a form asserts the request it fires, an optimistic flow asserts what the user sees.

// ───────────────────────── add sheet (capture) ─────────────────────────

test.describe('add sheet', () => {
  // The single floating ＋ FAB is the add affordance everywhere — and it is
  // CONTEXTUAL: the board keeps the quick-capture chooser, the other sections
  // open their own actions (tested below).
  test('the board ＋ note box posts a fridge note', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    // The board ＋ hoists the « Note rapide » box to the TOP of the sheet (fast path),
    // so a note is one write-and-Add away — no tile to pick first. It POSTs /api/notes,
    // NOT /api/capture: the AI router moved to the header mic (see capture-*.spec.ts).
    await page.locator('.addsheet__lead input.edit-field__input').fill('Acheter du lait')
    await expectApi(page, 'POST', 'notes', () =>
      page.locator('.addsheet__lead .edit-field__submit').click(),
    )
  })

  test('the board ＋ note box carries a 📎 for a voice memo / drawing / photo', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    // The three memo actions are the field's own attach affordance now, not three
    // full-width buttons beside it that discarded whatever you'd typed.
    const attach = page.locator('.addsheet__lead .memo-attach__btn')
    await expect(attach).toHaveAttribute('aria-expanded', 'false')
    await attach.click()
    await expect(page.locator('.memo-attach__picks')).toBeVisible()
    await expect(page.locator('.memo-attach__picks button', { hasText: 'Mémo vocal' })).toBeVisible()
    await expect(page.locator('.memo-attach__picks button', { hasText: 'Dessiner' })).toBeVisible()
  })

  test('the board ＋ event tile opens the full-screen event form', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    // The board ＋ is a blank-slate chooser; wait for its tiles, then tap the
    // event tile. It's navigate-only: it leaves the sheet for the full-screen
    // /event/new scene (tall forms strand under the keyboard).
    await expect(page.locator('.cat-pick', { hasText: 'Rendez-vous' })).toBeVisible()
    await Promise.all([
      page.waitForURL(/\/event\/new/),
      page.locator('.cat-pick', { hasText: 'Rendez-vous' }).click(),
    ])
    await expect(page.locator('.scene input[type="date"]')).toBeVisible()
  })

  test('the board ＋ plan-today tile opens the day planner', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    // The board chooser shows every tile at once now (no "Plus…" overflow), so
    // "Planifier aujourd'hui" is directly present and navigates to that day's planner.
    await expect(page.locator('.cat-pick', { hasText: 'Planifier aujourd’hui' })).toBeVisible()
    await Promise.all([
      page.waitForURL(/\/kitchen\/day\/\d+/),
      page.locator('.cat-pick', { hasText: 'Planifier aujourd’hui' }).click(),
    ])
  })

  test('the kitchen ＋ offers cuisiner / recette / repas / restants / garde-manger / réserve — no quick note', async ({ page }) => {
    await APP('/kitchen')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    // The section chooser (direct child of .sheet) now has SEVEN tiles:
    // Cuisiner, Ajouter une recette, Planifier un repas, Restants, Ajouter un
    // aliment, La réserve, Le livre illustré (the new toddler picture-game door).
    // (The kitchen-week actions below sit in a separate .sheet__group.)
    const sectionTiles = page.locator('.sheet > .cat-grid > .cat-pick')
    await expect(sectionTiles).toHaveCount(7)
    await expect(sectionTiles, 'no quick-capture in the kitchen sheet').toHaveCount(7)
    await expect(page.locator('.cat-pick', { hasText: 'Note rapide' })).toHaveCount(0)
    // The sheet is a blank-slate chooser now: pick "Planifier un repas" to reveal
    // its DAY PICKER (chips that navigate to the day's editor scene /kitchen/day/…),
    // not an inline day-select + slot-picker + POST.
    await page.locator('.cat-pick', { hasText: 'Planifier un repas' }).click()
    await expect(page.locator('.sheet .addsheet__daypick')).toBeVisible()
    const days = page.locator('.sheet .addsheet__days .chip')
    await expect(days.first()).toBeVisible()
    await Promise.all([
      page.waitForURL(/\/kitchen\/day\/\d+/),
      days.first().click(),
    ])
  })

  test('the kitchen ＋ réserve tile posts to reserve', async ({ page }) => {
    await APP('/kitchen')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    await page.locator('.cat-pick', { hasText: 'La réserve' }).click()
    await page.locator('.addsheet__panel input.edit-field__input').fill('Sac de petits pois')
    await expectApi(page, 'POST', 'reserve', () =>
      page.locator('.addsheet__panel .edit-field__submit').click(),
    )
  })

  // F3 « À compléter » (PARITY Wave E, entry 10) — the board todo card was smoke
  // -rendered only; nothing created a todo. The board ＋ « Tâches » tile opens the one task
  // form, folded to its title: a bare title is a to-do, so it POSTs /api/todos.
  test('the board ＋ « Tâches » box posts a todo', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    await page.locator('.cat-pick', { hasText: 'Tâches' }).click()
    await page.locator('.addsheet__todo input.edit-field__input').fill('Sac de piscine')
    await expectApi(page, 'POST', 'todos', () =>
      page.locator('.addsheet__todo button[type="submit"]').click(),
    )
  })

  // F14 Restants (PARITY Wave E, entry 10) — the ＋ « Restants » field was reached in
  // keyboard.spec but nothing POSTed a leftover. The kitchen ＋ « Restants » tile opens
  // the unified free-text/meal combobox that POSTs /api/meal-leftovers.
  test('the kitchen ＋ « Restants » box posts a leftover', async ({ page }) => {
    await APP('/kitchen')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    await page.locator('.cat-pick', { hasText: 'Restants' }).click()
    await page.locator('.sheet.show input.edit-field__input').fill('Reste de spaghetti')
    await expectApi(page, 'POST', 'meal-leftovers', () =>
      page.locator('.sheet.show .edit-field__submit').click(),
    )
  })

  // C-14 — the kitchen ＋ sheet's week-action tiles shrank to 2 (shop + « Idées »):
  // Vide-frigo now opens from the IdeasDrawer's own footer button, not a direct
  // ＋ tile. The tile navigates to the drawer's full-screen scene (/kitchen/idees).
  // The button lives in the 🤖 « IA » source's footer, not under every source: it IS an
  // AI ask, and hanging it under Favoris / À écouler / 👧 read as a fifth, unrelated
  // action on tabs that never call the model. So the spec picks that source first.
  test('the kitchen ＋ Idées tile opens the drawer, whose IA footer runs Vide-frigo', async ({ page }) => {
    await APP('/kitchen')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    await page.locator('.cat-pick', { hasText: 'Idées de repas' }).click()
    const drawer = page.locator('.ideas-drawer.scene')
    await expect(drawer).toBeVisible()
    await expect(page).toHaveURL(/\/kitchen\/idees/)
    // The drawer opens on « Idées »; Vide-frigo hangs off the 🤖 IA source.
    await drawer.locator('.subtabs__opt', { hasText: 'IA' }).click()
    await drawer.getByRole('button', { name: 'Vide-frigo AI' }).click()
    // Step 1 — the sheet auto-loads a batch of dish names (checkable chips).
    const modal = page.locator('.kit-modal.fridge-modal')
    await expect(modal).toBeVisible()
    const ideas = modal.locator('.fridge-modal__ideas .chip')
    await expect(ideas.first()).toBeVisible()
    // Tick one idea, then build its recipe (a fresh empty-fridge POST, step 'recipes').
    await ideas.first().click()
    await expectApi(page, 'POST', 'empty-fridge', () =>
      modal.getByRole('button', { name: /Voir les recettes/ }).click(),
    )
    // Step 2 — the recipe card renders; « Garder » saves it to the book (recipes POST).
    await expect(modal.locator('.fridge-recipe')).toBeVisible()
    await expectApi(page, 'POST', 'recipes', () =>
      modal.getByRole('button', { name: 'Garder' }).click(),
    )
  })

  // C-14 — the regression that made the drawer a scene: as a content-height bottom
  // sheet it grew from the bottom edge, so swapping an empty « Favoris » for a full
  // 🤖 IA batch shoved the tab row itself up and down under the thumb. A scene pins
  // its head, so the tabs must hold their y across every source.
  test('the Idées scene holds its tab row at one y across every source', async ({ page }) => {
    await APP('/kitchen/idees')(page)
    const tabs = page.locator('.ideas-drawer .subtabs')
    await expect(tabs).toBeVisible()
    const ys: Record<string, number> = {}
    for (const label of ['Idées', 'Favoris', 'À écouler', 'IA', 'Proposé par']) {
      await page.locator('.ideas-drawer .subtabs__opt', { hasText: label }).click()
      await expect(page.locator('.ideas-drawer .subtabs__opt.is-on', { hasText: label })).toBeVisible()
      ys[label] = (await boxOf(tabs)).y
    }
    expect([...new Set(Object.values(ys))], `tab row moved: ${JSON.stringify(ys)}`).toHaveLength(1)
  })

  // Marc, 2026-10-01: in the Idées scene, picking a day for an idea changed nothing
  // on screen (the week grid is not there) and offered no way back — usePlanIdea was
  // a bare POST. It is a create-with-undo now: a toast names the dish and the day,
  // and « Annuler » DELETEs exactly the meal just planned.
  test('planning an idea from the Idées scene says so, and « Annuler » takes it back', async ({ page }) => {
    await APP('/kitchen/idees')(page)
    await page.route('**/api/meals', (r) =>
      r.request().method() === 'POST'
        ? r.fulfill({ contentType: 'application/json', body: '{"ok":true,"id":"planned1"}' })
        : r.fallback(),
    )
    const del = page.waitForRequest((r) => isApi('DELETE', 'meals')(r) && r.postData()?.includes('planned1') === true)
    await page.locator('.ideas-drawer .kitchen__idea-name', { hasText: 'Soupe poulet-nouilles' }).click()
    await page.locator('.ideas-drawer .meal-plan-pick__days .chip').first().click()
    const toast = page.locator('.undo-toast')
    await expect(toast).toContainText('« Soupe poulet-nouilles » planifié —')
    await toast.getByRole('button', { name: 'Annuler' }).click()
    await del
  })

  // UX walk, 2026-10-01: the drawer's ⚙ sat alone on a line of its own above the
  // field — a whole row before the one thing the page is for. It rides the field's row.
  test('the Idées scene keeps its ⚙ on the field’s row', async ({ page }) => {
    await APP('/kitchen/idees')(page)
    const field = page.locator('.ideas-drawer .kitchen__ideas-combo')
    await expect(field).toBeVisible({ timeout: 15_000 })
    const f = await boxOf(field)
    const g = await boxOf(page.locator('.ideas-drawer .kitchen__ideas-composer .mode-toggle'))
    expect(Math.abs(f.y + f.height / 2 - (g.y + g.height / 2)), 'same line').toBeLessThan(4)
  })

  // UX walk, 2026-10-01: « Listes de départ 2 » sat right over the one fold « Avant de
  // partir 2 » — the same number twice. With ONE folded checklist the fold carries it.
  test('Avant de partir does not say its one checklist’s count twice', async ({ page }) => {
    await APP('/board/departure')(page)
    const sec = page.locator('.departure__body .todo-sec').first()
    await expect(sec.locator('.todo-fold')).toHaveCount(1, { timeout: 15_000 })
    await expect(sec.locator('.todo-fold')).toContainText('2')
    await expect(sec.locator('.sec-label .ct')).toHaveCount(0)
  })

  // C-14 — a child's suggestion (meal_ideas `date` + `suggested_by`) surfaces a
  // small chip on the matching empty day tile; tapping it deep-links to the drawer
  // scene on 👧 « Proposé par » (?tab=kid) — never auto-plans.
  test('a kid-suggested idea chip on an empty day opens the drawer on 👧', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    // Override AFTER mockApi so this route wins (mocks.ts's own catch-all is
    // registered first — Playwright runs the LAST-registered matching handler).
    await page.route('**/api/meal-ideas**', (r) => {
      if (r.request().method() !== 'GET') return r.fulfill({ contentType: 'application/json', body: '{"ok":true}' })
      r.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ideas: [
            { id: 'kid1', title: 'Pizza maison', recipe_id: null, suggested_by: 'm3', date: 1_749_960_000, created_at: 0 },
          ],
        }),
      })
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/kitchen')
    await settle(page, '.hub')
    const chip = page.locator('.kitchen__day-kidsuggest', { hasText: 'propose' })
    await expect(chip).toBeVisible()
    await chip.click()
    const drawer = page.locator('.ideas-drawer.scene')
    await expect(drawer).toBeVisible()
    await expect(page).toHaveURL(/\/kitchen\/idees\?tab=kid/)
    await expect(drawer.locator('.subtabs__opt.is-on', { hasText: 'Proposé par' })).toBeVisible()
    await expect(drawer.getByText('Pizza maison')).toBeVisible()
  })

  test('the liste ＋ offers add-line / quick-add / flyer / best-prices, defaulting to the add form', async ({ page }) => {
    await APP('/liste')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    // Liste's ＋ is now a chooser: add a line, Ajout rapide, Parcourir les
    // circulaires, and (since the seeded list isn't empty) Choisir les meilleurs.
    const tiles = page.locator('.sheet > .cat-grid > .cat-pick')
    await expect(tiles).toHaveCount(4)
    // Blank-slate chooser: pick the add-a-line tile (quick-add/flyer are
    // navigate-only, best-prices runs an action) to reveal the form that POSTs to list.
    // Picking a tile DRILLS IN — the chooser is replaced by that tile's form (titled with
    // the action, ← back to the tiles), so the form opens at the top of the sheet instead
    // of below the fold. So the tiles are gone, not merely un-highlighted.
    await page.locator('.cat-pick', { hasText: 'Ajouter à la liste' }).click()
    await expect(tiles).toHaveCount(0)
    await expect(page.locator('.sheet.show .sheet__title--back')).toHaveText(/Ajouter à la liste/)
    await page.locator('.addsheet__panel input.edit-field__input').fill('Beurre')
    await expectApi(page, 'POST', 'list', () =>
      page.locator('.addsheet__panel .edit-field__submit').click(),
    )
  })

  test('a drilled-in ＋ form goes back to the chooser', async ({ page }) => {
    await APP('/liste')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    const tiles = page.locator('.sheet > .cat-grid > .cat-pick')
    await expect(tiles).toHaveCount(4)
    await page.locator('.cat-pick', { hasText: 'Ajouter à la liste' }).click()
    await expect(tiles).toHaveCount(0)
    // ← returns to the tiles (the ✕ still closes the whole sheet from either level).
    await page.locator('.sheet.show .sheet__back').click()
    await expect(tiles).toHaveCount(4)
    await expect(page.locator('.sheet.show .sheet__back')).toHaveCount(0)
  })

  test('the routines ＋ opens the routine builder directly', async ({ page }) => {
    await APP('/maison')(page)
    await settle(page, '.hub')
    // Maison's ＋ now opens the merged chooser (routines + the cercle add-set) —
    // the "Routines" tile leads it and drills into the manage picker (new + edit
    // existing routines) in place; its « Partir de zéro » goes to the full-screen
    // routine scene. (The two doors used to read « Ajouter une routine » and
    // « Nouvelle routine » — two words for one idea; they say what they DO now.)
    await page.locator('.add-fab').click()
    await page.getByRole('dialog').locator('.cat-pick[data-mode="routine-pick"]').click()
    await Promise.all([
      page.waitForURL(/\/routine\/new/),
      page.getByRole('dialog').getByRole('button', { name: 'Partir de zéro' }).click(),
    ])
    await expect(page.locator('.scene .operator__routine-form')).toBeVisible()
  })
})
