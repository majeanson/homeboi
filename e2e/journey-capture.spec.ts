import { test, expect, type Page, type Request } from '@playwright/test'
import { boxOf, settled } from './measure'
import { mockApi, seedState, type Theme } from './mocks'
import { APP, settle, isApi, expectApi } from './interact'
import { test as test2, test as test6, test as test8 } from './fixtures'
import { worstRightBleed, assertClean } from './overflow'

// JOURNEY — CAPTURE & THE ＋ SHEET (review #43; was interactions-add-sheet.spec.ts + plus-capture.spec.ts + fab-hold-voice.spec.ts + capture-degraded.spec.ts + capture-offline.spec.ts + add-sheet-overflow.spec.ts + ask-sheet.spec.ts + sheets.spec.ts).
//
// Interaction coverage, the ＋ capture sheet, section by section. The harness and its discipline are at the top of interact.ts:
// a form asserts the request it fires, an optimistic flow asserts what the user sees.

// ───────────────────────── add sheet (capture) ─────────────────────────

test.describe('interactions-add-sheet', () => {
  test.describe('add sheet', () => {
    // The single floating ＋ FAB is the add affordance everywhere — and it is
    // CONTEXTUAL: the board keeps the quick-capture chooser, the other sections
    // open their own actions (tested below).
    test('the board ＋ note box files the line through capture', async ({ page }) => {
      await APP('/board')(page)
      await settle(page, '.hub')
      await page.locator('.add-fab').click()
      await expect(page.locator('.sheet.show')).toBeVisible()
      // The board ＋ hoists the « Note rapide » box to the TOP of the sheet (fast path),
      // so a line is one write-and-Add away — no tile to pick first. With the AI on it
      // POSTs /api/capture (review #10; the AI-off and memo cases: journey-capture.spec.ts).
      await page.locator('.addsheet__lead input.edit-field__input').fill('Acheter du lait')
      await expectApi(page, 'POST', 'capture', () =>
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

    // Review #16: nine tiles was decision paralysis. The day planner rides the « Aujourd'hui »
    // and « Demain » card heads, the sitter link lives in Réglages ▸ Partage, and the
    // grocery line came in.
    test('the board ＋ is slim: a grocery line, no planner or sitter tiles', async ({ page }) => {
      await APP('/board')(page)
      await settle(page, '.hub')
      await page.locator('.add-fab').click()
      await expect(page.locator('.sheet.show')).toBeVisible()
      const tile = (mode: string) => page.locator(`.sheet.show .cat-pick[data-mode="${mode}"]`)
      await expect(tile('list-item')).toBeVisible()
      for (const gone of ['plan-today', 'plan-tomorrow', 'sitter-link']) await expect(tile(gone)).toHaveCount(0)
      await expect(page.locator('.sheet.show .cat-pick')).toHaveCount(7)

      await tile('list-item').click()
      await page.locator('.sheet.show input.edit-field__input').last().fill('Lait')
      await expectApi(page, 'POST', 'list', () => page.locator('.sheet.show .edit-field__submit').last().click())
    })

    test('the « Aujourd’hui » card head still opens the day planner', async ({ page }) => {
      await APP('/board')(page)
      await settle(page, '.hub')
      await Promise.all([
        page.waitForURL(/\/kitchen\/day\/\d+/),
        page.locator('.wg-slot[data-card="today"]').getByRole('link', { name: /Planifier aujourd/ }).click(),
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
    // form, folded to its title: a bare title is a to-do, and the one form POSTs /api/tasks (0150).
    test('the board ＋ « Tâches » box posts a todo', async ({ page }) => {
      await APP('/board')(page)
      await settle(page, '.hub')
      await page.locator('.add-fab').click()
      await expect(page.locator('.sheet.show')).toBeVisible()
      await page.locator('.cat-pick', { hasText: 'Tâches' }).click()
      await page.locator('.addsheet__todo input.edit-field__input').fill('Sac de piscine')
      await expectApi(page, 'POST', 'tasks', () =>
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
      for (const label of ['Idées', 'Favoris', 'À utiliser bientôt', 'IA', 'Proposé par']) {
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
      await page.locator('.ideas-drawer .meal-plan-pick__days .chip:not(.meal-plan-pick__unplaced)').first().click()
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
})

// ── folded from plus-capture.spec.ts ──────────────────────────────────────────────
test2.describe('plus-capture', () => {
  // Review #10 (2026-11-17): the landing promises that « dentiste pour Léa mardi 15h » « se
  // range au bon jour, au bon nom ». A stranger typed it into the obvious place, the board's
  // ＋ field, and it became a fridge note; through « Classer » it did land, but the line said
  // « Ajouté : dentiste · Léa », with no kind and no day, so nobody could check it.
  //
  // Guarded here: the ＋ field files through /api/capture, the sheet closes, and the undo
  // toast names the KIND and the DAY the server filed on. With the household's AI off, the
  // field is a plain note again (nothing to classify).

  test2.use({ timezoneId: 'America/Toronto' })

  // Tue 24 Nov 2026, 15:00 in Toronto: next Tuesday, which the week on screen cannot show.
  const AT = 1795550400

  // Registered AFTER boot's mockApi: the later route wins in Playwright.
  async function stubCapture(page: Page) {
    await page.route('**/api/capture', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'event',
          degraded: false,
          routed: { kind: 'event', label: 'dentiste · Léa', cleanup: [{ table: 'events', id: 'e_e2e' }], when: { at: AT, allDay: false } },
        }),
      }),
    )
  }

  async function openPlus(page: Page) {
    await page.goto('/board')
    await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
  }

  test2('the ＋ field files the line and the toast says what and when', async ({ app, page }) => {
    await app.boot()
    await stubCapture(page)
    await openPlus(page)
    await page.locator('.addsheet__lead input.edit-field__input').fill('dentiste pour Léa mardi 15h')
    await expectApi(page, 'POST', 'capture', () => page.locator('.addsheet__lead .edit-field__submit').click())

    await expect(page.locator('.sheet.show')).toHaveCount(0)
    await expect(page.locator('.undo-toast')).toContainText('Ajouté : Rendez-vous · dentiste · Léa · mar. 24 nov., 15 h 00')
  })

  test2('with the AI off, the ＋ field is a plain fridge note', async ({ app, page }) => {
    await app.boot({ api: { overrides: { health: { ok: true, ai: false, photos: false, realtime: false, mail: false } } } })
    await openPlus(page)
    await page.locator('.addsheet__lead input.edit-field__input').fill('Acheter du lait')
    await expectApi(page, 'POST', 'notes', () => page.locator('.addsheet__lead .edit-field__submit').click())
  })
})


// ── folded from fab-hold-voice.spec.ts ──────────────────────────────────────────────
test.describe('fab-hold-voice', () => {
  // Hold the ＋ and speak (bmad/12 #18).
  //
  // The hold must never cost the tap: the plain press still opens the section's
  // blank chooser, exactly as before. And it must only bind where there is
  // something to dictate INTO — Maison's adds are all structured entities, so a
  // hold there keeps its ordinary meaning.
  //
  // The mic itself isn't exercised here: SpeechRecognition doesn't exist in
  // headless Chromium, so `hasVoice` is false and the hook declines to start. What
  // this guard actually protects is the ROUTING — which form the hold opens, and
  // that the tap is unharmed. lib/useVoiceInput has its own unit coverage.
  const PHONE = { width: 390, height: 780 }

  async function hold(page: Page, ms = 700) {
    const fab = page.locator('.add-fab')
    const box = await boxOf(fab)
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    // The hold IS the gesture: a press lasts a duration, and no signal stands in for one.
    await page.waitForTimeout(ms)
    await page.mouse.up()
  }

  test.describe('hold the ＋ to speak', () => {
    test.use({ viewport: PHONE })

    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page)
      await seedState(page, { surface: 'mobile' })
    })

    test('a hold on the board opens the note composer directly', async ({ page }) => {
      await page.goto('/board')
      await hold(page)
      // Straight into « Note rapide » — no chooser grid in between.
      const sheet = page.locator('.sheet.show')
      await expect(sheet).toBeVisible()
      await expect(sheet.locator('.edit-field').first()).toBeVisible()
    })

    test('a plain tap still opens the chooser', async ({ page }) => {
      await page.goto('/board')
      await page.locator('.add-fab').click()
      const sheet = page.locator('.sheet.show')
      await expect(sheet).toBeVisible()
      // The tile grid is the chooser's signature — a hold-opened form has none.
      await expect(sheet.locator('> .cat-grid')).toBeVisible()
    })

    test('a hold on La liste opens the list composer, not the board note', async ({ page }) => {
      await page.goto('/liste')
      await hold(page)
      await expect(page.locator('.sheet.show')).toBeVisible()
      await expect(page.locator('.sheet.show > .cat-grid')).toHaveCount(0)
    })

    test('a hold on /notes opens the quick composer, not the blank editor', async ({ page }) => {
      // A plain TAP on the Notes ＋ navigates straight to a blank note (FORM_ROUTES.cnote,
      // journey-navigation.spec.ts) — the ONE door this hold still needs to reach, since
      // that full editor has no mic. `VOICE_MODES.notes` bypasses FORM_ROUTES entirely.
      await page.goto('/notes')
      await hold(page)
      await expect(page.locator('.note-editor')).toHaveCount(0)
      const sheet = page.locator('.sheet.show')
      await expect(sheet).toBeVisible()
      await expect(sheet.locator('.edit-field').first()).toBeVisible()
    })

    test('a hold on Maison keeps its ordinary meaning', async ({ page }) => {
      // Every Maison add is a structured entity a sentence of speech can't fill,
      // so there is no voice mode and the hold falls through to the plain chooser.
      await page.goto('/maison')
      await hold(page)
      await expect(page.locator('.sheet.show > .cat-grid')).toBeVisible()
    })
  })
})


// ── folded from capture-degraded.spec.ts ──────────────────────────────────────────────
test.describe('capture-degraded', () => {
  // Behavioural coverage for the capture AI-off DEGRADE + RE-ROUTE flow — the last
  // blind capture path. When AI is off/unavailable the server files the text as a
  // plain note and returns { degraded: true }; CaptureForm then shows the 7 type tiles
  // DIRECTLY (picking a type is required work, not the optional "Corriger" tweak).
  // Tapping a tile re-POSTs /api/capture with forceType AND undo = the note's rows,
  // so the correction MOVES the capture instead of duplicating it.
  //
  // The shared mock falls every POST through to {ok:true}, which the client reads as a
  // non-degraded happy-path route — so this stubs POST /api/capture per-test to return
  // the degraded shape first, then a real route on the forced re-file (writes hand back
  // {ok:true} so we assert the request body, not a refetched outcome).

  const NOTE_CLEANUP = [{ table: 'notes', id: 'n_e2e' }]

  // First capture (no forceType) → AI-off note + degraded:true, carrying the note row
  // as cleanup. The forced re-file → a real route (degraded:false).
  async function stubCapture(page: Page) {
    await page.route('**/api/capture', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}')
      if (body.forceType) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            type: body.forceType,
            degraded: false,
            routed: { kind: body.forceType, label: body.text, cleanup: [{ table: 'meals', id: 'm_e2e' }] },
          }),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'note',
          degraded: true,
          routed: { kind: 'note', label: body.text, cleanup: NOTE_CLEANUP },
        }),
      })
    })
  }

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr' })
  })

  // The capture spine moved off the ＋ sheet and onto the header mic
  // (« Parle à la maison » ▸ Classer), so the ＋ sheet's note tile can be a plain note.
  async function openCapture(page: Page, text: string) {
    await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('.app-head__ask').click()
    await expect(page.locator('.kit-modal.ask-sheet')).toBeVisible()
    await page.locator('.ask-sheet__modes button', { hasText: 'Classer' }).click()
    await page.locator('.capture-form input.edit-field__input').fill(text)
  }

  const submitCapture = (page: Page) => page.locator('.capture-form .edit-field__submit').click()

  test('an AI-off capture degrades to the type picker (tiles shown directly, not behind « Corriger »)', async ({ page }) => {
    await stubCapture(page)
    await page.goto('/board')
    await openCapture(page, 'souper spaghetti jeudi')

    await Promise.all([
      page.waitForRequest(
        (r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/capture',
        { timeout: 20_000 },
      ),
      submitCapture(page),
    ])

    // Degraded confirmation line + the re-file tiles are shown OUTRIGHT — the "Corriger"
    // disclosure is absent (picking a type is required work here, not the optional tweak).
    // Scope the tiles to the capture form — .cat-pick is also the ＋ sheet mode chooser.
    await expect(page.locator('.capture__routed')).toHaveText('L’IA ne répond pas — choisis le type toi-même.')
    await expect(page.locator('.capture__correct')).toHaveCount(0)
    await expect(page.locator('.capture-form .cat-pick', { hasText: 'Souper' })).toBeVisible()
    await expect(page.locator('.capture-form .cat-pick', { hasText: 'Rendez-vous' })).toBeVisible()
    // The typed text is KEPT on a degraded route (still needs re-filing).
    await expect(page.locator('.capture-form input.edit-field__input')).toHaveValue('souper spaghetti jeudi')
  })

  test('picking a type re-routes with forceType and hands the note rows back as undo (moves, not duplicates)', async ({ page }) => {
    await stubCapture(page)
    await page.goto('/board')
    await openCapture(page, 'souper spaghetti jeudi')

    await submitCapture(page)
    await expect(page.locator('.capture-form .cat-pick', { hasText: 'Souper' })).toBeVisible()

    // Tapping « Souper » re-POSTs capture with forceType:'meal' AND undo carrying the
    // degraded note's row — so the server drops the note as it files the meal.
    const isReroute = (r: Request) =>
      r.method() === 'POST' &&
      new URL(r.url()).pathname === '/api/capture' &&
      (() => {
        try {
          const b = JSON.parse(r.postData() || '{}')
          return b.forceType === 'meal' && b.undo?.[0]?.id === 'n_e2e'
        } catch {
          return false
        }
      })()
    await Promise.all([
      page.waitForRequest(isReroute, { timeout: 20_000 }),
      page.locator('.capture-form .cat-pick', { hasText: 'Souper' }).click(),
    ])

    // The re-file cleared the box and the degraded picker is gone (real route now).
    await expect(page.locator('.capture-form input.edit-field__input')).toHaveValue('')
    // The line names the kind it was filed as (review #10): « Souper ».
    await expect(page.locator('.capture__routed')).toHaveText('Ajouté : Souper · souper spaghetti jeudi')
  })

  // The re-file grid is SEVEN tiles wide-ish and had never been measured at 320px — the
  // narrowest phone the suite covers, and the width at which every other overflow bug in
  // this app has surfaced (REVIEW-PASS « small consistency nits »). It matters more here
  // than in most places: this grid appears exactly when the AI could not route the note,
  // so the person is already doing unplanned work, and a tile bleeding past the right
  // edge would be invisible — `.sheet` and the capture card both clip overflow-x, which
  // is why a `scrollWidth` check cannot see it. `assertClean` measures each visible
  // descendant's right edge against the container's, which sees through the clip.
  test('the degraded re-file grid never bleeds past the right edge @320', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await stubCapture(page)
    await page.goto('/board')
    await openCapture(page, 'souper spaghetti jeudi')
    await submitCapture(page)

    // All seven tiles are on screen (the degraded path shows them outright).
    const tiles = page.locator('.capture-form .cat-pick')
    await expect(tiles.first()).toBeVisible({ timeout: 20_000 })
    expect(await tiles.count(), 'the full re-file grid is shown').toBeGreaterThanOrEqual(6)

    // worstRightBleed, not assertClean: the latter also asserts the container itself
    // clips overflow-x, which .capture-form deliberately does not (it is an in-page card,
    // not a sheet). What matters here is the same measurement — no visible descendant may
    // extend past the card's right edge — read through whatever clipping is above it.
    const { bleed, culprit } = await worstRightBleed(page, '.capture-form')
    expect(bleed, `"${culprit}" bleeds off the right edge at 320px`).toBeLessThanOrEqual(1)
  })
})


// ── folded from capture-offline.spec.ts ──────────────────────────────────────────────
test.describe('capture-offline', () => {
  // A-2 (bmad/10) — « La capture tient parole ». Capture used to be the ONE add-path
  // with no outbox: offline (or any transport failure) flipped an error line and left
  // the dictated text sitting in the box, even though the copy already promised
  // « Ton texte est gardé ». Now `AddSheet.submit()` goes through the offline-aware
  // `useWrite()`: online, routing is unchanged; offline, the RAW TEXT is enqueued to
  // the SAME /api/capture endpoint and replayed on reconnect (routing + parseWhen stay
  // server-side, they just run later). This drives a real capture across an
  // offline→online transition and proves the promise now holds: nothing is sent while
  // offline, a calm confirmation replaces the error, and the eventual replay carries
  // the idempotency key B-9 hardened.

  const isCapturePost = (r: Request) =>
    r.method() === 'POST' && new URL(r.url()).pathname === '/api/capture'

  test('an offline capture queues (queued confirmation, input cleared, pending count 1, nothing sent), then replays on reconnect with an Idempotency-Key', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/board')

    // Count every POST /api/capture so we can prove it does NOT fire while offline.
    const capturePosts: Request[] = []
    page.on('request', (r) => {
      if (isCapturePost(r)) capturePosts.push(r)
    })

    await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
    // The capture spine lives on the header mic now (« Parle à la maison » ▸ Classer).
    await page.locator('.app-head__ask').click()
    await expect(page.locator('.kit-modal.ask-sheet')).toBeVisible()
    await page.locator('.ask-sheet__modes button', { hasText: 'Classer' }).click()
    await page.locator('.capture-form input.edit-field__input').fill('Acheter du lait')

    // Go offline — the offline bar appearing confirms navigator.onLine now reads
    // false, exactly the signal writeWith checks to queue instead of send.
    await page.context().setOffline(true)
    await expect(page.locator('.offline-bar')).toBeVisible()

    await page.locator('.capture-form .edit-field__submit').click()

    // Queued to the outbox: a calm info line (not the error one), the input cleared
    // like a successful capture, and the offline bar's pending count at 1 — and
    // nothing was sent over the wire.
    await expect(page.locator('.status-msg--info', { hasText: 'Hors ligne' })).toBeVisible()
    await expect(page.locator('.status-msg--error')).toHaveCount(0)
    await expect(page.locator('.capture-form input.edit-field__input')).toHaveValue('')
    await expect(page.locator('.offline-bar__stamp', { hasText: '1 en attente' })).toBeVisible()
    expect(capturePosts.length).toBe(0)

    // Reconnect → the 'online' event triggers startOutbox's replay → the held POST
    // fires now, carrying its idempotency key. It never fired before this moment.
    await Promise.all([
      page.waitForRequest(isCapturePost, { timeout: 20_000 }),
      page.context().setOffline(false),
    ])
    expect(capturePosts.length).toBe(1)
    expect(capturePosts[0]?.headers()['idempotency-key']).toBeTruthy()

    // The replayed body is the raw text — routing stayed server-side, just deferred.
    const body = JSON.parse(capturePosts[0]!.postData() || '{}')
    expect(body.text).toBe('Acheter du lait')

    // And the outbox drains — the pending stamp clears once the write lands.
    await expect(page.locator('.offline-bar__stamp', { hasText: 'en attente' })).toHaveCount(0)
  })

  test('the mic stays offline-disabled — only the typed capture path is queueable', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/board')

    await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('.app-head__ask').click()
    await expect(page.locator('.kit-modal.ask-sheet')).toBeVisible()
    await page.locator('.ask-sheet__modes button', { hasText: 'Classer' }).click()

    await page.context().setOffline(true)
    await expect(page.locator('.offline-bar')).toBeVisible()

    // VoiceButton (Web Speech needs a live connection) is still disabled offline —
    // A-2 only unblocked the typed path.
    await expect(page.locator('.capture-form .capture__voice')).toBeDisabled()

    await page.context().setOffline(false)
  })

  // The PWA SHARE TARGET, same promise. /share was the one capture path still on raw
  // `api()` — no outbox — so sharing a link to Babillard with no signal threw the
  // capture away in silence: you tapped « Ajouter », the page said nothing, and the
  // line never existed (bmad/11 tier-1 seam #2, fixed 2026-08-27). The rule itself is
  // now enforced by src/lib/write-rule.test.ts; this proves the behaviour end to end.
  test('a share-target capture made offline queues instead of vanishing, then replays', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })

    const capturePosts: Request[] = []
    page.on('request', (r) => {
      if (isCapturePost(r)) capturePosts.push(r)
    })

    // The query-param fallback the page uses when the service worker's share cache is
    // empty — which is exactly the state a dev-server run is in.
    await page.goto('/share?text=' + encodeURIComponent('https://example.com/recette-de-tarte'))
    await expect(page.locator('.share-page')).toBeVisible()

    // NOTE: /share is a standalone scene OUTSIDE HubLayout, so it shows no offline
    // bar — the banner is rendered by the hub shell. Nothing here depends on the
    // banner; `setOffline` is what writeWith actually reads.
    await page.context().setOffline(true)

    // /share now MOUNTS the capture spine (seeded) rather than re-implementing it, so
    // the submit is CaptureForm's own — and so is the queued confirmation. That reuse is
    // the point: this path can no longer drift away from the ＋ spine's behaviour, which
    // is how it lost its outbox in the first place.
    await expect(page.locator('.share-page .capture-form input.edit-field__input')).toHaveValue(
      'https://example.com/recette-de-tarte',
    )
    await page.locator('.share-page .capture-form .edit-field__submit').click()

    // Offline is no longer a different, silent outcome: the same calm « gardé » line the
    // ＋ spine shows, the box cleared, and nothing over the wire.
    await expect(page.locator('.status-msg--info', { hasText: 'Hors ligne' })).toBeVisible()
    await expect(page.locator('.status-msg--error')).toHaveCount(0)
    await expect(page.locator('.share-page .capture-form input.edit-field__input')).toHaveValue('')
    expect(capturePosts.length).toBe(0)

    // Reconnect → the outbox replays the held capture with its idempotency key.
    await Promise.all([
      page.waitForRequest(isCapturePost, { timeout: 20_000 }),
      page.context().setOffline(false),
    ])
    expect(capturePosts.length).toBe(1)
    expect(capturePosts[0]?.headers()['idempotency-key']).toBeTruthy()
    expect(JSON.parse(capturePosts[0]!.postData() || '{}').text).toBe('https://example.com/recette-de-tarte')
  })
})


// ── folded from add-sheet-overflow.spec.ts ──────────────────────────────────────────────
test6.describe('add-sheet-overflow', () => {
  // A bottom sheet is a vertical surface — it must never scroll left/right, and nothing
  // inside it may bleed off the right edge. Guards two regressions:
  //   1. the whole sheet panning sideways once you scrolled down (old bug: overflow-y:auto
  //      but no overflow-x, so the cross axis computed to auto);
  //   2. a wide inner row (e.g. the one task form's « Quand ? » with its recurrence, season
  //      chips and checkboxes) running UNDER the right edge — invisible to a scrollWidth check because
  //      `.sheet` is `overflow-x:hidden`, so the clip hides it. See .sheet in
  //      styles/sheets/capture.css and the .cluster/.rail row primitives in styles/core.css.
  //
  // The measurement that catches #2 is a per-element bounding-rect check: for every
  // visible descendant, its right edge must not exceed the sheet's right edge. That sees
  // through the clip, which `scrollWidth - clientWidth` cannot. The check itself
  // (worstRightBleed/assertClean) lives in e2e/overflow.ts, shared with the
  // state-matrix suite.

  // Checked at both phone widths — content is tightest at 360.
  for (const width of [360, 390]) {
    test6(`board ＋ sheet never overflows sideways @${width}`, async ({ page, app }) => {
      await app.boot({ viewport: { width: width, height: 844 } })
      await page.goto('/board')
      await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })

      await page.locator('.add-fab').click()
      await expect(page.locator('.sheet.show')).toBeVisible()
      await expect(page.locator('.sheet > .cat-grid')).toBeVisible()

      // State 1 — the section chooser tile grid at rest.
      await assertClean(page, 'chooser grid')

      // …and after scrolling the sheet to the bottom (the original pan trigger).
      await page.evaluate(() => {
        const s = document.querySelector('.sheet') as HTMLElement | null
        if (s) s.scrollTop = s.scrollHeight
      })
      await settled(page)
      await assertClean(page, 'chooser grid, scrolled')

      // State 2 — open the « Note rapide » box's 📎, which unfolds a Cluster of three
      // memo chips (Mémo vocal · Dessiner · Photo). These were three full-width
      // buttons; as a wrapped chip row they must still stay inside the sheet at 360px.
      await page.locator('.addsheet__lead .memo-attach__btn').click()
      await expect(page.locator('.memo-attach__picks')).toBeVisible()
      await assertClean(page, 'note attach chip row')
      await page.locator('.addsheet__lead .memo-attach__btn').click()

      // State 3 — tap the « Tâches » tile: the ONE task form, one field and its folded layers.
      const todoTile = page.locator('.cat-pick[data-mode="todo"]')
      if (await todoTile.count()) {
        await todoTile.click()
        const form = page.locator('.addsheet__todo .task-form')
        await expect(form).toBeVisible()
        await assertClean(page, 'task form, folded')

        // State 4 — open « Quand ? » and make it recur weekly: the date, the rhythm, its
        // weekday chips, the season chips and the two checkboxes, the widest layer.
        await form.getByRole('button', { name: /^Quand/ }).click()
        await form.locator('.recur select').selectOption('weekly')
        await expect(form.locator('.recur__days')).toBeVisible()
        await assertClean(page, 'task form, « Quand ? » open and weekly')
        await form.getByRole('button', { name: /^Qui/ }).click()
        await assertClean(page, 'task form, « Qui ? » open')

        // State 4b — open the title's dropdown (checklists, then ideas). Each template row now carries a
        // `hint` line naming the items it would add (wrapping, two-line clamped) beside
        // a count badge — a text block that must wrap inside the row, never widen it.
        await page.locator('.addsheet__todo .combobox__caret').click()
        await expect(page.locator('.addsheet__todo .combobox__row-hint').first()).toBeVisible()
        await assertClean(page, 'todo template dropdown, item hints')

        // Picking a tile DRILLS IN — the chooser is replaced by that one form. Go back to
        // the tiles, or the next state's tile isn't on screen and its block silently skips.
        await page.locator('.sheet.show .sheet__back').click()
        await expect(page.locator('.cat-grid')).toBeVisible()
      }

      // State 5 — « Laisse un mot »: a face row, the composer field with its 📎, and
      // « Plus tard » unfolding four preset chips + a date/time pair. The densest row
      // stack in this sheet, and the one whose « Me le rappeler » chip is new.
      const motTile = page.locator('.cat-pick[data-mode="mot"]')
      if (await motTile.count()) {
        await motTile.click()
        await expect(page.locator('.mot-composer')).toBeVisible()
        await assertClean(page, 'mot composer')

        await page.locator('.mot-composer__sched > .btn').click()
        await expect(page.locator('.mot-composer__presets')).toBeVisible()
        await assertClean(page, 'mot composer, « Plus tard » open')
      }
    })
  }

  // « Depuis ce matin » (A-3) — a different sheet than the ＋ chooser above (opened
  // from the board greeting, not the FAB), so it gets its own pass through the same
  // per-element bounds check: a face + a sentence row family is exactly the shape
  // (a long meal/list-item text beside an avatar) that bleeds on a narrow phone.
  for (const width of [360, 390]) {
    test6(`« Depuis ce matin » sheet never overflows sideways @${width}`, async ({ page, app }) => {
      await app.boot({ viewport: { width: width, height: 844 } })
      await page.goto('/board')
      await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })

      await page.locator('.greet__btn').click()
      await expect(page.locator('.sheet.show')).toBeVisible()
      await expect(page.locator('.ledger__row').first()).toBeVisible()
      await assertClean(page, 'since-morning rows')
    })
  }

  // IdeasDrawer (C-14) — now the body of the /kitchen/idees `.scene`. Its SubTabs row
  // of five sources is exactly the "several pills in a row" shape that bleeds; each
  // source's body (a MealPool add-combobox row, a tap-to-reveal MealPlanPicker) is
  // checked too. The guard targets `.scene__body`, the scene's scroll box.
  const IDEAS_BOX = '.ideas-drawer .scene__body'
  for (const width of [360, 390]) {
    test6(`IdeasDrawer never overflows sideways @${width}`, async ({ page, app }) => {
      await app.boot({ viewport: { width: width, height: 844 } })
      await page.goto('/kitchen')
      await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })

      await page.locator('.kitchen__ideas-opener .btn--primary').click()
      await expect(page.locator(IDEAS_BOX)).toBeVisible()
      await assertClean(page, 'ideas drawer, Idées tab', IDEAS_BOX, 'auto')

      // Reveal a row's plan picker (slot chips + day chips — the widest inner row).
      await page.locator('.ideas-drawer .kitchen__idea-name').first().click()
      await expect(page.locator('.meal-plan-pick')).toBeVisible()
      await assertClean(page, 'ideas drawer, plan picker open', IDEAS_BOX, 'auto')

      // Sweep every other source tab.
      for (const label of ['Favoris', 'À utiliser bientôt', 'Proposé par']) {
        const tab = page.locator('.ideas-drawer .subtabs__opt', { hasText: label })
        await tab.click()
        await expect(tab).toHaveAttribute('aria-selected', 'true')
        await settled(page)
        await assertClean(page, `ideas drawer, ${label} tab`, IDEAS_BOX, 'auto')
      }
    })
  }
})


// ── folded from ask-sheet.spec.ts ──────────────────────────────────────────────
test.describe('ask-sheet', () => {
  // E-22 « Demande à la maison » — Playwright has no mic, so this exercises the
  // TYPED path (the EditField fallback), which shares its whole answer/degrade
  // machinery with the voice path (both call the same ask()). Mocks
  // /api/health (AI on/off) + /api/ask per test.
  test.use({ hasTouch: true })

  async function mockAsk(
    page: Page,
    respond: (question: string) => { answer: string | null; kind: string; degraded?: boolean },
    opts: { aiError?: string } = {},
  ) {
    await page.route('**/api/ask', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      let question = ''
      try {
        question = JSON.parse(route.request().postData() || '{}').question ?? ''
      } catch {
        /* no body */
      }
      const body = respond(question)
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (opts.aiError) headers['X-AI-Error'] = encodeURIComponent(opts.aiError)
      await route.fulfill({ status: 200, headers, body: JSON.stringify(body) })
    })
  }

  async function openAsk(page: Page) {
    await page.goto('/board')
    await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })
    await page.locator('.app-head__ask').click()
    // `.kit-modal` (not the generic dialog role): a few ALWAYS-MOUNTED `Sheet`s
    // (ProfilePicker, "Depuis ce matin", the ＋ AddSheet…) already carry
    // `role="dialog"` in the DOM even while closed (CSS-only show/hide), so a bare
    // `getByRole('dialog')` is ambiguous — `.kit-modal` is AskDialog's own shell.
    await expect(page.locator('.kit-modal.ask-sheet')).toBeVisible()
  }

  async function askTyped(page: Page, question: string) {
    await page.locator('.ask-sheet input.edit-field__input').fill(question)
    await page.locator('.ask-sheet .edit-field__submit').click()
  }

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  })

  test('the mic entry point opens AskDialog; the typed path answers with the domain-tagged card', async ({ page }) => {
    await mockAsk(page, () => ({ answer: 'Spaghetti mercredi soir.', kind: 'meal' }))
    await openAsk(page)

    await askTyped(page, 'Qu’est-ce qu’on mange mercredi ?')

    await expect(page.locator('.search__answer-text')).toHaveText('Spaghetti mercredi soir.')
    await expect(page.locator('.search__answer-kind')).toHaveText('Repas')
    // The auto-speak-once replay control is offered.
    await expect(page.locator('.ask-sheet__replay')).toBeVisible()
  })

  // An enumerated answer ("what's on the list?") comes back as a lead sentence + one
  // item per "- " line. It must render as a real <ul>, not a comma-wall in one <p>:
  // dropping the newlines into a paragraph is what made the answer unreadable.
  test('an enumerated answer renders as a lead sentence + a real list', async ({ page }) => {
    await mockAsk(page, () => ({
      answer: 'La liste contient 3 articles :\n- Lime\n- Citron\n- Pain',
      kind: 'list',
    }))
    await openAsk(page)

    await askTyped(page, 'Qu’est-ce qu’il y a sur la liste ?')

    await expect(page.locator('.search__answer-text')).toHaveText('La liste contient 3 articles :')
    await expect(page.locator('.search__answer-list li')).toHaveText(['Lime', 'Citron', 'Pain'])
  })

  test('the honest "je ne sais pas" degrade shows the search-everywhere link', async ({ page }) => {
    await mockAsk(page, () => ({ answer: null, kind: 'none' }))
    await openAsk(page)

    await askTyped(page, 'Une question sans réponse dans les données')

    await expect(page.locator('.search__asking')).toContainText('pas pu répondre')
    await expect(page.locator('.search__related-chip').first()).toBeVisible()
  })

  test('a model failure surfaces the X-AI-Error toast AND the card\'s "not what you wanted?" link', async ({ page }) => {
    await mockAsk(page, () => ({ answer: null, kind: 'none' }), { aiError: 'IA momentanément indisponible' })
    await openAsk(page)

    await askTyped(page, 'Une question quelconque')

    // The global X-AI-Error toast (lib/aiErrorToast — every /api/* caller shares it).
    await expect(page.locator('.ai-error-toast')).toBeVisible()
    await expect(page.locator('.ai-error-toast__msg')).toHaveText('IA momentanément indisponible')
    // …and the answer card still offers the "chercher partout" links, same as any
    // other couldn't-answer case.
    await expect(page.locator('.search__asking')).toContainText('pas pu répondre')
    await expect(page.locator('.search__related-chip').first()).toBeVisible()
  })

  // The account's free Workers AI allowance spent (2026-11-16): the toast used to print
  // Cloudflare's raw English (« 4006: you have used up your daily free allocation… »). It
  // now says why, in the household's language, and when it comes back; « Accepter » still
  // journals Cloudflare's own words for the operator.
  test('a spent AI quota reads as « L’IA se repose », not Cloudflare’s raw error, and the journal keeps the raw text', async ({ page }) => {
    const raw = '4006: you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare’s Workers Paid plan'
    await mockAsk(page, () => ({ answer: null, kind: 'none' }), { aiError: raw })
    const journal: unknown[] = []
    await page.route('**/api/ai-errors', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      journal.push(route.request().postDataJSON())
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    })
    await openAsk(page)
    await askTyped(page, 'Une question quelconque')

    const toast = page.locator('.ai-error-toast')
    await expect(toast.locator('.ai-error-toast__title')).toHaveText('L’IA se repose')
    await expect(toast.locator('.ai-error-toast__msg')).toContainText('quota IA gratuit du jour épuisé')
    await expect(toast).not.toContainText('4006')
    // The notice paints OVER the dialog that raised it (it used to sit under the
    // backdrop, unreachable until the dialog closed): accept it with the dialog open.
    await expect(page.locator('.kit-modal__backdrop')).toHaveCount(1)
    await toast.getByRole('button', { name: 'Accepter' }).click()
    await expect(toast).toHaveCount(0)
    await expect(page.locator('.kit-modal')).toHaveCount(1)
    expect(journal).toEqual([expect.objectContaining({ message: raw })])
  })

  test('closing the sheet unmounts it; reopening starts fresh (no stale question/answer)', async ({ page }) => {
    await mockAsk(page, () => ({ answer: 'Une réponse.', kind: 'note' }))
    await openAsk(page)
    await askTyped(page, 'Une question')
    await expect(page.locator('.search__answer-text')).toBeVisible()

    await page.locator('.kit-modal__close').click()
    await expect(page.locator('.kit-modal')).toHaveCount(0)

    await page.locator('.app-head__ask').click()
    await expect(page.locator('.ask-sheet input.edit-field__input')).toHaveValue('')
    await expect(page.locator('.search__answer-text')).toHaveCount(0)
  })

  test('AI off keeps the mic but drops « Demander » — « Classer » alone, with its degraded picker', async ({ page }) => {
    // The mic USED to hide entirely when AI was off (the sheet only asked questions, and
    // an answer needs the model). It now also carries « Classer », the capture WRITE
    // spine, whose degraded path — pick the type yourself — needs no model at all. Hiding
    // the mic on !aiEnabled would take the write spine offline with it, so instead the
    // sheet drops the « Demander » segment and opens straight on « Classer ».
    await page.route('**/api/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, app: 'Babillard', ai: false, aiAvailable: true, invite: false, sessionSecret: true }),
      })
    })
    await page.goto('/board')
    await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })

    // The mic reuses `.app-head__search` for its chrome, so scope the loupe assertion —
    // with the mic now present (it used to hide here) a bare `.app-head__search` matches
    // both and trips Playwright's strict mode.
    await expect(page.locator('.app-head__search:not(.app-head__ask)')).toBeVisible()
    await expect(page.locator('.app-head__ask')).toBeVisible()

    await page.locator('.app-head__ask').click()
    await expect(page.locator('.kit-modal.ask-sheet')).toBeVisible()
    // One thing left to do → no segment (a one-option segmented control is noise),
    // and the capture form is what's on screen. No question field, no answer card.
    await expect(page.locator('.ask-sheet__modes')).toHaveCount(0)
    await expect(page.locator('.capture-form')).toBeVisible()
    await expect(page.locator('.ask-sheet__mic')).toHaveCount(0)
  })

  test('the mic offers both « Demander » and « Classer », and switching modes drops the answer', async ({ page }) => {
    await mockAsk(page, () => ({ answer: 'Spaghetti jeudi.', kind: 'meal' }))
    await openAsk(page)

    // Demander is the default when AI is on: the big tap-to-talk mic + the typed fallback.
    await expect(page.locator('.ask-sheet__mic')).toBeVisible()
    await askTyped(page, 'on mange quoi jeudi ?')
    await expect(page.locator('.search__answer-text')).toContainText('Spaghetti jeudi.')

    // Switching to « Classer » swaps the surface to the capture spine and clears the
    // answer — a reply still sitting under a label that now means "file this" is exactly
    // the ambiguity the segment exists to remove.
    await page.locator('.ask-sheet__modes button', { hasText: 'Classer' }).click()
    await expect(page.locator('.capture-form')).toBeVisible()
    await expect(page.locator('.search__answer-text')).toHaveCount(0)
    await expect(page.locator('.ask-sheet__mic')).toHaveCount(0)

    // …and back.
    await page.locator('.ask-sheet__modes button', { hasText: 'Demander' }).click()
    await expect(page.locator('.ask-sheet__mic')).toBeVisible()
    await expect(page.locator('.capture-form')).toHaveCount(0)
  })

  // Phone-width overflow sweep (see CLAUDE.md "Horizontal overflow"): a per-element
  // bounds check against .kit-modal's right edge — sees through overflow-x:hidden,
  // which a scrollWidth check cannot. Checked with a long answer (the likeliest
  // place a new sheet bleeds) at both phone widths.
  for (const width of [360, 390]) {
    test(`AskDialog never overflows sideways @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await mockAsk(page, () => ({
        answer:
          'Une réponse assez longue pour vérifier que la carte réponse retombe à la ligne plutôt que de déborder à droite de la fenêtre, même sur un téléphone étroit.',
        kind: 'event',
      }))
      await openAsk(page)
      await askTyped(page, 'Une question assez longue pour tester le champ de texte au complet')
      await expect(page.locator('.search__answer-text')).toBeVisible()

      const { bleed, culprit } = await page.evaluate(() => {
        const modal = document.querySelector('.kit-modal') as HTMLElement | null
        if (!modal) return { bleed: -1, culprit: 'no .kit-modal' }
        const edge = modal.getBoundingClientRect().right
        let worst = 0
        let who = ''
        for (const el of Array.from(modal.querySelectorAll<HTMLElement>('*'))) {
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) continue // hidden/collapsed — ignore
          const over = r.right - edge
          if (over > worst) {
            worst = over
            who = (el.className || el.tagName).toString().slice(0, 80)
          }
        }
        return { bleed: worst, culprit: who }
      })
      expect(bleed, `"${culprit}" bleeds off the AskDialog's right edge`).toBeLessThanOrEqual(1)
    })
  }
})


// ── folded from sheets.spec.ts ──────────────────────────────────────────────
test8.describe('sheets', () => {
  // Visual capture of the overlay surfaces (sheets / modals) that screenshots.spec
  // can't reach — they only exist after an interaction. Phone format (these are
  // phone-first), day + night. Writes PNGs to e2e/screenshots for review; not
  // pixel-regression. Run: npx playwright test journey-capture.spec.ts

  const PHONE = { width: 390, height: 844 }

  const shoot = async (page: Page, name: string) => {
    await settled(page)
    await page.screenshot({ path: `e2e/screenshots/${name}.png` })
  }

  // Open the recipe book (behind the Recettes sub-tab) and a recipe modal.
  async function openRecipe(page: Page) {
    await page.locator('.subtabs__opt', { hasText: 'Recettes' }).click()
    // A recipe card now navigates STRAIGHT to the recipe view route
    // (/kitchen/recipe/:id) where the .recipe-modal lives — the old detail peek
    // (with its "Ouvrir la recette" button) was removed.
    await page.locator('.recipe-card').first().click()
    await page.locator('.recipe-modal').waitFor({ state: 'visible' })
  }

  for (const theme of ['day', 'night'] as Theme[]) {
    const sfx = theme === 'night' ? '-night' : ''

    test8(`sheet-add-capture${sfx}`, async ({ page, app }) => {
      await app.boot({ viewport: PHONE, route: '/board', state: { theme: theme, calm: true }, wait: '.hub, .page' })
      await page.locator('.add-fab').click()
      // The board ＋ hoists the « Note rapide » box to the top of the sheet, so the
      // note input is visible immediately (no tile to pick first).
      await page.locator('.addsheet__lead input.edit-field__input').waitFor({ state: 'visible' })
      await shoot(page, `sheet-add-capture-phone${sfx}`)
    })

    test8(`sheet-recipe${sfx}`, async ({ page, app }) => {
      await app.boot({ viewport: PHONE, route: '/kitchen', state: { theme: theme, calm: true }, wait: '.hub, .page' })
      await openRecipe(page)
      await shoot(page, `sheet-recipe-phone${sfx}`)
    })

    test8(`sheet-cook-full${sfx}`, async ({ page, app }) => {
      // From a parent profile, "Cuisiner" opens the whole-recipe full view (the
      // toddler stepper is reached from the kid kitchen instead — see coverage spec).
      await app.boot({ viewport: PHONE, route: '/kitchen', state: { theme: theme, calm: true }, wait: '.hub, .page' })
      await openRecipe(page)
      await page.locator('.recipe-actions .btn--primary').click() // Cuisiner
      await page.locator('.cook').waitFor({ state: 'visible' })
      await page.locator('.cook__full').waitFor({ state: 'visible' })
      await shoot(page, `sheet-cook-full-phone${sfx}`)
    })

    test8(`sheet-deals${sfx}`, async ({ page, app }) => {
      await app.boot({ viewport: PHONE, route: '/liste', state: { theme: theme, calm: true }, wait: '.hub, .page' })
      await page.locator('.add-fab').click() // flyer browser lives in the ＋ sheet now
      await page.getByRole('dialog').getByRole('button', { name: /Parcourir/ }).click()
      await page.locator('.scene').waitFor({ state: 'visible' })
      await page.locator('.deal-stores .chip', { hasText: 'lait' }).first().click()
      await page.locator('.deal-list').waitFor({ state: 'visible' }).catch(() => {})
      await shoot(page, `sheet-deals-phone${sfx}`)
    })

    test8(`sheet-pricematch${sfx}`, async ({ page, app }) => {
      await app.boot({ viewport: PHONE, route: '/liste', state: { theme: theme, calm: true }, wait: '.hub, .page' })
      // The row's picture opens the edit scene now (compact-rows pass); the per-item
      // deals lookup is the « Voir les rabais » button inside it. `button.` because a
      // row whose deal carries a clipping (« Lait », since 2026-09-10) shows the
      // picture as a ZOOM instead — its edit door is press-and-hold / ⚙ Avancé.
      await page.locator('button.list-row__img').first().click()
      await page.locator('.scene .li-edit').waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Voir les rabais' }).click()
      await page.locator('.scene').waitFor({ state: 'visible' })
      await page.locator('.deal-list').waitFor({ state: 'visible' }).catch(() => {})
      await shoot(page, `sheet-pricematch-phone${sfx}`)
    })

    test8(`sheet-cashier-grid${sfx}`, async ({ page, app }) => {
      await app.boot({ viewport: PHONE, route: '/liste', state: { theme: theme, calm: true }, wait: '.hub, .page' })
      await page.locator('.add-fab').click() // auto-pick (Meilleurs prix) lives in the ＋ sheet now
      await page.getByRole('button', { name: /Choisir les meilleurs/ }).click()
      await page.locator('.cashier').waitFor({ state: 'visible', timeout: 15_000 })
      await page.locator('.cashier__tile').first().waitFor({ state: 'visible' }).catch(() => {})
      await shoot(page, `sheet-cashier-grid-phone${sfx}`)
    })
  }

  // Day-only one-offs (forms / secondary states).
  test8('scene-add-event', async ({ page, app }) => {
    await app.boot({ viewport: PHONE, route: '/board', state: { calm: true }, wait: '.hub, .page' })
    await page.locator('.add-fab').click()
    // The board ＋ hoists capture to the top; the chooser below holds the override
    // tiles (event / chore / …). Pick the event tile BY NAME (capture is no longer a
    // tile, so positional .nth() would land on the wrong one). It's navigate-only —
    // it leaves the sheet for the full-screen /event/new scene.
    await page.locator('.cat-pick', { hasText: 'Rendez-vous' }).waitFor({ state: 'visible' })
    await Promise.all([
      page.waitForURL(/\/event\/new/),
      page.locator('.cat-pick', { hasText: 'Rendez-vous' }).click(),
    ])
    await page.locator('.scene input[type="date"]').waitFor({ state: 'visible' })
    await shoot(page, 'scene-add-event-phone')
  })

  test8('sheet-recipe-form', async ({ page, app }) => {
    await app.boot({ viewport: PHONE, route: '/kitchen', state: { calm: true }, wait: '.hub, .page' })
    // The recipe builder is a standalone route (the ＋ recipe tile just navigates here).
    await page.goto('/kitchen/recipe/new')
    await page.locator('.recipe-modal').waitFor({ state: 'visible' })
    await shoot(page, 'sheet-recipe-form-phone')
  })

  test8('sheet-cashier-peek', async ({ page, app }) => {
    await app.boot({ viewport: PHONE, route: '/liste', state: { calm: true }, wait: '.hub, .page' })
    await page.locator('.add-fab').click() // auto-pick (Meilleurs prix) lives in the ＋ sheet now
    await page.getByRole('button', { name: /Choisir les meilleurs/ }).click()
    await page.locator('.cashier').waitFor({ state: 'visible', timeout: 15_000 })
    // Random-access now: tap the tile of the item being scanned → its big proof peek
    // (no sequential present-stepper anymore). See CashierMode.
    await page.locator('.cashier__tile').first().click()
    await page.locator('.bigcard').waitFor({ state: 'visible' })
    await shoot(page, 'sheet-cashier-peek-phone')
  })

  test8('sheet-deals-store', async ({ page, app }) => {
    await app.boot({ viewport: PHONE, route: '/liste', state: { calm: true }, wait: '.hub, .page' })
    await page.locator('.add-fab').click() // flyer browser lives in the ＋ sheet now
    await page.getByRole('dialog').getByRole('button', { name: /Parcourir/ }).click()
    await page.locator('.scene').waitFor({ state: 'visible' })
    await page.locator('.deal-tabs .subtabs__opt', { hasText: 'magasin' }).click()
    await page.locator('.flyer-stores').waitFor({ state: 'visible' }).catch(() => {})
    await shoot(page, 'sheet-deals-store-phone')
  })

  test8('sheet-cook-ings', async ({ page, app }) => {
    await app.boot({ viewport: PHONE, route: '/kitchen', state: { calm: true }, wait: '.hub, .page' })
    await openRecipe(page)
    await page.locator('.recipe-actions .btn--primary').click() // Cuisiner
    await page.locator('.cook').waitFor({ state: 'visible' })
    await shoot(page, 'sheet-cook-ings-phone')
  })

  test8('routine-story', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize(PHONE)
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', calm: true, surface: 'mobile' })
    // Routines is Maison's default section — a bare /maison lands on the toddler
    // picture-card story picker.
    await page.goto('/maison')
    await page.locator('.kid__face').first().click() // pick a routine → the picture-card story
    await page.locator('.tdl-stage').waitFor({ state: 'visible' })
    await shoot(page, 'routine-story-phone')
  })

  test8('sheet-flyer', async ({ page, app }) => {
    await app.boot({ viewport: PHONE, route: '/liste', state: { calm: true }, wait: '.hub, .page' })
    await page.locator('.add-fab').click() // flyer browser lives in the ＋ sheet now
    await page.getByRole('dialog').getByRole('button', { name: /Parcourir/ }).click()
    await page.locator('.scene').waitFor({ state: 'visible' })
    await page.locator('.deal-tabs .subtabs__opt', { hasText: 'magasin' }).click()
    await page.locator('.flyer-store').first().click()
    await page.locator('.flyer-overlay').waitFor({ state: 'visible' })
    await shoot(page, 'sheet-flyer-phone')
  })

  // « Depuis ce matin » (A-3) — the only sheet in this file with real assertions
  // rather than a screenshot: the ⚠ calm guarantee (no cache/unread state once
  // closed) is a DOM fact (the row list unmounts on close), not a pixel.
  test8('sheet-since-morning: open -> rows -> close leaves no residue', async ({ page, app }) => {
    await app.boot({ viewport: PHONE, route: '/board', state: { calm: true }, wait: '.hub, .page' })
    await page.locator('.greet__btn').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    // One row per today-changes mock entry (list_item, meal, face-less event).
    await expect(page.locator('.ledger__row')).toHaveCount(3)
    await expect(page.getByText('Papa a ajouté du lait')).toBeVisible()
    await expect(page.getByText('Léa a proposé une pizza')).toBeVisible()
    await expect(page.getByText('Nouveau rendez-vous : Dentiste')).toBeVisible()
    await shoot(page, 'sheet-since-morning-phone')

    // Close — the query body unmounts (gcTime:0), so the rows leave the DOM at once,
    // not just slide off-screen behind the still-mounted `.sheet` shell. Every Sheet
    // instance is always-mounted (AddSheet, EntityDetailSheet…), so scope to the one
    // actually showing.
    await page.locator('.sheet.show .sheet__close').click()
    await expect(page.locator('.sheet.show')).toHaveCount(0)
    await expect(page.locator('.ledger__row')).toHaveCount(0)

    // Reopening re-fetches from cold (no stale "N new" carried over) — the same
    // three rows come back, proving the close wasn't a silent data loss either.
    await page.locator('.greet__btn').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    await expect(page.locator('.ledger__row')).toHaveCount(3)
  })
})
