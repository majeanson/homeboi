import { test, expect, type Locator, type Page } from '@playwright/test'
import { APP, settle, isApi, expectApi, panelsReady } from './interact'
import { mockApi, seedState, BASE, MMID, ROUTES } from './mocks'
import { test as test7, test as test8, test as test9, test as test10, test as test11, test as test13 } from './fixtures'
import { LEGACY_SUB, LEGACY_TAB, SETTINGS_TREE, SUB_LABEL_KEY } from '../src/lib/settingsNav'
import { fontsReady, settled } from './measure'

// JOURNEY — RÉGLAGES (review #43; was interactions-settings.spec.ts + config-panels-board.spec.ts + config-panels-kitchen.spec.ts + config-panels-liste.spec.ts + config-panels-maison.spec.ts + config-panels-system.spec.ts + settings-advanced.spec.ts + settings-aliases.spec.ts + settings-delete-undo.spec.ts + settings-sections.spec.ts + settings-tree.spec.ts + ai-toggle.spec.ts + sound-toggle.spec.ts).
//
// Interaction coverage, Réglages: its sub-tabs and the settings forms. The harness and its discipline are at the top of interact.ts:
// a form asserts the request it fires, an optimistic flow asserts what the user sees.

// ─────────────────────────── settings tabs ─────────────────────────────

test.describe('interactions-settings', () => {
  test.describe('settings tabs', () => {
    test('every sub-tab selects and shows its panel', async ({ page }) => {
      await APP('/settings')(page)
      await settle(page, '.operator__tabs')
      // Scope to the settings tab strip: each tab's panel now carries its own SubTabs
      // (role=tab) row, so an unscoped getByRole('tab') would also count the sub-tabs.
      const tabs = page.locator('.operator__tabs').getByRole('tab')
      const n = await tabs.count()
      // Découvrir (first/default) + the six themed tabs, one per hub section in the
      // canonical order: Le babillard, La cuisine, La liste, Les notes, Maison,
      // Système (Le cercle + Routines merged into one Maison tab — still seven
      // tabs total). Each themed tab stacks its sections as sub-sections behind its
      // « Régler » lens (so every section is still reachable).
      expect(n).toBe(7)
      for (let i = 0; i < n; i++) {
        await tabs.nth(i).click()
        await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true')
        await expect(page.locator('.operator__panel h2').first()).toBeVisible()
      }
    })
  })

  // ─────────────────────────── settings forms ────────────────────────────

  test.describe('settings forms', () => {
    test.beforeEach(async ({ page }) => {
      // Land on the default tab (Guide). It has no <button>/<form>, so each case
      // below can click its own tab and the panel locators wait for the target
      // panel to render — starting on a form-heavy tab would race the switch.
      await APP('/settings')(page)
      await settle(page, '.operator__tabs')
    })

    test('add a household member', async ({ page }) => {
      // Members live under Maison now (the merged Le cercle + Routines tab), on
      // its « La maisonnée » sub — Routines (the tab's default section) shows first.
      await page.locator('.operator__tabs').getByRole('tab', { name: 'Maison', exact: true }).click()
      await page.locator('.operator__subs').getByRole('tab', { name: 'La maisonnée', exact: true }).click()
      // The member-add box is the shared EditField (form.edit-field) inside the
      // members CARD — scoped by its #op-members anchor, since the pill stacks the
      // cercle groups (and their own EditField) under the same row.
      const form = page.locator('#op-members form.edit-field')
      await form.locator('input.input').first().fill('Mamie')
      await expectApi(page, 'POST', 'members', () => form.locator('button[type="submit"]').click())
    })

    test('add an event', async ({ page }) => {
      // Events live under Le babillard now (its first sub — the board IS the agenda).
      await page.locator('.operator__tabs').getByRole('tab', { name: 'Le babillard' }).click()
      // Adding now opens the full-screen event scene (the panel's inline form is
      // EDIT-only): "Ajouter un rendez-vous" navigates to /event/new with the same
      // EventForm — a scene, not a sheet, so its fields ride above the keyboard.
      // .first(): the agenda tab now stacks events + car + schedule, each with its own
      // .operator__add — the event one is first.
      await page.locator('.operator__add').first().click()
      await page.waitForURL(/\/event\/new/)
      const form = page.locator('.scene form.operator__inline-form')
      await form.locator('input.input').first().fill('Réunion parents')
      await form.locator('input[type="date"]').fill('2026-07-01')
      await expectApi(page, 'POST', 'events', () => form.locator('button[type="submit"]').click())
    })

    test('add a planned task', async ({ page }) => {
      // Tasks left Réglages for the board's Tâches view, whose « Tâche détaillée » button opens the one form.
      // A title alone would be a to-do; giving it a rhythm under « Quand ? » makes it a chore
      // (lib/taskTarget), with no type picked anywhere.
      await APP('/board?view=taches')(page)
      await page.getByRole('link', { name: 'Tâche détaillée' }).click()
      await page.waitForURL(/\/chore\/new/)
      const form = page.locator('.scene .task-form')
      await form.locator('input.input').first().fill('Balayer la cuisine')
      await form.getByRole('button', { name: /^Quand/ }).click()
      await form.locator('.recur select').selectOption('weekly')
      await expectApi(page, 'POST', 'tasks', () => form.locator('button[type="submit"]').click())
    })

    test('add a kid routine', async ({ page }) => {
      // Routines is Maison's own sub-section (and its default section) now —
      // deep-link to it (?tab=maison&sub=routines) so the routines panel renders.
      await APP('/settings?tab=maison&sub=routines')(page)
      await settle(page, '.operator__tabs')
      await page.locator('.operator__section', { hasText: 'Routines (mode enfant)' }).locator('.operator__add').click()
      await page.waitForURL(/\/routine\/new/)
      const form = page.locator('.scene .operator__routine-form')
      await form.locator('.mswitch__opt').first().click() // pick a child (for-who MemberPicker)
      await form.locator('input.input').first().fill('Routine du soir')
      await expectApi(page, 'POST', 'routines', () => form.locator('button[type="submit"]').click())
    })

    test('save the shopping postal code', async ({ page }) => {
      // Shopping config lives under La liste now (its first sub, « Magasinage »).
      await page.locator('.operator__tabs').getByRole('tab', { name: 'La liste', exact: true }).click()
      // The postal form is the shared EditField (form.edit-field) now.
      const form = page.locator('.operator__panel form.edit-field')
      await form.locator('input.input').first().fill('H2X 1Y4')
      await expectApi(page, 'PATCH', 'household', () => form.locator('button[type="submit"]').click())
    })

    test('add a ghost-list staple', async ({ page }) => {
      // Ghost tracking stacks under La liste ▸ « Historique & suivi »; ?focus= names its card.
      await APP('/settings?tab=liste&sub=history&focus=ghost')(page)
      await settle(page, '.operator__tabs')
      const form = page.locator('.operator__section', { hasText: 'Liste fantôme' }).locator('form.operator__inline-form')
      await form.locator('input.input').first().fill('Savon à vaisselle')
      await expectApi(page, 'PATCH', 'ghost', () => form.locator('button[type="submit"]').click())
    })

    test('a frequent buy is offered for tracking — one deliberate tap tracks it', async ({ page }) => {
      await APP('/settings?tab=liste&sub=history&focus=ghost')(page)
      await settle(page, '.operator__tabs')
      // Tracking is conscious: candidates sit apart from the tracked rows, and
      // nothing enters the set until this tap.
      const chip = page.locator('.ghost-admin__candidate-chips .chip').first()
      await expect(chip).toBeVisible()
      await expectApi(page, 'PATCH', 'ghost', () => chip.click())
    })

    test('rename a bought-item history entry to a generic name (merge)', async ({ page }) => {
      // The grocery-history list leads La liste ▸ « Historique & suivi ».
      await APP('/settings?tab=liste&sub=history&focus=history')(page)
      await settle(page, '.operator__tabs')
      // "Yogourt grec" is in the grocery history → rename it to the generic "Yogourt"
      // so quick-add folds it in and suggests the generic item.
      await page.locator('.ghost-admin__row', { hasText: 'Yogourt grec' }).getByRole('button', { name: 'Renommer' }).click()
      // The inline rename editor is now the shared EditField (form.edit-field).
      const form = page.locator('.ghost-admin__row form.edit-field')
      await form.locator('input.input').fill('Yogourt')
      const [req] = await Promise.all([
        page.waitForRequest(isApi('PATCH', 'list')),
        form.getByRole('button', { name: 'Enregistrer' }).click(),
      ])
      expect(JSON.parse(req.postData() || '{}')).toMatchObject({ historyKey: 'yogourt grec', renameTo: 'Yogourt' })
    })

    test('remove a bought-item history entry so quick-add stops suggesting it', async ({ page }) => {
      await APP('/settings?tab=liste&sub=history&focus=history')(page)
      await settle(page, '.operator__tabs')
      const [req] = await Promise.all([
        // « Retirer » holds the DELETE behind the undo toast now (deferred removal),
        // so it fires on commit after the 15 s hold (toast.tsx DEFAULT_UNDO_MS) — the
        // wait must sit ABOVE that, like the expectApi helper above.
        page.waitForRequest(isApi('DELETE', 'list'), { timeout: 20_000 }),
        page.locator('.ghost-admin__row', { hasText: 'Bananes' }).getByRole('button', { name: 'Retirer' }).click(),
      ])
      expect(JSON.parse(req.postData() || '{}')).toMatchObject({ historyKey: 'bananes' })
    })

    test('claim a tablet with a 6-digit code', async ({ page }) => {
      // Pairing lives under Système now (its first sub, « Tablettes jumelées »).
      await page.locator('.operator__tabs').getByRole('tab', { name: 'Système' }).click()
      const form = page.locator('.operator__claim form')
      await form.locator('input.input').first().fill('123456')
      await expectApi(page, 'POST', 'pair/claim', () => form.locator('button[type="submit"]').click())
    })

    test('generate the weekly recap', async ({ page }) => {
      // The AI recap sits with the week glance under Le babillard ▸ « Agenda & semaine ».
      await APP('/settings?tab=board&sub=events&focus=thisWeek')(page)
      await settle(page, '.operator__tabs')
      await expectApi(page, 'GET', 'recap', () => page.getByRole('button', { name: 'Générer le bilan' }).click())
      await expect(page.locator('.operator__panel')).toContainText('Belle semaine')
    })
  })
})

// ── folded from journey-settings.spec.ts ──────────────────────────────────────────────
test.describe('config-panels-board', () => {
  // Réglages config panels, Le babillard (« La rentrée »). Each test asserts the write fires AND carries the right
  // field: why a settings panel needs that is written out above `panelsReady` in interact.ts.

  test.beforeEach(async ({ page }) => panelsReady(page))

  // D-17 « La rentrée » (bmad/10) — SchoolYearSection stacks under the SAME 'events'
  // pill as EventsSection (Réglages ▸ Le babillard ▸ Rendez-vous, C-15 rule: a new
  // setting merges into an existing sub). Same PATCH /api/household pattern as above.
  test('setting school-year bounds patches household with schoolYear', async ({ page }) => {
    await page.goto('/settings?tab=board&sub=events')
    const section = page.locator('#operator-panel')
    await expect(section.getByRole('heading', { name: 'Année scolaire' })).toBeVisible()
    await section.getByLabel('Rentrée (premier jour)').fill('2026-09-01')
    await section.getByLabel('Dernier jour').fill('2027-06-18')
    const [req] = await Promise.all([
      page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
      section.getByRole('button', { name: 'Enregistrer' }).click(),
    ])
    const body = JSON.parse(req.postData() || '{}') as {
      schoolYear?: { firstDay: number; lastDay: number; breaks: unknown[] }
    }
    expect(body.schoolYear).toBeTruthy()
    expect(body.schoolYear!.firstDay).toBeLessThan(body.schoolYear!.lastDay)
    expect(Array.isArray(body.schoolYear!.breaks)).toBe(true)
  })

  // The READ side of the same feature: a household whose school-year bounds make
  // TOMORROW la rentrée must show the board's 🎒 qualifier line — silent every other
  // day by design (lib/year.schoolDayKind), so this is the one day it's provable.
  test('a household schoolYear with tomorrow as la rentrée shows the board Demain 🎒 line', async ({ page }) => {
    await page.clock.setFixedTime(new Date(BASE * 1000))
    await mockApi(page)
    const rentree = MMID + 24 * 3600 // tomorrow, local midnight — MMID's weekday is a Sunday, so +1 day is a Monday
    await page.route('**/api/household', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          name: 'Famille',
          postal: 'H2X 1Y4',
          includedStores: [],
          aiEnabled: true,
          schoolYear: { firstDay: rentree, lastDay: rentree + 250 * 24 * 3600, breaks: [] },
        }),
      })
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/board')
    await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
    await expect(page.locator('.tomorrow-school')).toContainText('École demain', { timeout: 15_000 })
  })
})


// ── folded from journey-settings.spec.ts ──────────────────────────────────────────────
test.describe('config-panels-kitchen', () => {
  // Réglages config panels, La cuisine (meal slots, réserve, Jours affichés). Each test asserts the write fires AND carries the right
  // field: why a settings panel needs that is written out above `panelsReady` in interact.ts.

  test.beforeEach(async ({ page }) => panelsReady(page))

  // Réglages ▸ Cuisine (tab 'recipes') shows one sub-section at a time behind a SubTabs
  // row (tags / pills / measures / meal-slots / réserve). Deep-link straight to the sub
  // (?tab=recipes&sub=<key>) so only that section renders in the panel, and scope
  // assertions to the tabpanel (#operator-panel).

  test('hiding a meal slot patches household with the hidden slot', async ({ page }) => {
    await page.goto('/settings?tab=recipes&sub=meals')
    const section = page.locator('#operator-panel')
    await expect(section).toBeVisible()
    // Every slot starts « Affiché » (no mealHidden in the fixture). Toggling the first
    // one off saves the whole household setting — a whole-array PATCH via useWrite.
    const [req] = await Promise.all([
      page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
      section.getByRole('button', { name: 'Affiché' }).first().click(),
    ])
    const body = JSON.parse(req.postData() || '{}') as { mealHidden?: string[] }
    expect(Array.isArray(body.mealHidden)).toBe(true)
    expect(body.mealHidden!.length).toBe(1)
    // The button flips to « Masqué » optimistically.
    await expect(section.getByRole('button', { name: 'Masqué' })).toHaveCount(1)
  })

  test('adding a réserve location patches household with the new list', async ({ page }) => {
    await page.goto('/settings?tab=recipes&sub=reserve')
    const section = page.locator('#operator-panel')
    await expect(section).toBeVisible()
    await section.getByLabel('Ajouter un emplacement…').fill('Congélateur du sous-sol')
    const [req] = await Promise.all([
      page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
      // EditField submits on Enter (its submit button also works); Enter is simplest.
      section.getByLabel('Ajouter un emplacement…').press('Enter'),
    ])
    const body = JSON.parse(req.postData() || '{}') as { reserveLocations?: { name: string }[] }
    expect(Array.isArray(body.reserveLocations)).toBe(true)
    expect(body.reserveLocations!.some((l) => l.name === 'Congélateur du sous-sol')).toBe(true)
  })

  // « Jours affichés » — the rolling meal-plan window, added 2026-08-27 with bmad/11
  // tier-1 seam #1 (a Tuesday-anchored block could not reach the coming weekend from a
  // Sunday evening). It stacks under the SAME 'meals' pill as the slot panel above
  // (C-15), so this also asserts the two sections coexist there.
  test('« Jours affichés » patches household with the chosen window', async ({ page }) => {
    await page.goto('/settings?tab=recipes&sub=meals')
    const section = page.locator('#operator-panel')
    await expect(section).toBeVisible()

    // The window select lives in its own section under the slot list.
    const select = section.getByRole('combobox', { name: 'La grille montre' })
    await expect(select).toBeVisible()
    // The fixture household has never set one, so it reads the default.
    await expect(select).toHaveValue('10')

    const [req] = await Promise.all([
      page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
      select.selectOption('14'),
    ])
    const body = JSON.parse(req.postData() || '{}') as { mealWindowDays?: number }
    expect(body.mealWindowDays).toBe(14)
    await expect(select).toHaveValue('14')
  })

  test('the window picker only offers what the rest of the app supports', async ({ page }) => {
    // The bounds are load-bearing, not taste: below 7 the toddler kitchen's
    // week.slice(0, 7) would drop days; above 14 the AI snapshot (ask.ts, today+14d)
    // would stop seeing the plan. If someone widens the picker, they have to fix
    // those surfaces first — so the offered set is pinned here.
    await page.goto('/settings?tab=recipes&sub=meals')
    const select = page.locator('#operator-panel').getByRole('combobox', { name: 'La grille montre' })
    await expect(select).toBeVisible()
    const values = await select.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))
    expect(values).toEqual(['7', '10', '14'])
  })
})


// ── folded from journey-settings.spec.ts ──────────────────────────────────────────────
test.describe('config-panels-liste', () => {
  // Réglages config panels, La liste (stores, aisle order). Each test asserts the write fires AND carries the right
  // field: why a settings panel needs that is written out above `panelsReady` in interact.ts.

  test.beforeEach(async ({ page }) => panelsReady(page))

  // ─────────────────────────────────────────────────────────────────────────────
  // Réglages ▸ La liste — « Mes magasins » and « Ordre des allées ». Both persist on
  // /api/household like the kitchen panels above, and neither had a behavioural test.
  // This class of panel fails SILENTLY when mis-wired: every control here flips
  // optimistically, so the row looks saved whether or not the write ever left. That
  // is the same shape as the two defects this repo has already shipped and caught by
  // hand (NoteEditor's swallowed auto-save, the trip cover that could never be set).

  test('excluding a store patches household with the remaining allowlist', async ({ page }) => {
    await page.goto('/settings?tab=liste&sub=shop&focus=storeFilter')
    const section = page.locator('#operator-panel')
    // The flyer fixture holds Super C + IGA (two IGA flyers fold to one store row),
    // sorted by merchant — so row 0 is IGA. The household has includedStores: [],
    // which the panel reads as « unconfigured = every store kept », so each row
    // starts « Inclus » and toggling one OFF is the write.
    const row = section.locator('.store-filter__row').first()
    await expect(row).toBeVisible()
    const [req] = await Promise.all([
      page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
      row.getByRole('button', { name: 'Inclus', exact: true }).click(),
    ])
    const body = JSON.parse(req.postData() || '{}') as { includedStores?: string[] }
    // The allowlist is sent WHOLE (not a delta), keyed by lowercased merchant.
    expect(body.includedStores).toEqual(['super c'])
    await expect(row.getByRole('button', { name: 'Exclu', exact: true })).toBeVisible()
  })

  test('the à-la-caisse flag is independent of the include allowlist', async ({ page }) => {
    // The two flags are deliberately separate fields (migration 0066): « Inclus »
    // governs whether a store reaches deal/flyer lookups at all, « À la caisse »
    // only hides its deals from the till surface — the store you shop at yourself.
    // Wiring the till toggle into includedStores would silently drop that store's
    // deals everywhere, which is exactly the mistake a screenshot cannot see.
    await page.goto('/settings?tab=liste&sub=shop&focus=storeFilter')
    const row = page.locator('#operator-panel').locator('.store-filter__row').first()
    await expect(row).toBeVisible()
    const [req] = await Promise.all([
      page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
      row.getByRole('button', { name: 'À la caisse : Oui' }).click(),
    ])
    const body = JSON.parse(req.postData() || '{}') as {
      cashierExcludedStores?: string[]
      includedStores?: string[]
    }
    expect(body.cashierExcludedStores).toEqual(['iga'])
    // The include allowlist must NOT ride along on this PATCH.
    expect(body.includedStores).toBeUndefined()
  })

  test('« Remettre l’ordre de départ » patches household with the full aisle order', async ({ page }) => {
    // The aisle order is otherwise reorderable only by dragging, so the reset button
    // is the one mouse/keyboard-reachable write in this panel — and the only handle
    // a test can pull without simulating a pointer drag.
    await page.goto('/settings?tab=liste&sub=shop&focus=aisleOrder')
    const section = page.locator('#operator-panel')
    // The reset now confirms first (2026-09-03 predictability audit — a one-tap
    // factory reset sharing undo's icon, with no confirm, was finding #1).
    await section.getByRole('button', { name: 'Remettre l’ordre de départ' }).click()
    const [req] = await Promise.all([
      page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
      page.locator('.confirm').getByRole('button', { name: 'Remettre l’ordre de départ', exact: true }).click(),
    ])
    const body = JSON.parse(req.postData() || '{}') as { aisleOrder?: string[] }
    expect(Array.isArray(body.aisleOrder)).toBe(true)
    // Reorder-only: the whole orderable set is sent, and 'autres' is never in it
    // (it is pinned last by aisleRanks, and the panel renders it inert).
    expect(body.aisleOrder!.length).toBeGreaterThan(1)
    expect(body.aisleOrder).not.toContain('autres')
    expect(new Set(body.aisleOrder!).size).toBe(body.aisleOrder!.length)
  })
})


// ── folded from journey-settings.spec.ts ──────────────────────────────────────────────
test.describe('config-panels-maison', () => {
  // Réglages config panels, Maison (templates, routines, members, chores, schedule, groups). Each test asserts the write fires AND carries the right
  // field: why a settings panel needs that is written out above `panelsReady` in interact.ts.

  test.beforeEach(async ({ page }) => panelsReady(page))

  // ─────────────────────────────────────────────────────────────────────────────
  // Réglages ▸ Maison — « Listes à compléter » (the todo templates) and the routine
  // moment-of-day chip. The templates panel is the heaviest uncovered writer in
  // Réglages: create / rename / delete / reorder / duplicate all POST or PATCH
  // /api/todo-templates, and every one of them is fire-and-forget (`void write(...)`
  // with a swallowed .catch), so nothing on screen changes if the write is lost.
  //
  // The panel is now a ROW PER LIST (name + item count + ✏/🗑); everything that edits
  // one list lives on its own scene, /liste-modele/:id — so the create test stays here
  // and the rename test goes there.

  test('adding a todo template posts it', async ({ page }) => {
    await page.goto('/settings?tab=maison&focus=todoTemplates')
    const section = page.locator('#operator-panel')
    const add = section.getByLabel('Nom de la liste').last()
    await expect(add).toBeVisible()
    await add.fill('Sac de piscine')
    const [req] = await Promise.all([
      page.waitForRequest(isApi('POST', 'todo-templates'), { timeout: 20_000 }),
      add.press('Enter'),
    ])
    const body = JSON.parse(req.postData() || '{}') as { title?: string; items?: unknown[] }
    expect(body.title).toBe('Sac de piscine')
    // A new template starts empty — items is sent, not left undefined, so the server
    // never has to guess (the JSON column is NOT NULL, defaulted '[]').
    expect(body.items).toEqual([])
  })

  test('a list row opens its editor scene', async ({ page }) => {
    await page.goto('/settings?tab=maison&focus=todoTemplates')
    const section = page.locator('#operator-panel')
    // The row says what the list IS without opening anything: its name, and the count
    // it actually lands (tpl1 is 2 plain items + a ref to tpl2's 2 = 4).
    const row = section.getByRole('button', { name: 'Avant de partir', exact: true })
    await expect(row).toBeVisible()
    await expect(section.getByText('4 éléments')).toBeVisible()
    // The ✏ is the door (the name is its mouse-convenience twin) — same scene.
    await section.getByRole('button', { name: 'Modifier — Avant de partir' }).click()
    await expect(page).toHaveURL(/\/liste-modele\/tpl1/)
    // The scene is a LAZY route: 15 s is the first-visit budget (meal-order, kitchen-meal-plan).
    await expect(page.getByLabel('Ajouter un élément')).toBeVisible({ timeout: 15_000 })
    // …and it STAYS. This test's reds were read as a cold compile until 2026-11-05: Réglages
    // stays mounted while the chunk loads, and the ?focus= timer navigated back to it.
    await page.waitForTimeout(400)
    await expect(page).toHaveURL(/\/liste-modele\/tpl1/)
  })

  test('deleting a list template is HELD behind « Annuler » — the row hides at once, the DELETE waits, undo is the same row', async ({ page }) => {
    // It used to DELETE at once and re-POST a copy on undo — a NEW id, so every other
    // list that included this one was left with a dangling ref (2026-11-05, solidify
    // 1.7). Now useDeferredRemoval: nothing is written until the toast commits.
    const deletes: string[] = []
    await page.route('**/api/todo-templates', (route) => {
      if (route.request().method() === 'DELETE') deletes.push(JSON.parse(route.request().postData() || '{}').id)
      return route.fallback()
    })
    await page.goto('/settings?tab=maison&focus=todoTemplates')
    const section = page.locator('#operator-panel')
    const row = section.getByRole('button', { name: 'Avant de partir', exact: true })
    await expect(row).toBeVisible()
    await section.getByRole('button', { name: 'Supprimer — Avant de partir' }).click()
    await expect(row).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible()
    expect(deletes).toEqual([])

    await page.getByRole('button', { name: 'Annuler' }).click()
    await expect(section.getByRole('button', { name: 'Avant de partir', exact: true })).toBeVisible()
    // Proving nothing happened: nothing marks an absence, so give it the time it would have taken.
    await page.waitForTimeout(400)
    expect(deletes).toEqual([])
  })

  test('renaming a todo template patches it by id', async ({ page }) => {
    await page.goto('/liste-modele/tpl1')
    const section = page.locator('.scene')
    // tpl1 is « Avant de partir » in the fixture; the scene's title is an inline
    // editable field. The id must ride along or the rename lands on the wrong list.
    const name = section.getByLabel('Nom de la liste').first()
    await expect(name).toHaveValue('Avant de partir')
    await name.fill('Avant de sortir')
    const [req] = await Promise.all([
      page.waitForRequest(isApi('PATCH', 'todo-templates'), { timeout: 20_000 }),
      name.blur(),
    ])
    const body = JSON.parse(req.postData() || '{}') as { id?: string; title?: string }
    expect(body.id).toBe('tpl1')
    expect(body.title).toBe('Avant de sortir')
  })

  test('the routine moment chip patches that routine’s timeOfDay', async ({ page }) => {
    await page.goto('/settings?tab=maison&sub=routines&focus=routines')
    const section = page.locator('#operator-panel')
    // « Matin » (r1) starts timeOfDay 'morning'; the chip cycles
    // anytime → matin → après-midi → soir → anytime, one write per tap. The routineId
    // must ride along — the cue is per-routine, and the panel lists several.
    const chip = section.getByRole('button', { name: /^Moment :/ }).first()
    await expect(chip).toBeVisible()
    const [req] = await Promise.all([
      page.waitForRequest(isApi('PATCH', 'routines'), { timeout: 20_000 }),
      chip.click(),
    ])
    const body = JSON.parse(req.postData() || '{}') as { routineId?: string; timeOfDay?: string | null }
    expect(body.routineId).toBe('r1')
    // 'morning' is index 0 of ROUTINE_TODS, so one tap advances to the next cue —
    // whatever it is named, it must not stay 'morning' and must not be omitted.
    expect(body).toHaveProperty('timeOfDay')
    expect(body.timeOfDay).not.toBe('morning')
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // Réglages ▸ Maison ▸ « La maisonnée » and Réglages ▸ Système ▸ « Tablettes ».
  // Member admin is the most consequential panel in Réglages (it is operator-only
  // and kiosk-gated for that reason) and had no write test at all; the household
  // name and the tablet label are both blur-committed fields, the shape most prone
  // to saving nothing while looking saved.

  test('adding a member posts name, child flag and colour', async ({ page }) => {
    await page.goto('/settings?tab=maison&sub=members')
    const section = page.locator('#operator-panel')
    const add = section.getByLabel('Nom', { exact: true }).last()
    await expect(add).toBeVisible()
    await add.fill('Mathis')
    const [req] = await Promise.all([
      page.waitForRequest(isApi('POST', 'members'), { timeout: 20_000 }),
      add.press('Enter'),
    ])
    const body = JSON.parse(req.postData() || '{}') as { name?: string; isChild?: boolean; color?: string }
    expect(body.name).toBe('Mathis')
    // A member is created with a colour already chosen — the avatar disc and every
    // face tint downstream read it, so leaving it to the server would flash a
    // default. isChild is sent explicitly rather than inferred.
    expect(typeof body.isChild).toBe('boolean')
    expect(body.color).toBeTruthy()
  })

  test('renaming the maisonnée patches household on blur', async ({ page }) => {
    await page.goto('/settings?tab=maison&sub=members')
    const field = page.locator('#operator-panel').getByLabel('Nom de la maisonnée')
    await expect(field).toHaveValue('Maison Tremblay')
    await field.fill('Famille Tremblay-Roy')
    const [req] = await Promise.all([
      page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
      field.blur(),
    ])
    const body = JSON.parse(req.postData() || '{}') as { name?: string }
    expect(body.name).toBe('Famille Tremblay-Roy')
  })

  // THE SECOND SWEEP, Maison half: see interact.ts. Navigates by SECTION (?tab=&focus=) and
  // scopes to the card's #op-<key> anchor, never to a pill label.

  test('renaming a member patches it by id, keeping colour and child flag', async ({ page }) => {
    await page.goto('/settings?tab=maison&focus=members')
    const card = page.locator('#op-members')
    await card.getByRole('button', { name: 'Modifier la personne' }).first().click()
    const field = card.locator('.member-card--editing').getByLabel('Nom', { exact: true })
    await expect(field).toHaveValue('Maman')
    await field.fill('Maman R.')
    const [req] = await Promise.all([
      page.waitForRequest(isApi('PATCH', 'members'), { timeout: 20_000 }),
      field.press('Enter'),
    ])
    const body = JSON.parse(req.postData() || '{}') as { id?: string; name?: string; colour?: string; isChild?: boolean }
    expect(body.id).toBe('m1')
    expect(body.name).toBe('Maman R.')
    // A rename must not silently reset the face: colour + child flag ride along.
    expect(body.colour).toBeTruthy()
    expect(typeof body.isChild).toBe('boolean')
  })

  test('a season seed posts a dated upkeep with its cadence and lead time', async ({ page }) => {
    // The seeds moved to the Tâches view with the rest of the browsing, behind a button in its action row.
    await page.goto('/board?view=taches')
    await page.locator('.tasks-view__actions').getByRole('button', { name: 'Idées de saison' }).click()
    const card = page.locator('.season-seeds')
    const [req] = await Promise.all([
      page.waitForRequest(isApi('POST', 'tasks'), { timeout: 20_000 }),
      card.getByRole('button', { name: /Poser les pneus/ }).click(),
    ])
    const body = JSON.parse(req.postData() || '{}') as { kind?: string; title?: string; at?: number; recur?: unknown; leadSeconds?: number }
    expect(body.kind).toBe('upkeep')
    expect(body.title).toBe('Poser les pneus d’hiver / d’été')
    expect(typeof body.at).toBe('number')
    expect(body.recur).toEqual({ freq: 'monthly', interval: 6 })
    // A-6: an annual ritual gets a week-scale « Bientôt » — three weeks for the tires.
    expect(body.leadSeconds).toBe(3 * 7 * 86_400)
  })

  // A TimeField (components/TimeField.tsx) is a group of two selects named by its label.
  async function setTime(form: Locator, label: string, h: number, m: number) {
    const group = form.getByRole('group', { name: label, exact: true })
    await group.getByRole('combobox', { name: 'Heure' }).selectOption(String(h))
    await group.getByRole('combobox', { name: 'Minute' }).selectOption(String(m))
  }

  test('a new work-hours block posts the member, the minutes and holdsCar', async ({ page }) => {
    await page.goto('/settings?tab=maison&focus=schedule')
    await page.locator('#op-schedule').getByRole('button', { name: 'Ajouter un horaire' }).click()
    const form = page.locator('.operator__inline-form').last()
    await form.getByRole('button', { name: 'Papa', exact: true }).click()
    await setTime(form, 'De', 8, 0)
    await setTime(form, 'à', 16, 30)
    const [req] = await Promise.all([
      page.waitForRequest(isApi('POST', 'schedule'), { timeout: 20_000 }),
      form.getByRole('button', { name: 'Ajouter', exact: true }).click(),
    ])
    const body = JSON.parse(req.postData() || '{}') as { memberId?: string; startMin?: number; endMin?: number; weekdays?: number[]; holdsCar?: boolean }
    expect(body.memberId).toBe('m2')
    // Minutes since midnight, not "HH:MM" — the car planner does arithmetic on these.
    expect(body.startMin).toBe(8 * 60)
    expect(body.endMin).toBe(16 * 60 + 30)
    expect(Array.isArray(body.weekdays)).toBe(true)
    expect(typeof body.holdsCar).toBe('boolean')
  })

  test('deleting a cercle group confirms first, then deletes it by id', async ({ page }) => {
    await page.route('**/api/cercle**', (route) =>
      route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/cercle'
        ? route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              contacts: [],
              links: [],
              members: [],
              groups: [{ id: 'g1', name: 'Les cousins', kind: 'family', colour: null, memberKeys: [] }],
            }),
          })
        : route.fallback(),
    )
    await page.goto('/settings?tab=maison&focus=cercleGroups')
    const card = page.locator('#op-cercleGroups')
    await card.getByRole('button', { name: 'Supprimer le groupe — Les cousins' }).click()
    // A heavy delete: the confirm dialog, not the undo toast.
    const dialog = page.locator('.confirm')
    await expect(dialog).toBeVisible()
    const [req] = await Promise.all([
      page.waitForRequest(isApi('DELETE', 'cercle-groups'), { timeout: 20_000 }),
      dialog.getByRole('button', { name: /^(Supprimer|Confirmer)$/ }).click(),
    ])
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ id: 'g1' })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // THE LAST TWO, closed 2026-09-09 (REVIEW-PASS.md's final open box).
  //
  // Both had stood as "needs a richer harness than a body assertion". Neither did — and
  // the note explaining why was itself wrong about the mechanism: the photo upload was
  // filed as "a multipart POST the mock can't shape without a real file", but
  // `uploadMedia` POSTs a RAW BLOB (lib/uploadMedia.ts), and Playwright synthesises a
  // file from a Buffer. The blocker was a description, not a limitation. Grep the claim.

  test('deleting a member asks first, says what is lost, and only then DELETEs by id', async ({ page }) => {
    let deletes = 0
    await page.route('**/api/members**', async (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback()
      deletes += 1
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    })
    await page.goto('/settings?tab=maison&focus=members')
    const card = page.locator('#op-members')
    await card.getByRole('button', { name: 'Supprimer la personne' }).first().click()

    // This is a CASCADE (their routines go; rendez-vous and tâches detach), so it is
    // confirm-gated rather than undo-gated. Two halves, and the first is the one that
    // actually protects someone: backing out must send nothing at all.
    const dialog = page.locator('.confirm')
    await expect(dialog).toBeVisible()
    // …and the dialog must NAME the loss — `confirmCopy.test.ts` owns that rule for the
    // string; this proves the string is what reaches the screen.
    await expect(dialog.locator('.confirm__msg')).toContainText('routines')
    await dialog.getByRole('button', { name: 'Annuler' }).click()
    await expect(dialog).toHaveCount(0)
    expect(deletes, 'cancelling a cascade must not send the DELETE').toBe(0)

    await card.getByRole('button', { name: 'Supprimer la personne' }).first().click()
    const [req] = await Promise.all([
      page.waitForRequest(isApi('DELETE', 'members'), { timeout: 20_000 }),
      page.locator('.confirm').getByRole('button', { name: 'Supprimer la personne' }).click(),
    ])
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ id: 'm1' })
  })
})


// ── folded from journey-settings.spec.ts ──────────────────────────────────────────────
test.describe('config-panels-system', () => {
  // Réglages config panels, Système (tablets, guest links, AI, photos). Each test asserts the write fires AND carries the right
  // field: why a settings panel needs that is written out above `panelsReady` in interact.ts.

  test.beforeEach(async ({ page }) => panelsReady(page))

  test('renaming a paired tablet patches it by id', async ({ page }) => {
    await page.goto('/settings?tab=settings&sub=tablets')
    const section = page.locator('#operator-panel')
    // The pairing form above uses the same field label, so scope to the paired list.
    const list = section.locator('.operator__section', { hasText: 'Tablettes jumelées' })
    await list.getByRole('button', { name: 'Renommer la tablette' }).first().click()
    const field = list.getByLabel('Nom de la tablette')
    await expect(field).toBeVisible()
    await field.fill('Tablette du salon')
    const [req] = await Promise.all([
      page.waitForRequest(isApi('PATCH', 'pair/devices'), { timeout: 20_000 }),
      field.press('Enter'),
    ])
    const body = JSON.parse(req.postData() || '{}') as { id?: string; label?: string }
    // The id must ride along: a household can have several tablets, and the panel
    // renders them as identical rows.
    expect(body.id).toBe('d1')
    expect(body.label).toBe('Tablette du salon')
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // THE SECOND SWEEP (2026-09-08). Re-measured after the 28 → 14 merge: of the 17
  // panels that write, these nine still asserted nothing — a settings card commits
  // optimistically, so each read « saved » whether or not its write ever left.
  // Every test below navigates by SECTION (?tab=&focus=, the address that survives a
  // pill reshuffle) and scopes to the card's #op-<key> anchor, never to a pill label.
  // Each was run against a planted bug (the id dropped from the body, the endpoint
  // misspelled) and seen to fail before it was trusted.
  //
  // Deferred deletes (a device revoke, a photo) HOLD their write behind the undo
  // toast; the test asserts the hold (nothing sent), then fires `pagehide` — the
  // teardown flush every held write commits on (lib/toast) — and asserts the write.
  // ─────────────────────────────────────────────────────────────────────────────

  const flushHeldWrites = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('pagehide')))

  test('revoking a paired tablet is held behind the undo, then posts revokeId on teardown', async ({ page }) => {
    let posts = 0
    await page.goto('/settings?tab=settings&focus=devices')
    await page.route('**/api/pair/devices**', async (route) => {
      if (route.request().method() === 'GET') return route.fallback()
      posts += 1
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    })
    const card = page.locator('#op-devices')
    await card.getByRole('button', { name: 'Révoquer' }).first().click()
    await expect(page.locator('.undo-toast')).toBeVisible()
    // Held: a mis-tap must cost nothing, so nothing has left yet.
    expect(posts).toBe(0)
    const [req] = await Promise.all([page.waitForRequest(isApi('POST', 'pair/devices'), { timeout: 20_000 }), flushHeldWrites(page)])
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ revokeId: 'd1' })
  })

  test('revoking a live guest link posts revokeId (the token dies at once)', async ({ page }) => {
    await page.route('**/api/guest-links**', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              links: [{ id: 'l1', kind: 'sitter', target_key: null, standing: 0, label: 'Mamie', created_at: BASE, expires_at: BASE + 86_400 }],
            }),
          })
        : route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    )
    await page.goto('/settings?tab=settings&focus=guestLinks')
    const list = page.locator('.operator__guest-links')
    await expect(list).toBeVisible()
    const [req] = await Promise.all([
      page.waitForRequest(isApi('POST', 'guest-links'), { timeout: 20_000 }),
      list.getByRole('button', { name: 'Révoquer' }).first().click(),
    ])
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ revokeId: 'l1' })
  })

  test('the sitter info block patches household with the typed fields', async ({ page }) => {
    // The block seeds itself from a mount fetch, so wait for that to land before
    // typing: the field must hold what we typed at the moment we save, not whatever
    // the seed put there. (The product no longer clobbers a keystroke either — see
    // `typed` in ShareInfoEditor — but a spec that types into a half-loaded form is
    // testing the race, not the write.)
    const seeded = page.waitForResponse((r) => r.url().includes('/api/household') && r.request().method() === 'GET')
    await page.goto('/settings?tab=settings&focus=guestLinks')
    await seeded
    const card = page.locator('.operator__section', { hasText: 'Infos à partager' })
    const wifi = card.getByLabel('Réseau Wi-Fi')
    await wifi.fill('Maison-5G')
    await expect(wifi).toHaveValue('Maison-5G')
    const [req] = await Promise.all([
      page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
      card.getByRole('button', { name: 'Enregistrer' }).click(),
    ])
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ wifiSsid: 'Maison-5G' })
  })

  test('a keystroke typed while the sitter block is still loading survives the seed', async ({ page }) => {
    // The block starts EMPTY and fills itself from a mount fetch. Hold that fetch open,
    // type into the field the way a fast operator on a slow phone would, THEN let the
    // household answer: the seed must not overwrite what was typed — or the save would
    // PATCH the value the operator thought they had replaced. Found on CI 2026-09-08,
    // where the runner is slow enough to lose the race every time (green locally).
    let release = () => {}
    const held = new Promise<void>((r) => (release = r))
    await page.route('**/api/household**', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      await held
      return route.fallback()
    })
    await page.goto('/settings?tab=settings&focus=guestLinks')
    const wifi = page.locator('.operator__section', { hasText: 'Infos à partager' }).getByLabel('Réseau Wi-Fi')
    await wifi.fill('Maison-5G')
    release()
    await page.waitForResponse((r) => r.url().includes('/api/household') && r.request().method() === 'GET')
    await expect(wifi, 'the seed clobbered a keystroke').toHaveValue('Maison-5G')
  })

  test('« Tester l’IA » probes the binding with a POST (never a queued write)', async ({ page }) => {
    await page.route('**/api/ai-test**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ checks: [] }) }),
    )
    await page.goto('/settings?tab=settings&focus=aiLog')
    await Promise.all([
      page.waitForRequest(isApi('POST', 'ai-test'), { timeout: 20_000 }),
      page.getByRole('button', { name: 'Tester l’IA' }).click(),
    ])
  })

  test('« Vider le journal » DELETEs the AI error log', async ({ page }) => {
    await page.route('**/api/ai-errors**', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ errors: [{ id: 'e1', feature: 'capture', message: 'boom', created_at: BASE }] }),
          })
        : route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    )
    await page.goto('/settings?tab=settings&focus=aiLog')
    const card = page.locator('#op-aiLog')
    await expect(card.locator('.ai-log__row')).toHaveCount(1)
    await Promise.all([
      page.waitForRequest(isApi('DELETE', 'ai-errors'), { timeout: 20_000 }),
      card.getByRole('button', { name: 'Vider le journal' }).click(),
    ])
  })

  test('removing a household photo is held behind the undo, then DELETEs by id on teardown', async ({ page }) => {
    const deletes: string[] = []
    await page.route('**/api/photos**', (route) => {
      const m = route.request().method()
      if (m === 'GET')
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ photos: [{ id: 'p1', key: 'k1', created_at: BASE }] }),
        })
      deletes.push(route.request().postData() || '')
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    })
    await page.goto('/settings?tab=settings&focus=photos')
    const card = page.locator('#op-photos')
    await expect(card.locator('.photo-grid__item')).toHaveCount(1)
    await card.getByRole('button', { name: 'Supprimer' }).first().click()
    await expect(page.locator('.undo-toast')).toBeVisible()
    expect(deletes).toEqual([])
    await Promise.all([page.waitForRequest(isApi('DELETE', 'photos'), { timeout: 20_000 }), flushHeldWrites(page)])
    expect(JSON.parse(deletes[0] || '{}')).toMatchObject({ id: 'p1' })
  })

  // The photo half of « THE LAST TWO » (the note is in journey-settings.spec.ts).

  /** The smallest real PNG: 1×1, so `resizeImage` has actual pixels to decode. */
  const PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )

  test('adding a photo uploads the blob to photos', async ({ page }) => {
    await page.goto('/settings?tab=settings&focus=photos')
    const card = page.locator('#op-photos')
    const [req] = await Promise.all([
      page.waitForRequest(isApi('POST', 'photos'), { timeout: 20_000 }),
      card.locator('input[type="file"]').setInputFiles({ name: 'frigo.png', mimeType: 'image/png', buffer: PNG_1x1 }),
    ])
    // The body is the resized image itself, not a JSON envelope — so the assertion is
    // that real bytes went up. An empty POST is exactly what a broken resize produces.
    expect((req.postDataBuffer() ?? Buffer.alloc(0)).byteLength, 'the upload sent no bytes').toBeGreaterThan(0)
  })
})


// ── folded from journey-settings.spec.ts ──────────────────────────────────────────────
test7.describe('settings-advanced', () => {
  // Review #18 (2026-11-17; Marco, Geneviève, Thérèse): the page a parent opens to pair a
  // tablet read like a developer console (« Agent IA (MCP) », « jeton », « Diagnostic
  // clavier », « Tester l'IA »), « Kit de composants (dev) » sat under « Affichage », and
  // « Charger des exemples » sat on Découvrir beside « Déconnexion ». Marc: an « Avancé »
  // section, no feature flag. The tools are one pill away; the household pages are calm.

  test7('« Avancé » holds the dev tools; the household pages no longer show them', async ({ app, page }) => {
    await app.boot({ route: '/settings?tab=settings&lens=regler&sub=tablets', wait: '#op-devices' })
    for (const gone of ['#op-mcpAgent', '#op-kbDebug', '#op-aiLog']) await expect(page.locator(gone)).toHaveCount(0)

    await page.goto('/settings?tab=settings&lens=regler&sub=display')
    await expect(page.locator('#op-display')).toBeVisible()
    await expect(page.locator('#op-display .devkit__link')).toHaveCount(0)

    await page.goto('/settings')
    await expect(page.locator('.guide').first()).toBeVisible()
    await expect(page.locator('.guide__sample')).toHaveCount(0)

    await page.getByRole('tab', { name: /Système/ }).click()
    await page.getByRole('tab', { name: 'Avancé' }).click()
    for (const here of ['#op-mcpAgent', '#op-kbDebug', '#op-sample', '#op-devKit']) await expect(page.locator(here)).toBeVisible()
    await expect(page.locator('#op-devKit').getByRole('link')).toHaveAttribute('href', '/dev/kit')
  })

  test7('a link to a moved card still lands on it (?focus= derives the pill)', async ({ app, page }) => {
    await app.boot({ route: '/settings?focus=kbDebug', wait: '#op-kbDebug' })
    await expect(page.getByRole('tab', { name: 'Avancé' })).toHaveAttribute('aria-selected', 'true')
  })
})


// ── folded from journey-settings.spec.ts ──────────────────────────────────────────────
test8.describe('settings-aliases', () => {
  // Regression net for the themed-Réglages restructure: EVERY pre-restructure
  // deep-link — the 9 old task tabs, the 12 previously-retired ids, the ?sub=
  // splits, ?card=/&point= guide links and ?theme= jump-grid links — must still
  // land on the right themed tab (LEGACY_TAB / cardHomeTab / THEME_ALIAS in
  // pages/Operator). If someone bookmarked a settings URL any time in the app's
  // life, it keeps working. Landing is asserted on the SELECTED TAB (the URL keeps
  // the raw legacy params — folding is in-memory, by design).

  const PHONE = { width: 390, height: 844 }

  const OPERATOR = { viewport: PHONE, state: { calm: true }, wait: '.operator__tabs' }

  const expectTab = (page: Page, id: string) =>
    expect(page.locator(`#op-tab-${id}`)).toHaveAttribute('aria-selected', 'true')

  // Every legacy ?tab= id → the themed tab that hosts it now.
  const TAB_CASES: [string, string][] = [
    // the 9 old task-oriented tabs
    ['guide', 'decouvrir'],
    ['household', 'maison'],
    ['devices', 'settings'],
    ['agenda', 'board'],
    ['recipes', 'kitchen'],
    ['shopping', 'liste'],
    ['display', 'settings'],
    ['ai', 'settings'],
    // the 12 previously-retired ids
    ['guest', 'settings'],
    ['auto', 'maison'],
    ['todos', 'maison'],
    ['meals', 'kitchen'],
    ['reserve', 'kitchen'],
    ['ghost', 'liste'],
    ['calm', 'settings'],
    ['photos', 'settings'],
    ['week', 'board'],
    ['ai-log', 'settings'],
    // 'cercle' and 'routines' briefly graduated to real themed tabs, then were
    // DEMOTED back to aliases by the nav restructure (merged into ONE Maison tab).
    ['cercle', 'maison'],
    ['routines', 'maison'],
  ]

  for (const [old, target] of TAB_CASES) {
    test8(`?tab=${old} lands on the ${target} tab`, async ({ page, app }) => {
      await app.boot({ ...OPERATOR, route: `/settings?tab=${old}` })
      await expectTab(page, target)
    })
  }

  // A landed sub is asserted by ANCHOR — the first section card of the target sub is
  // on screen (`id="op-<key>"`, from SETTINGS_TREE) — never by pill label, so the
  // next rename or reshuffle changes this file's data, not its assertions.
  const firstAnchor = (tab: keyof typeof SETTINGS_TREE, sub: string) =>
    `#op-${(SETTINGS_TREE[tab] as Record<string, readonly { key: string }[]>)[sub]![0]!.key}`
  const expectSub = (page: Page, tab: keyof typeof SETTINGS_TREE, sub: string) =>
    expect(page.locator(firstAnchor(tab, sub))).toBeVisible()

  // The three old tabs whose subs SPLIT across themes: the raw ?sub picks the host
  // (LEGACY_TAB.bySub) — walked from the data, so a re-pointed target updates this.
  for (const [oldTab, entry] of Object.entries(LEGACY_TAB)) {
    for (const [oldSub, target] of Object.entries(entry.bySub ?? {})) {
      test8(`?tab=${oldTab}&sub=${oldSub} lands on ${target.tab} ▸ ${target.sub}`, async ({ page, app }) => {
        await app.boot({ ...OPERATOR, route: `/settings?tab=${oldTab}&sub=${oldSub}` })
        await expectTab(page, target.tab)
        await expectSub(page, target.tab, target.sub)
      })
    }
  }

  // A retired ?sub reached through a retired TAB: the tab folds first (LEGACY_TAB),
  // then the sub (LEGACY_SUB) — ?tab=ai&sub=calm must end on Système ▸ Affichage & veille.
  test8('?tab=ai&sub=calm folds tab, then sub, onto Système ▸ « Affichage & veille »', async ({ page, app }) => {
    await app.boot({ ...OPERATOR, route: '/settings?tab=ai&sub=calm' })
    await expectTab(page, 'settings')
    await expectSub(page, 'settings', 'display')
    await expect(page.locator('#op-calm')).toBeVisible()
  })

  // EVERY retired within-tab sub id (LEGACY_SUB — kitchen's 2026-07 colour subs and
  // the 2026-09 28 → 14 agglomeration) folds onto its host, walked from the data so
  // the next merge adds a line there and a case here for free. Nothing 404s.
  for (const [tab, folds] of Object.entries(LEGACY_SUB)) {
    for (const [oldSub, host] of Object.entries(folds ?? {})) {
      test8(`?tab=${tab}&sub=${oldSub} folds onto ${tab} ▸ ${host}`, async ({ page, app }) => {
        await app.boot({ ...OPERATOR, route: `/settings?tab=${tab}&sub=${oldSub}` })
        await expectTab(page, tab)
        await expectSub(page, tab as keyof typeof SETTINGS_TREE, host)
      })
    }
  }

  test8('?tab=recipes (legacy) lands on La cuisine ▸ Apparence', async ({ page, app }) => {
    await app.boot({ ...OPERATOR, route: '/settings?tab=recipes' })
    await expectTab(page, 'kitchen')
    await expectSub(page, 'kitchen', 'apparence')
  })

  // ?focus= ALONE resolves the sub (subOfFocus): a link may name just the section and
  // survive the next pill reshuffle — the day a card moves, its old ?sub would have
  // pointed at the wrong pill while the section itself is still exactly findable.
  test8('?focus= without ?sub lands on the section, sub derived', async ({ page, app }) => {
    await app.boot({ ...OPERATOR, route: '/settings?tab=settings&focus=calm' })
    await expectTab(page, 'settings')
    await expectSub(page, 'settings', 'display')
    await expect(page.locator('#op-calm')).toBeInViewport()
  })

  // ?card= guide links home onto the card's themed tab, Comprendre lens, and the
  // card opens highlighted (the param is consumed, pinning tab+lens in the URL).
  test8('?tab=guide&card=kitchen homes onto La cuisine in Comprendre', async ({ page, app }) => {
    await app.boot({ ...OPERATOR, route: '/settings?tab=guide&card=kitchen' })
    await expect(page).toHaveURL(/tab=kitchen&lens=comprendre/)
    await expectTab(page, 'kitchen')
    await expect(page.locator('.guide__card.is-target')).toBeVisible()
  })

  test8('a retired settings card id (+point) still lands on the exact card', async ({ page, app }) => {
    // set-photos was folded into set-display (SETTINGS_CARD_ALIAS), whose home is
    // Système now — the alias chain must survive the restructure end-to-end.
    await app.boot({ ...OPERATOR, route: '/settings?tab=guide&card=set-photos&point=0' })
    await expect(page).toHaveURL(/tab=settings&lens=comprendre/)
    await expectTab(page, 'settings')
    await expect(page.locator('.guide__card.is-target')).toBeVisible()
  })

  // `ghost` became a GUIDE_CARD_ALIAS onto the liste card (guide merge 2026-08-27)
  // — the assertion is unchanged on purpose: the old bookmark must still land on
  // the liste tab with its host card highlighted.
  test8('a concept card homes onto its bucket (ghost → La liste)', async ({ page, app }) => {
    await app.boot({ ...OPERATOR, route: '/settings?tab=guide&card=ghost' })
    await expect(page).toHaveURL(/tab=liste&lens=comprendre/)
    await expectTab(page, 'liste')
    await expect(page.locator('.guide__card.is-target')).toBeVisible()
  })

  // Old jump-grid ?theme= links resolve through THEME_ALIAS.
  test8('?theme=kitchen-shop opens La cuisine in Comprendre', async ({ page, app }) => {
    await app.boot({ ...OPERATOR, route: '/settings?tab=guide&theme=kitchen-shop' })
    await expect(page).toHaveURL(/tab=kitchen&lens=comprendre/)
    await expectTab(page, 'kitchen')
  })

  // The 55→32 agglomeration: a card retired INTO another (cookmode → recipes,
  // GUIDE_CARD_ALIAS base 7) keeps its old deep-link working — ?card=cookmode&point=1
  // must land on the recipes card with alias-shifted point 8 opened + highlighted.
  test8('a merged concept card id (+point) still lands on its host card', async ({ page, app }) => {
    await app.boot({ ...OPERATOR, route: '/settings?tab=guide&card=cookmode&point=1' })
    await expect(page).toHaveURL(/tab=kitchen&lens=comprendre/)
    await expectTab(page, 'kitchen')
    await expect(page.locator('.guide__card.is-target')).toBeVisible()
    await expect(page.locator('.guide__point.is-target')).toBeVisible()
  })

  // ?focus= — a guide « Régler » link names ONE section card inside a stacked sub
  // (kitchen ▸ Apparence stacks tags + pastilles + mesures): the anchored card is
  // on screen and the param is consumed (one replace write, no re-trigger on back).
  test8('?focus=measureColors lands inside kitchen ▸ Apparence on the exact card', async ({ page, app }) => {
    await app.boot({ ...OPERATOR, route: '/settings?tab=kitchen&sub=apparence&focus=measureColors' })
    await expectTab(page, 'kitchen')
    await expectSub(page, 'kitchen', 'apparence')
    await expect(page.locator('#op-measureColors')).toBeVisible()
    await expect(page).not.toHaveURL(/focus=/)
  })

  // ?focus= ALONE is a full address (2026-09-30): the section names its tab and pill. The
  // doors into Réglages from elsewhere (the board ＋ « Lien pour la gardienne », a contact's
  // « Lui demander de compléter ») first shipped with the tab spelled out because a bare
  // focus landed on Découvrir — and once the focus is consumed, the derived tab must stay
  // pinned in the URL or the page folds back.
  test8('?focus= alone lands on its section — tab and pill derived, and they stay', async ({ page, app }) => {
    await app.boot({ ...OPERATOR, route: '/settings?focus=guestLinks' })
    await expectTab(page, 'settings')
    await expect(page.locator('#op-guestLinks')).toBeVisible()
    await expect(page).toHaveURL(/tab=settings/)
    await expect(page).not.toHaveURL(/focus=/)
    await expect(page.locator('#op-guestLinks')).toBeVisible()
  })

  // …and the one guide-card link builder (settingsNav guideHref) is the card alone.
  test8('a bare ?card= link homes onto the card', async ({ page, app }) => {
    await app.boot({ ...OPERATOR, route: '/settings?card=kitchen' })
    await expectTab(page, 'kitchen')
    await expect(page.locator('.guide__card.is-target')).toBeVisible()
  })
})


// ── folded from journey-settings.spec.ts ──────────────────────────────────────────────
test9.describe('settings-delete-undo', () => {
  // REVIEW-PASS: deleting an event or a chore in Réglages hid the row by mutating the
  // query cache (`useUndoableRemove` → `setQueryData`; that hook was FOLDED into
  // useDeferredRemoval and deleted on 2026-09-09 — UNIFY.md day 4 — so this paragraph is
  // history, not a live alternative). That was safe only while nothing
  // refills the key inside the undo window — and things do: a RealtimeHub `invalidate`
  // from another device refetches an ACTIVE query whether or not it polls, and simply
  // leaving the sub and coming back re-runs it. The server frame legitimately still
  // contains the row (the DELETE is held behind « Annuler »), so it came back, then
  // vanished again when the write finally ran.
  //
  // `useDeferredRemoval` holds the id in a MODULE-level pending set and filters the
  // RENDER, so no refetch — and no remount — can put it back. The set outliving the
  // component is the property under test here.

  const PHONE = { width: 390, height: 844 }

  test9('a deleted event stays gone across a remount, then « Annuler » restores it', async ({ page, app }) => {
    const deletes: string[] = []
    await app.boot({ viewport: PHONE })
    await page.route('**/api/events**', async (route) => {
      const m = route.request().method()
      if (m === 'GET') {
        // The server still has it — the DELETE is held behind the undo.
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROUTES.events) })
      }
      deletes.push(m)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })
    await page.goto('/settings?tab=board&lens=regler&sub=events')
    await page.locator('.operator').waitFor({ state: 'visible', timeout: 15_000 })

    const title = (ROUTES.events as { events: { title: string }[] }).events[0]!.title
    const row = () => page.locator('.operator__list li', { hasText: title })
    await expect(row()).toBeVisible()

    await row().getByRole('button', { name: 'Supprimer' }).click()
    await expect(row()).toHaveCount(0)
    await expect(page.locator('.undo-toast')).toBeVisible()

    // Leave the sub and come back — CLIENT-side (clicking the pills), not page.goto:
    // a full reload would wipe the module-level pending set along with everything else,
    // which tests the browser, not the helper. The list unmounts and its query re-runs
    // against a server frame that still contains the event.
    const pill = (name: string) => page.locator('.subtabs__opt', { hasText: name })
    await pill('Disposition du babillard').click()
    await expect(page.locator('.operator__list li', { hasText: title })).toHaveCount(0)
    await pill('Agenda & semaine').click()
    await expect(page.locator('.operator__list li').first()).toBeVisible()
    await expect(row(), 'a remount must not resurrect a row held behind the undo').toHaveCount(0)

    // Nothing has been sent yet — the whole point of a deferred delete.
    expect(deletes).toEqual([])

    await page.locator('.undo-toast__btn').first().click()
    await expect(row()).toBeVisible()
    expect(deletes, '« Annuler » must leave the server untouched').toEqual([])
  })
})


// ── folded from journey-settings.spec.ts ──────────────────────────────────────────────
test10.describe('settings-sections', () => {
  // Capture each Settings section (the CRUD strips behind the section nav) — they
  // only render one at a time, so the static sweep only ever shoots the first.
  // Phone format. Writes PNGs to e2e/screenshots for review.

  const PHONE = { width: 390, height: 844 }
  const SECTIONS = [
    // The themed tabs (one per hub section, canonical order) + Découvrir. « Le
    // cercle » and Routines merged into ONE Maison tab (the nav restructure); « Les
    // notes » split out into its own Comprendre-only tab.
    'decouvrir', 'board', 'kitchen', 'liste', 'notes', 'maison', 'settings',
    // Legacy ids, kept as alias regressions: each must still render a panel
    // (LEGACY_TAB folds them onto the themed tabs — see settings-aliases.spec).
    // 'cercle' and 'routines' themselves are now retired tab ids too, folding onto
    // 'maison'.
    'household', 'agenda', 'shopping', 'cercle', 'routines',
    'recipes', 'ghost', 'devices', 'photos', 'week', 'display', 'calm', 'ai',
  ]

  // Deep-link straight to each section via ?tab=<id> (these ids match the section
  // ids in Operator.tsx). Robust against tab insertion/reorder — clicking by index
  // silently captured the wrong panel once Guide became the first tab.

  SECTIONS.forEach((id) => {
    test10(`settings-${id}`, async ({ page, app }) => {
      await app.boot({ viewport: PHONE, state: { calm: true }, route: `/settings?tab=${id}`, wait: '.operator__tabs' })
      await fontsReady(page)
      await settled(page)
      // fullPage so the whole section shows — several run taller than the phone
      // viewport (shopping = postal + store filter, ghost = manage + candidates +
      // add-staple, household = member list + form) and were being cut off.
      await page.screenshot({ path: `e2e/screenshots/settings-${id}-phone.png`, fullPage: true })
    })
  })

  // C-15 — La cuisine's pill row is exactly THREE now (Apparence stacks the three
  // old colour subs under one pill); the pre-fold names must be gone. Scoped to
  // `.subtabs:not(.subtabs--mini)` since the Comprendre/Régler lens toggle is
  // ALSO a `.subtabs` (the `mini` variant) sitting right above the sub-section row.
  test10('kitchen pill row is Apparence · meal colours · reserve (three, not five)', async ({ page, app }) => {
    await app.boot({ viewport: PHONE, state: { calm: true }, route: `/settings?tab=${'kitchen'}`, wait: '.operator__tabs' })
    await fontsReady(page)
    const pills = page.locator('.subtabs:not(.subtabs--mini)').getByRole('tab')
    await expect(pills).toHaveCount(3)
    await expect(pills.nth(0)).toHaveText('Apparence')
    await expect(page.locator('.subtabs').getByRole('tab', { name: 'Étiquettes de recettes' })).toHaveCount(0)
    await expect(page.locator('.subtabs').getByRole('tab', { name: 'Pastilles de recettes' })).toHaveCount(0)
    await expect(page.locator('.subtabs').getByRole('tab', { name: 'Couleurs des mesures' })).toHaveCount(0)
  })
})


// ── folded from journey-settings.spec.ts ──────────────────────────────────────────────
test11.describe('settings-tree', () => {
  // THE RÉGLAGES TREE, walked in the browser. lib/settingsNav.ts is the one map of
  // what Réglages holds where (settingsNav.test.ts holds its shape); this proves the
  // map is TRUE of the page: for the operator, every pill in the tree renders, and
  // every section it lists mints its `id="op-<key>"` card — which is the anchor a
  // guide « Régler » link, a "?" hint or a spec lands on. A section added to the
  // tree with no node in Operator's map (or a node whose OperatorSection forgot its
  // helpKey/anchor) fails here, naming the key, instead of being a link that scrolls
  // to nothing. Data-driven on purpose: the next reshuffle edits the tree and this
  // file needs no change at all.

  const PHONE = { width: 390, height: 844 }

  const OPERATOR = { viewport: PHONE, state: { calm: true }, wait: '.operator__tabs' }

  type Tab = keyof typeof SETTINGS_TREE

  for (const tab of Object.keys(SETTINGS_TREE) as Tab[]) {
    const subs = SETTINGS_TREE[tab] as Record<string, readonly { key: string }[]>

    test11(`${tab}: the pill row is exactly the tree's pills, in order`, async ({ page, app }) => {
      await app.boot({ ...OPERATOR, route: `/settings?tab=${tab}&lens=regler` })
      const pills = page.locator('.operator__subs [role="tab"]')
      await expect(pills).toHaveCount(Object.keys(subs).length)
      // Every pill has a label (SUB_LABEL_KEY resolved through i18n) — never a bare id
      // or an empty button. The exact words live in i18n and are not asserted here.
      for (let i = 0; i < Object.keys(subs).length; i++) {
        const text = (await pills.nth(i).innerText()).trim()
        expect(text, `pill ${i} of ${tab} (${Object.keys(subs)[i]}, label key ${(SUB_LABEL_KEY[tab] as Record<string, string>)[Object.keys(subs)[i]!]})`).not.toBe('')
        expect(Object.keys(subs), `pill ${i} of ${tab} shows its id instead of a label`).not.toContain(text)
      }
    })

    for (const [sub, sections] of Object.entries(subs)) {
      test11(`${tab} ▸ ${sub}: every section in the tree renders its #op-<key> card`, async ({ page, app }) => {
        await app.boot({ ...OPERATOR, route: `/settings?tab=${tab}&lens=regler&sub=${sub}` })
        // The pill is selected…
        await expect(page.locator('.operator__subs [role="tab"][aria-selected="true"]')).toHaveCount(1)
        // …and its stack is the tree's, in the tree's order (DOM order of the anchors).
        const keys = sections.map((s) => s.key)
        for (const key of keys) {
          await expect(page.locator(`#op-${key}`), `${tab}/${sub} lists "${key}" but no card mints id="op-${key}"`).toHaveCount(1)
        }
        const order = await page.locator('[id^="op-"]').evaluateAll((els) => els.map((e) => e.id.slice(3)))
        expect(order.filter((k) => keys.includes(k)), `${tab}/${sub}: stack order differs from the tree`).toEqual(keys)
      })
    }
  }

  // ?focus= alone must reach a card in EVERY pill — the whole point of naming the
  // section: one representative per pill, the last one (the hardest to reach).
  for (const tab of Object.keys(SETTINGS_TREE) as Tab[]) {
    for (const [sub, sections] of Object.entries(SETTINGS_TREE[tab] as Record<string, readonly { key: string }[]>)) {
      const last = sections[sections.length - 1]!.key
      test11(`?tab=${tab}&focus=${last} lands on that card with no ?sub spelled (derives ${sub})`, async ({ page, app }) => {
        await app.boot({ ...OPERATOR, route: `/settings?tab=${tab}&focus=${last}` })
        await expect(page.locator(`#op-${last}`)).toBeInViewport()
        // The one-shot param is consumed (one replace write; back-nav doesn't re-scroll).
        await expect(page).not.toHaveURL(/focus=/)
      })
    }
  }
})


// ── folded from journey-settings.spec.ts ──────────────────────────────────────────────
test.describe('ai-toggle', () => {
  // Verifies the household AI on/off switch end-to-end in the running app (#IA):
  // the Réglages header tag is a real toggle, flipping it PATCHes /api/household,
  // /api/health then reports AI as off, and the whole UI hides its AI affordances
  // (here: the search "Ask the AI" button). A stateful route models the backend so
  // the round-trip is real, not faked in the assertion.
  //
  // Layered AFTER mockApi so these two routes win for health/household; everything
  // else falls through to the shared mock.
  async function withAiState(page: Page) {
    const state = { aiEnabled: true }
    await page.route('**/api/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, app: 'Babillard', ai: state.aiEnabled, aiAvailable: true, invite: false, sessionSecret: true }),
      })
    })
    await page.route('**/api/household', async (route) => {
      if (route.request().method() === 'PATCH') {
        try {
          const b = JSON.parse(route.request().postData() || '{}')
          if ('aiEnabled' in b) state.aiEnabled = !!b.aiEnabled
        } catch {
          /* no body */
        }
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ name: 'Famille', postal: 'H2X 1Y4', includedStores: [], aiEnabled: state.aiEnabled }),
      })
    })
    return state
  }

  test('the IA section toggles AI on/off and the change persists', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await withAiState(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })

    // ?sub=ai selects the AI on/off sub-section within the « IA & système » tab (the
    // tab now shows one sub-section at a time behind a SubTabs row).
    await page.goto('/settings?tab=ai&sub=ai')
    // The IA settings section renders.
    await expect(page.getByRole('heading', { name: 'Intelligence artificielle' })).toBeVisible({ timeout: 15_000 })

    // The switch lives IN the IA section — it used to be mirrored as a tag on the
    // Réglages identity line, which was a second spelling of one control on the line
    // you read first (removed 2026-08-28, Marc's call). Starting "active".
    const tag = page.locator('.operator__section button[aria-pressed]').first()
    await expect(tag).toContainText('active')

    // Turn AI off — it PATCHes the household and the tag flips to "désactivée".
    await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/household') && r.method() === 'PATCH'),
      tag.click(),
    ])
    await expect(tag).toContainText('désactivée')

    // Turn it back on.
    await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/household') && r.method() === 'PATCH'),
      tag.click(),
    ])
    await expect(tag).toContainText('active')
  })

  test('disabling AI hides the search "Ask the AI" affordance', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await withAiState(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })

    // AI on: typing a query in global search shows the "Ask" button.
    await page.goto('/search')
    await page.locator('.search__input .searchfield__input').fill('souper')
    await expect(page.locator('.search__ask')).toBeVisible({ timeout: 15_000 })

    // Disable AI from settings.
    // ?sub=ai selects the AI on/off sub-section within the « IA & système » tab (the
    // tab now shows one sub-section at a time behind a SubTabs row).
    await page.goto('/settings?tab=ai&sub=ai')
    const tag = page.locator('.operator__section button[aria-pressed]').first()
    await expect(tag).toContainText('active')
    await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/household') && r.method() === 'PATCH'),
      tag.click(),
    ])
    await expect(tag).toContainText('désactivée')

    // Back in search, the Ask button is gone (AI affordances hidden); the local
    // fuzzy search still works (not AI).
    await page.goto('/search')
    await page.locator('.search__input .searchfield__input').fill('souper')
    await expect(page.locator('.search__ask')).toHaveCount(0)
  })
})


// ── folded from journey-settings.spec.ts ──────────────────────────────────────────────
test13.describe('sound-toggle', () => {
  // « Le son » — the app's own silent switch (src/lib/sound.ts).
  //
  // Why it exists: a phone's ring/silent switch does NOT mute a web page. On iOS it
  // never touched Web Speech or a script-started <audio>, and Android is
  // inconsistent. So a parent on a quiet bus opened the app and it read a routine
  // card aloud anyway, with no way to stop it short of leaving.
  //
  // The load-bearing claim is that muting actually reaches `speechSynthesis` — not
  // that a button changes colour. Headless Chromium has no voices, so we install a
  // counting stub before the app boots and assert on CALLS.

  const spoke = (page: Page) => page.evaluate(() => (window as unknown as { __spoke: number }).__spoke)

  test13('cook mode: muting stops the app from speaking, and it comes back', async ({ page, app }) => {
    await app.boot({ route: '/kitchen/recipe/rc1/cook' })
    await expect(page.locator('.cook')).toBeVisible()

    const mute = page.locator('.cook__bar-tools .sound-toggle')
    await expect(mute).toBeVisible()
    await expect(mute).toHaveAttribute('aria-pressed', 'false') // sound ON by default

    // A tap-to-hear speaks while sound is on. The STEP text is the target rather than
    // an ingredient line: an ingredient renders colour-coded measure pills that own
    // their own tap (« hear this amount »), so a click at its centre may land on a
    // pill instead — a step is one plain read-aloud button.
    const step = page.locator('.cook__step-read').first()
    await step.click()
    await expect.poll(() => spoke(page)).toBeGreaterThan(0)

    // Mute, then tap again — nothing more is spoken.
    await mute.click()
    await expect(mute).toHaveAttribute('aria-pressed', 'true')
    await expect(mute).toHaveClass(/is-muted/)
    const before = await spoke(page)
    await step.click()
    // Proving a sentence was NOT spoken: no DOM signal marks a silence, so give it the time it would have taken.
    await page.waitForTimeout(300)
    expect(await spoke(page)).toBe(before)

    // Unmute and it speaks again — a switch, not a one-way door.
    await mute.click()
    await step.click()
    await expect.poll(() => spoke(page)).toBeGreaterThan(before)
  })

  test13('the choice is per-device and survives a reload', async ({ page, app }) => {
    await app.boot({ route: '/kitchen/recipe/rc1/cook' })
    await page.locator('.cook__bar-tools .sound-toggle').click()

    await page.reload()
    await expect(page.locator('.cook')).toBeVisible()
    // Silence has to outlive the tab: a parent who muted on the bus does not want it
    // back the moment the app reloads.
    await expect(page.locator('.cook__bar-tools .sound-toggle')).toHaveClass(/is-muted/)
    const before = await spoke(page)
    await page.locator('.cook__step-read').first().click()
    // Proving a sentence was NOT spoken: no DOM signal marks a silence, so give it the time it would have taken.
    await page.waitForTimeout(300)
    expect(await spoke(page)).toBe(before)
  })

  test13('Réglages ▸ Voix mirrors the same switch', async ({ page, app }) => {
    // The bar toggles are where you REACH for it; this is the calm door, and both
    // must be the same flag — two switches that disagree would be worse than one.
    await app.boot({ route: '/settings?tab=settings&sub=ai&focus=voice' })
    const inSettings = page.locator('.operator__section .sound-toggle')
    await expect(inSettings).toBeVisible()
    await inSettings.click()
    await expect(inSettings).toHaveClass(/is-muted/)

    await page.goto('/kitchen/recipe/rc1/cook')
    await expect(page.locator('.cook__bar-tools .sound-toggle')).toHaveClass(/is-muted/)
  })
})
