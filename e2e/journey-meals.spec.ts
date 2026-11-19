import { test, expect } from './fixtures'
import { test as test2, type Page, type Locator, type Request, test as test6, test as test7, test as test8 } from '@playwright/test'
import { mockApi, seedState, BOARD, MMID, BASE, MEALS } from './mocks'
import { boxOf, settled } from './measure'
import { isApi, APP, settle, expectApi } from './interact'
import { addLocalDays } from '../src/lib/localDay'

// JOURNEY — PLANNING MEALS (review #43; was kitchen-meal-plan.spec.ts + kitchen-inline-plan.spec.ts + meals.spec.ts + meal-order.spec.ts + plan-tonight.spec.ts + unplaced-meals.spec.ts + grid-side-meal-drag.spec.ts + interactions-kitchen.spec.ts).
//
// La cuisine meal-planning UX: the ＋ "Planifier un repas" is a day picker that
// opens that day's editor SCENE (/kitchen/day/:date — one editor, two entry
// points). The day scene now LEADS with the day's agenda; the meal planner is
// demoted into a collapsed « Les repas » disclosure at the bottom and lists slots
// chronologically (déjeuner → dîner → collation → souper). The day note is the
// scene's headline now, not a slot section. The recipe builder fills the screen
// (no stale-keyboard dead space).

test.describe('kitchen-meal-plan', () => {
  test('＋ Planifier un repas → day picker → opens that day’s editor scene', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 } })
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

  test('day editor lists slots chronologically (note is the headline)', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 } })
    await page.goto('/kitchen')
    await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })
    // Open the first day's editor straight from the grid (the manage button is
    // icon-only now, named "Gérer · <date>") → navigates to the day scene's
    // « Repas » face (the pencil is a meal door).
    await page.locator('.kitchen__day.is-today').getByRole('button', { name: /Gérer/ }).click()
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

  test('recipe builder fills the screen (no stale-keyboard dead space)', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 } })
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
  test('a day’s meal row opens its recipe directly; an unlinked meal falls back to the day editor', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 } })
    await page.goto('/kitchen')
    await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })

    const today = page.locator('.kitchen__day.is-today')
    // « Spaghetti maison » is linked to recipe rc1 in the fixture — its row goes
    // straight there, no peek in between.
    await today.locator('.kitchen__day-meal', { hasText: 'Spaghetti maison' }).click()
    await expect(page).toHaveURL(/\/kitchen\/recipe\/rc1$/)
    await page.goBack()
    await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })

    // « Salade César » has no recipe_id — its row opens the day's full editor instead.
    await page.locator('.kitchen__day.is-today').locator('.kitchen__day-meal', { hasText: 'Salade César' }).click()
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
  test('the meal pools lead with their content; the composer waits behind its ＋', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 } })
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

  test('…but the ideas DRAWER keeps its field open — you opened it to write', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 } })
    await page.goto('/kitchen')
    await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })

    await page.locator('.kitchen__ideas-opener .btn--primary').click()
    const drawer = page.locator('.ideas-drawer .scene__body')
    await expect(drawer).toBeVisible()
    await expect(drawer.locator('.kitchen__ideas-combo').first()).toBeVisible()
    // …and it carries no ＋ to fold it away, because there is nothing to fold.
    await expect(drawer.locator('.kitchen__ideas .sec-label__actbtn')).toHaveCount(0)
  })
})

// ── folded from journey-journey-meals.spec.ts ──────────────────────────────────────────────
test2.describe('kitchen-inline-plan', () => {
  // Plan seam #8: filling a week cost seven full-screen day scenes. An EMPTY day cell
  // in the week grid is now the field itself — tap it, type, done. The day scene still
  // owns the rest (sides, note, recipe, who cooks), and the pencil still opens it.
  test2('an empty day cell plans the supper in place', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const posted: Record<string, unknown>[] = []
    await mockApi(page)
    await page.route('**/api/meals**', async (route) => {
      if (route.request().method() === 'POST') {
        posted.push(route.request().postDataJSON())
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'new' }) })
      }
      return route.fallback()
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/kitchen')
    await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })

    // An empty day announces itself as plannable via the header's ＋ switch…
    const emptyCell = page.locator('.kitchen__day-addbtn').first()
    await expect(emptyCell).toBeVisible()
    await emptyCell.click()

    // …and becomes the field in place — no navigation to a day scene.
    const field = page.locator('.kitchen__day-add')
    await expect(field).toBeVisible()
    expect(page.url()).toContain('/kitchen')
    expect(page.url()).not.toContain('/kitchen/day/')

    await field.locator('input, textarea').first().fill('Spaghetti')
    await page.keyboard.press('Enter')

    await expect.poll(() => posted.length, { message: 'the meal was planned' }).toBeGreaterThan(0)
    const body = posted[0] as { title?: string; date?: number; slot?: string }
    expect(body.title).toBe('Spaghetti')
    expect(body.slot).toBeTruthy()
    expect(typeof body.date).toBe('number')
    // The field closes once the write lands; the grid is a calm glance again.
    await expect(page.locator('.kitchen__day-add')).toHaveCount(0)
  })

  // Reported from the device (2026-09-10): « quand je clique pour ajouter et planifier
  // un repas (date vide), le focus ne va pas au bon endroit ».
  //
  // The day it opened on was right and the input WAS focused — what was wrong is that
  // nothing brought the thing you just opened onto the screen. Tap the ＋ on a day far
  // down the week and the field mounts below the fold with its dropdown (Restants +
  // Recettes, easily half a screen tall) hanging off the bottom: focused, rendered,
  // and invisible. You had to scroll to find what your own tap had opened.
  //
  // The fix lives in the PRIMITIVES (EntityCombobox + EditField, via lib/motion's
  // `revealOnOpen`), so it holds for every inline composer in every section, not just
  // this one. This spec pins the reported surface; `block: 'nearest'` is what keeps it
  // from yanking a composer that was already comfortably in view.
  test2('planning a day low in the week brings the field AND its options on screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/kitchen')
    await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })

    const addButtons = page.locator('.kitchen__day-addbtn')
    expect(await addButtons.count(), 'the grid should offer empty days to plan').toBeGreaterThan(1)

    // Put an empty day's ＋ NEAR THE BOTTOM EDGE, the way it sits when you are reading
    // down the week — then tap it IN PAGE.
    //
    // Both halves are load-bearing, and the first version of this test had neither, so
    // it passed with the fix reverted. Playwright's own .click() scrolls the target into
    // view first (nearest edge), which quietly undoes the exact condition being tested;
    // an in-page click reproduces a real thumb. The menu is in FLOW (fields.css), so it
    // grows the day card downward — off the bottom of the screen when the card starts
    // there, which is precisely what was reported.
    const idx = await page.evaluate(() => {
      const btns = [...document.querySelectorAll<HTMLElement>('.kitchen__day-addbtn')]
      const scroller = document.querySelector('.hub__body')
      if (!btns.length || !scroller) return -1
      const target = btns[btns.length - 1]
      // Scroll so the target's row sits ~120px above the fold: visible, tappable, with
      // no room beneath it for a dropdown.
      const row = target!.closest('.kitchen__day') as HTMLElement
      scroller.scrollTop += row.getBoundingClientRect().top - (window.innerHeight - 120)
      return btns.length - 1
    })
    expect(idx, 'found an empty day to drive').toBeGreaterThanOrEqual(0)
    await settled(page)

    // A real tap, with no test-runner scrolling in front of it.
    await page.evaluate((i) => {
      const btns = [...document.querySelectorAll<HTMLElement>('.kitchen__day-addbtn')]
      btns[i]?.click()
    }, idx)

    const field = page.locator('.kitchen__day-add')
    await expect(field).toBeVisible()
    const menu = field.locator('.combobox__menu')
    await expect(menu).toBeVisible()
    await settled(page) // the reveal's smooth scroll has landed

    const view = page.viewportSize()!
    // The INPUT row, not the combobox root — the root contains the dropdown, and a long
    // list is allowed to run past the fold (it scrolls). What may never be off screen is
    // the box you type in and the first thing you can pick.
    const inputBox = await boxOf(field.locator('input').first())
    expect(inputBox.y, 'the input must be on screen').toBeGreaterThanOrEqual(0)
    expect(inputBox.y + inputBox.height, 'the input must not sit below the fold').toBeLessThanOrEqual(view.height)

    // The options are the point of opening it: the first row has to be reachable without
    // scrolling, or the tap looks like it did nothing.
    const firstRow = field.locator('.combobox__row').first()
    await expect(firstRow).toBeVisible()
    const rowBox = await boxOf(firstRow)
    expect(rowBox.y, 'the first option must be inside the viewport').toBeGreaterThanOrEqual(0)
    expect(rowBox.y + rowBox.height, 'the first option must not hang below the fold').toBeLessThanOrEqual(view.height)
  })

  // The other half of the same contract, and the reason `revealOnOpen` uses
  // `block: 'nearest'` rather than 'center'/'start'/'end'.
  //
  // A shared primitive scrolls on EVERY inline composer in the app, so the common case —
  // a field you opened that was already perfectly visible — must be a no-op. A composer
  // that jumps the page under your thumb each time you tap it is a worse bug than the one
  // being fixed, and it would be reported as "it moves when I tap".
  test2('opening a composer that is already in view does not move the page', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/kitchen')
    await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })

    const scrollTop = () => page.evaluate(() => document.querySelector('.hub__body')?.scrollTop ?? 0)

    // Park an empty day in the MIDDLE of the viewport — comfortably visible, with room
    // both above and below it. The middle is what makes this test discriminate: a reveal
    // that aligned to 'start' or 'end' would drag this composer to an edge and the page
    // would jump, while 'nearest' has nothing to do. (Driven off the FIRST empty day, at
    // the top of the grid, the two are indistinguishable — the first version of this test
    // sat there and passed with 'end' planted, proving nothing.)
    await page.evaluate(() => {
      const btn = document.querySelector<HTMLElement>('.kitchen__day-addbtn')
      const scroller = document.querySelector('.hub__body')
      if (!btn || !scroller) return
      const row = btn.closest('.kitchen__day') as HTMLElement
      // The middle of the FREE area: since review #17 the body reserves the tab bar + ＋
      // band as scroll-padding, and a composer opening inside that band is rightly lifted
      // out of it — that is not « already in view ».
      const band = parseFloat(getComputedStyle(scroller).scrollPaddingBottom) || 0
      scroller.scrollTop += row.getBoundingClientRect().top - (window.innerHeight - band) / 2
    })
    await settled(page)
    const before = await scrollTop()

    await page.evaluate(() => document.querySelector<HTMLElement>('.kitchen__day-addbtn')?.click())
    await expect(page.locator('.kitchen__day-add')).toBeVisible()
    // Proving no scroll came: nothing marks an absence, so give it the time it would have taken.
    await page.waitForTimeout(500)

    expect(await scrollTop(), 'a composer already in view must not scroll the page').toBe(before)
  })
})


// ── folded from journey-meals.spec.ts ──────────────────────────────────────────────
test.describe('meals', () => {
  // N meals per slot + time ordering + the food slot icons. Frontend-only against
  // mocked /api/* (the mock returns {ok:true} for writes, so we assert the request
  // fired — the established expectApi pattern).

  // Resolve once a meals write with the given predicate is sent.
  function waitMeals(page: Page, method: string, pred: (body: any) => boolean) {
    return page.waitForRequest((r) => {
      if (!r.url().includes('/api/meals') || r.method() !== method) return false
      try {
        return pred(JSON.parse(r.postData() || '{}'))
      } catch {
        return false
      }
    })
  }

  // The per-day editing (rows, add, reorder, clear, note) lives in the day editor
  // SCENE now (/kitchen/day/:date) — the week grid is a calm read-only glance. Open
  // the first day's editor and return the scene as the scope for the controls.
  async function openManage(page: Page) {
    await page.locator('.kitchen__day.is-today').getByRole('button', { name: /Gérer/ }).click()
    const sheet = page.locator('.scene')
    await expect(sheet).toBeVisible()
    // The meal planner is a plain « Les repas » section now (no disclosure) — the
    // slot rows/controls are always visible.
    await expect(sheet.locator('.day-mng__sec').first()).toBeVisible()
    return sheet
  }

  test('a slot holds several meals — both show, with an add-another', async ({ page, app }) => {
    await app.boot({ route: '/kitchen', wait: '.hub' })
    const sheet = await openManage(page)
    // Slots read chronologically now (déjeuner → souper), so scope to the Souper
    // section — it holds the two suppers.
    const suppers = sheet.locator('.day-mng__sec', { hasText: 'Souper' }).locator('.kitchen__meal-row')
    await expect(suppers).toHaveCount(2)
    await expect(sheet).toContainText('Spaghetti maison')
    await expect(sheet).toContainText('Salade César')
    // The add affordance is the shared SectionAdd ＋ chip on the slot's header line; its
    // accessible name still says WHICH slot and that this one already holds a meal.
    await expect(sheet.getByRole('button', { name: 'Ajouter un autre — Souper' })).toBeVisible()
  })

  test('removing one meal hides just that row at once, and deletes it on commit', async ({ page, app }) => {
    await app.boot({ route: '/kitchen', wait: '.hub' })
    const sheet = await openManage(page)
    const rows = sheet.locator('.kitchen__meal-row')
    const before = await rows.count()
    // The DELETE is HELD behind the undo toast (useDeferredRemoval, 2026-11-05 — it used
    // to fire at once and « Annuler » re-created a copy under a new id), so it arrives
    // after the undo window (15 s, toast.tsx DEFAULT_UNDO_MS).
    const del = page.waitForRequest((r) => r.method() === 'DELETE' && r.url().includes('/api/meals'), { timeout: 20_000 })
    // A row's management verbs live behind its ⋯ overflow now (❤ + 📖 stay visible).
    await rows.first().locator('.action-menu__btn').click()
    await page.getByRole('menuitem', { name: 'Retirer le repas' }).click()
    // Hidden now — before any write; « Annuler » is offered.
    await expect(rows).toHaveCount(before - 1)
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible()
    const body = JSON.parse((await del).postData() || '{}')
    expect(typeof body.id).toBe('string')
  })

  test('reorder posts a move; clear-day posts a clear', async ({ page, app }) => {
    await app.boot({ route: '/kitchen', wait: '.hub' })
    const sheet = await openManage(page)
    const move = waitMeals(page, 'POST', (b) => b.action === 'move' && b.dir === 'down')
    // Reorder needs a slot with ≥2 meals — the Souper section (Spaghetti + Salade).
    await sheet.locator('.day-mng__sec', { hasText: 'Souper' }).locator('.kitchen__meal-row').first().locator('.action-menu__btn').click()
    await page.getByRole('menuitem', { name: 'Descendre' }).click()
    await move

    const clear = waitMeals(page, 'POST', (b) => b.action === 'clear' && b.slot === undefined)
    await sheet.getByRole('button', { name: 'Vider les repas' }).click()
    await clear
  })

  test('clearing one slot posts a clear with that slot', async ({ page, app }) => {
    await app.boot({ route: '/kitchen', wait: '.hub' })
    const sheet = await openManage(page)
    const clear = waitMeals(page, 'POST', (b) => b.action === 'clear' && b.slot === 'supper')
    await sheet.getByRole('button', { name: 'Vider ce repas' }).first().click()
    await clear
  })

  // Cook seam #1: 17h with no supper planned used to say NOTHING (the tile just
  // vanished while the weather kept the card alive). The hero now offers ONE calm
  // door — « Choisir un souper » → the Idées drawer.
  test('an empty « Ce soir » offers the door to the Idées drawer', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    // Registered AFTER mockApi so it wins: today has no supper, the rest stays.
    await page.route('**/api/board', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...BOARD, tonight: null, tonightMeals: [] }),
      }),
    )
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/board')
    await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
    const hero = page.locator('.now-card--supper-empty')
    await expect(hero).toBeVisible()
    await expect(hero).toContainText('Rien de prévu')
    await hero.getByRole('link', { name: /Choisir un souper/ }).click()
    await expect(page).toHaveURL(/\/kitchen\/idees/)
  })

  test('the board "Ce soir" lists every supper', async ({ page, app }) => {
    await app.boot({ route: '/board', wait: '.hub' })
    const heroes = page.locator('.board-heroes .now-card .what')
    await expect(heroes.filter({ hasText: 'Spaghetti maison' })).toBeVisible()
    await expect(heroes.filter({ hasText: 'Salade César' })).toBeVisible()
  })

  test('meals carry their slot food icon, never the carrot', async ({ page, app }) => {
    await app.boot({ route: '/board', wait: '.hub', clock: 'BASE' }) // freeze clock so the morning breakfast meal stays live

    // Today's breakfast (Crêpes) on the bento board is an Act tile with the egg icon.
    await expect(page.locator('.act .tile[data-icon="egg-bold"]').first()).toBeVisible()
    // No meal tile falls back to the generic carrot.
    await expect(page.locator('.act .tile[data-icon="carrot-bold"]')).toHaveCount(0)
  })
})


// ── folded from journey-meals.spec.ts ──────────────────────────────────────────────
test.describe('meal-order', () => {
  // Réglages ▸ Repas — the household's meal ORDER, HERO and serve HOURS. Three separate
  // settings that every meal surface reads through useMealPrefs, so the one thing worth
  // guarding e2e is that a saved order actually reaches those surfaces (rather than a
  // module constant quietly winning). Frontend-only harness, same as journey-list.spec.ts:
  // Vite + stubbed /api/**. The last test overrides the household payload with a custom
  // order + a moved hero + one edited hour, and asserts the settings rows AND the day
  // editor both follow it.

  test('Réglages ▸ Repas renders order + hero + hours, no overflow at 360px', async ({ page, app }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await app.boot({ route: '/settings?tab=kitchen&sub=meals', state: { calm: true } })

    const rows = page.locator('.meal-slots__row')
    await expect(rows.first()).toBeVisible({ timeout: 15_000 })
    await expect(rows).toHaveCount(5)

    // Default display order = chronological.
    const names = await page.locator('.meal-slots__name').allInnerTexts()
    expect(names.map((n) => n.trim())).toEqual(['Déjeuner', 'Dîner', 'Collation', 'Souper', 'Dessert'])

    // Default serve times, honest wall-clock, FR formatting.
    const hoursTxt = await page.locator('.meal-slots__hour-val').allInnerTexts()
    expect(hoursTxt.map((h) => h.trim())).toEqual(['7 h', '12 h', '15 h', '17 h 30', '20 h'])

    // Exactly one hero, and it's the souper.
    const hero = page.locator('.meal-slots__row.is-hero')
    await expect(hero).toHaveCount(1)
    await expect(hero.locator('.meal-slots__name')).toHaveText(/Souper/)

    // Every row carries a drag grip (operator, not guest).
    await expect(page.locator('.meal-slots__row .dnd-grip')).toHaveCount(5)

    // NO horizontal overflow: every descendant's right edge inside the section's.
    const overflow = await page.evaluate(() => {
      const list = document.querySelector('.meal-slots') as HTMLElement
      const right = list.getBoundingClientRect().right
      const bad: string[] = []
      list.querySelectorAll('*').forEach((el) => {
        const r = (el as HTMLElement).getBoundingClientRect()
        if (r.width > 0 && r.right > right + 1) bad.push((el as HTMLElement).className || el.tagName)
      })
      return bad
    })
    expect(overflow).toEqual([])
  })

  test('the hour stepper nudges by 30 min and PATCHes mealHours', async ({ page }) => {
    const patches: unknown[] = []
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.route('**/api/household', async (route) => {
      if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON())
      await route.fallback()
    })
    await page.goto('/settings?tab=kitchen&sub=meals')

    const souperRow = page.locator('.meal-slots__row', { hasText: 'Souper' })
    await expect(souperRow.locator('.meal-slots__hour-val')).toHaveText('17 h 30', { timeout: 15_000 })
    await souperRow.getByRole('button', { name: /Plus tard/ }).click()
    await expect(souperRow.locator('.meal-slots__hour-val')).toHaveText('18 h')
    expect(patches).toContainEqual(expect.objectContaining({ mealHours: { supper: 18 * 60 } }))
  })

  test('day editor lists the five slots chronologically, souper in place', async ({ page, app }) => {
    await app.boot({ route: '/kitchen', state: { calm: true } })
    await page.locator('.kitchen__day.is-today').getByRole('button', { name: /Gérer/ }).click()
    await expect(page.locator('.scene .day-mng__sec').first()).toBeVisible({ timeout: 15_000 })
    const heads = await page.locator('.day-mng__sec-head').allInnerTexts()
    expect(heads.map((h) => h.trim())).toEqual(['Déjeuner', 'Dîner', 'Collation', 'Souper', 'Dessert'])
  })

  // The claim under test: a CUSTOM order + hero is respected on every surface.
  const CUSTOM = {
    name: 'Maison Tremblay',
    postal: 'H2X 1Y4',
    includedStores: [],
    aiEnabled: true,
    mealOrder: ['dessert', 'supper', 'snack', 'lunch', 'breakfast'],
    mealHero: 'lunch',
    mealHours: { supper: 19 * 60 },
  }

  const bootCustom = async (page: Page, path: string) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.route('**/api/household', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CUSTOM) })
    })
    await page.goto(path)
  }

  test('a custom order + hero is respected in Réglages, the day editor and the kitchen grid', async ({ page }) => {
    await bootCustom(page, '/settings?tab=kitchen&sub=meals')
    await expect(page.locator('.meal-slots__row').first()).toBeVisible({ timeout: 15_000 })

    // Réglages rows follow the saved order…
    const names = await page.locator('.meal-slots__name').allInnerTexts()
    expect(names.map((n) => n.trim())).toEqual(['Dessert', 'Souper', 'Collation', 'Dîner', 'Déjeuner'])
    // …the hero moved to the dîner…
    await expect(page.locator('.meal-slots__row.is-hero .meal-slots__name')).toHaveText(/Dîner/)
    // …and the edited souper hour shows, the others keep their defaults.
    const hours = await page.locator('.meal-slots__hour-val').allInnerTexts()
    expect(hours.map((h) => h.trim())).toEqual(['20 h', '19 h', '15 h', '12 h', '7 h'])

    // The day editor renders the SAME order, with the dîner (the hero) in its place.
    await bootCustom(page, '/kitchen')
    await page.locator('.kitchen__day.is-today').getByRole('button', { name: /Gérer/ }).click()
    await expect(page.locator('.scene .day-mng__sec').first()).toBeVisible({ timeout: 15_000 })
    const heads = await page.locator('.day-mng__sec-head').allInnerTexts()
    expect(heads.map((h) => h.trim())).toEqual(['Dessert', 'Souper', 'Collation', 'Dîner', 'Déjeuner'])
  })
})


// ── folded from journey-meals.spec.ts ──────────────────────────────────────────────
test.describe('plan-tonight', () => {
  // Review #29 (2026-11-17), Geneviève: « Choisir un souper » led to a list of ideas with no
  // way to put one on tonight except « pick a slot, then a day ». The picker now leads with
  // « Ce soir »: one tap, today, the household's hero slot (souper by default).

  test.use({ timezoneId: 'America/Toronto' })

  test('an idea goes on tonight in one tap', async ({ app, page }) => {
    await app.boot({ route: '/kitchen/idees', wait: '.scene.ideas-drawer', clock: 'BASE', viewport: { width: 390, height: 844 } })
    await page.locator('.kitchen__idea-name').first().click()
    const tonight = page.locator('.meal-plan-pick__tonight').first()
    await expect(tonight).toHaveText('Ce soir')
    const [req] = await Promise.all([page.waitForRequest(isApi('POST', 'meals'), { timeout: 20_000 }), tonight.click()])
    const body = JSON.parse(req.postData() || '{}') as { date?: number; slot?: string }
    expect(body.date).toBe(MMID)
    expect(body.slot).toBe('supper')
  })

  test('« Ce soir » means the souper even when another slot was picked first', async ({ app, page }) => {
    await app.boot({ route: '/kitchen/idees', wait: '.scene.ideas-drawer', clock: 'BASE', viewport: { width: 390, height: 844 } })
    await page.locator('.kitchen__idea-name').first().click()
    const pick = page.locator('.meal-plan-pick').first()
    await pick.getByRole('radio', { name: 'Dîner' }).or(pick.getByRole('button', { name: 'Dîner' })).first().click()
    const [req] = await Promise.all([page.waitForRequest(isApi('POST', 'meals'), { timeout: 20_000 }), pick.locator('.meal-plan-pick__tonight').click()])
    expect((JSON.parse(req.postData() || '{}') as { slot?: string }).slot).toBe('supper')
  })
})


// ── folded from unplaced-journey-meals.spec.ts ──────────────────────────────────────────────
test6.describe('unplaced-meals', () => {
  // « À PLACER » — THE WEEK GRID'S FIRST CARD: this week's meals with no day yet
  // (mig 0155; Marc, 2026-11-14: « plan the week without assigning a day yet, say have 5
  // meals in there, and drag and drop easily »).
  //
  // Read from the WRITE, like journey-meals.spec.ts: the mock echoes nothing, so a
  // drop that fired the wrong body — or none — is only visible at the request. Four doors:
  // a bin row dragged onto a day, a planned meal dragged into the bin, the tap-a-row day
  // picker (the gesture's mirror for a mouse/keyboard), and an idea sent to the bin.

  // > DND_HOLD_MS (400) — see journey-meals.spec.ts for why it is hardcoded. A ceiling
  // for the wait on the ghost, not a sleep.
  const HOLD = 700

  const UNPLACED = [
    { id: 'u1', title: 'Lasagne', recipe_id: null, slot: null, is_leftover: 0, position: 0 },
    { id: 'u2', title: 'Poké bols', recipe_id: null, slot: null, is_leftover: 0, position: 1 },
  ]

  const mealsPost = (action: string) => (r: Request) =>
    r.method() === 'POST' && new URL(r.url()).pathname === '/api/meals' && new RegExp(`"action":"${action}"`).test(r.postData() ?? '')

  type Row = Record<string, unknown> & { id: string }

  /**
   * /api/meals as a tiny STATEFUL server: a write moves the row, and the refetch every
   * write triggers reads it back. A stateless echo (the first version of this spec) let
   * that refetch put the old row straight back over the optimistic move — green locally,
   * red on CI's single worker, where the refetch landed before the assertion.
   */
  async function statefulMeals(page: Page) {
    const st = { days: [...MEALS.days] as unknown as Row[], unplaced: [...UNPLACED] as Row[] }
    await page.route('**/api/meals**', (route) => {
      const req = route.request()
      const url = new URL(req.url())
      if (url.pathname !== '/api/meals') return route.fallback()
      if (req.method() === 'GET') {
        if (url.searchParams.has('date')) return route.fallback()
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...MEALS, ...st }) })
      }
      const b = (req.postDataJSON() ?? {}) as Record<string, unknown>
      if (b.action === 'place') {
        const u = st.unplaced.find((x) => x.id === b.id)
        st.unplaced = st.unplaced.filter((x) => x.id !== b.id)
        if (u) st.days.push({ ...u, date: b.toDate, slot: b.slot, cook_member_id: null })
      } else if (b.action === 'link') {
        for (const g of b.groups as string[][]) {
          const key = g.length > 1 ? `k-${g.join('-')}` : null
          st.unplaced = st.unplaced.map((u) => (g.includes(u.id) ? { ...u, link_id: key } : u))
        }
      } else if (b.action === 'slot') {
        const ids = b.ids as string[]
        st.unplaced = st.unplaced.map((u) => (ids.includes(u.id) ? { ...u, slot: b.slot } : u))
      } else if (b.action === 'unplace') {
        const m = st.days.find((x) => x.id === b.id)
        st.days = st.days.filter((x) => x.id !== b.id)
        if (m) st.unplaced.push({ id: m.id, title: m.title, recipe_id: m.recipe_id ?? null, slot: m.slot, is_leftover: 0, position: 99 })
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'u-new' }) })
    })
  }

  async function openGrid(page: Page) {
    await page.clock.setFixedTime(new Date(BASE * 1000))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await statefulMeals(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/kitchen')
    await expect(page.locator('.kitchen__day').first()).toBeVisible({ timeout: 15_000 })
  }

  /** Press-and-hold a row past DND_HOLD_MS, carry it onto a zone, release. */
  async function holdDrag(page: Page, from: Locator, target: Locator, cue: Locator = target, cueClass = /is-droptarget/) {
    const a = await boxOf(from)
    const sx = a.x + a.width / 2
    const sy = a.y + a.height / 2
    await page.mouse.move(sx, sy)
    await page.mouse.down()
    // The hold arms the drag on its own (no move): the ghost label appearing IS that moment.
    await expect(page.locator('.dnd-ghost')).toBeVisible({ timeout: HOLD * 4 })
    await page.mouse.move(sx + 2, sy + 2)
    const b = await boxOf(target)
    await page.mouse.move(b.x + b.width / 2, b.y + 20, { steps: 12 })
    await expect(cue).toHaveClass(cueClass)
    await page.mouse.up()
  }

  test6('« À placer » is the FIRST card of the week, before today, holding its meals', async ({ page }) => {
    await openGrid(page)
    const first = page.locator('.kitchen__week > li').first()
    await expect(first).toHaveClass(/kitchen__day--unplaced/)
    await expect(first).toContainText('À placer')
    await expect(first.locator('.kitchen__unplaced-row')).toHaveText([/Lasagne/, /Poké bols/])
    await expect(page.locator('.kitchen__week > li').nth(1)).toHaveClass(/is-today/)
  })

  test6('a meal from « À placer » drags onto a day — placed, in the hero slot', async ({ page }) => {
    await openGrid(page)
    const tomorrow = addLocalDays(MMID, 1)
    const row = page.locator('.kitchen__unplaced-row', { hasText: 'Lasagne' })
    const target = page.locator(`.kitchen__day[data-dnd-zone="${tomorrow}"]`)
    const [req] = await Promise.all([page.waitForRequest(mealsPost('place'), { timeout: 20_000 }), holdDrag(page, row, target)])
    expect(req.postDataJSON()).toMatchObject({ action: 'place', id: 'u1', toDate: tomorrow, slot: 'supper' })
    // Optimistic: the row leaves the bin at once and lands on the day.
    await expect(page.locator('.kitchen__unplaced-row', { hasText: 'Lasagne' })).toHaveCount(0)
    await expect(target).toContainText('Lasagne')
  })

  test6('a planned side meal drags off its day INTO « À placer »', async ({ page }) => {
    await openGrid(page)
    const crepes = page.locator('.kitchen__day.is-today .kitchen__day-meal', { hasText: 'Crêpes' })
    const bin = page.locator('.kitchen__day--unplaced')
    const [req] = await Promise.all([page.waitForRequest(mealsPost('unplace'), { timeout: 20_000 }), holdDrag(page, crepes, bin)])
    expect(req.postDataJSON()).toMatchObject({ action: 'unplace', id: 'meal4' })
    await expect(bin.locator('.kitchen__unplaced-row', { hasText: 'Crêpes' })).toBeVisible()
  })

  test6('without a drag: tap a row, pick a day (the mouse / keyboard mirror)', async ({ page }) => {
    await openGrid(page)
    await page.locator('.kitchen__unplaced-open', { hasText: 'Poké bols' }).click()
    const picker = page.locator('.kitchen__day--unplaced .meal-plan-pick')
    await expect(picker).toBeVisible()
    const [req] = await Promise.all([page.waitForRequest(mealsPost('place')), picker.locator('.meal-plan-pick__days button').nth(2).click()])
    expect(req.postDataJSON()).toMatchObject({ action: 'place', id: 'u2', toDate: addLocalDays(MMID, 2) })
  })

  test6('an idea goes to « À placer » from its day picker — the first chip', async ({ page }) => {
    await openGrid(page)
    const idea = page.locator('.kitchen__ideas .kitchen__idea', { hasText: 'Soupe poulet-nouilles' })
    await idea.scrollIntoViewIfNeeded()
    await idea.getByRole('button', { name: /Soupe poulet-nouilles/ }).click()
    const first = idea.locator('.meal-plan-pick__days button').first()
    await expect(first).toHaveText('À placer')
    const [req] = await Promise.all([page.waitForRequest(mealsPost('park')), first.click()])
    expect(req.postDataJSON()).toMatchObject({ action: 'park', title: 'Soupe poulet-nouilles' })
  })

  // « make sure we can plan for this "day" too … instead of a real day, from recipes and
  // such » (Marc, 2026-11-14): every planning picker offers « À placer » first.
  test6('a recipe plans straight into « À placer » from its « Planifier »', async ({ page }) => {
    await openGrid(page)
    await page.goto('/kitchen/recipe/rc1')
    await page.locator('.recipe-modal').waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByRole('button', { name: /^Planifier$/ }).click()
    const chip = page.locator('.meal-plan-pick__unplaced')
    await expect(chip).toHaveText('À placer')
    const [req] = await Promise.all([page.waitForRequest(mealsPost('park')), chip.click()])
    expect(req.postDataJSON()).toMatchObject({ action: 'park', recipeId: 'rc1', slot: 'supper' })
    await expect(page.getByRole('button', { name: /Planifié/ })).toBeDisabled()
  })

  test6('a planned meal goes back to « À placer » from « Déplacer… » — no drag, and « Annuler » puts it back', async ({ page }) => {
    await openGrid(page)
    await page.goto(`/kitchen/day/${MMID}?vue=repas`)
    const row = page.locator('.day-mng__sec', { hasText: 'Souper' }).locator('.kitchen__meal-row', { hasText: 'Spaghetti maison' })
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.locator('.action-menu__btn').click()
    await page.getByRole('menuitem', { name: 'Déplacer…' }).click()
    const sheet = page.locator('.sheet.show')
    const [req] = await Promise.all([page.waitForRequest(mealsPost('unplace')), sheet.locator('.meal-plan-pick__unplaced').click()])
    expect(req.postDataJSON()).toMatchObject({ action: 'unplace', id: 'meal1' })
    await expect(row).toHaveCount(0)
    const [back] = await Promise.all([
      page.waitForRequest(mealsPost('place')),
      page.getByRole('button', { name: 'Annuler' }).click(),
    ])
    expect(back.postDataJSON()).toMatchObject({ action: 'place', id: 'meal1', toDate: MMID, slot: 'supper' })
  })

  test6('« Magasiner la semaine » shops the « À placer » meals too', async ({ page }) => {
    // A week planned WITHOUT its days: nothing dated, one recipe waiting in the bin. The
    // weekly shop walked only the dated meals, so this — the whole point of the bin —
    // offered nothing to buy.
    await page.clock.setFixedTime(new Date(BASE * 1000))
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await page.route('**/api/meals**', (route) => {
      const url = new URL(route.request().url())
      if (url.pathname !== '/api/meals' || route.request().method() !== 'GET' || url.searchParams.has('date')) return route.fallback()
      const unplaced = [{ id: 'u9', title: 'Tacos au poulet', recipe_id: 'rc2', slot: 'supper', is_leftover: 0, position: 0 }]
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...MEALS, days: [], recent: [], unplaced }) })
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/kitchen')
    await expect(page.locator('.kitchen__day--unplaced')).toContainText('Tacos au poulet', { timeout: 15_000 })

    await page.locator('.add-fab').click()
    await page.locator('.sheet.show').getByRole('button', { name: /Magasiner la semaine/ }).click()
    const shop = page.locator('.kitchen__shop')
    await expect(shop.locator('.kitchen__staples-chips .chip', { hasText: 'Tortillas' })).toBeVisible()
    await shop.getByRole('button', { name: 'Tout cocher' }).click()
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/recipe-to-list'),
      shop.locator('.btn--primary').click(),
    ])
    expect(req.postData() ?? '').toContain('Salsa')
  })

  // ── Linked rows (mig 0156; Marc, 2026-11-16: « link two recipes together in the À placer
  // panel so that after they move together until explicitly unlinked »).

  // Marc, 2026-11-17: the link « appears on drag and drop … not with always-on UI buttons ».
  test6('drag a row onto another: they link — one bracket — and the broken chain on its line detaches it', async ({ page }) => {
    await openGrid(page)
    const bin = page.locator('.kitchen__day--unplaced')
    await expect(bin.locator('.kitchen__unplaced-unlink'), 'nothing between or on unlinked rows').toHaveCount(0)
    const poke = bin.locator('.kitchen__unplaced-row', { hasText: 'Poké bols' })
    const lasagne = bin.locator('.kitchen__unplaced-item', { hasText: 'Lasagne' })
    const lasagneGroup = bin.locator('.kitchen__unplaced-group', { hasText: 'Lasagne' })
    const [req] = await Promise.all([
      page.waitForRequest(mealsPost('link'), { timeout: 20_000 }),
      holdDrag(page, poke, lasagne, lasagneGroup, /is-linktarget/),
    ])
    expect(req.postDataJSON()).toMatchObject({ action: 'link', groups: [['u1', 'u2']] })
    const group = bin.locator('.kitchen__unplaced-group.is-linked')
    await expect(group.locator('.kitchen__unplaced-row')).toHaveText([/Lasagne/, /Poké bols/])
    // Unlink sits on the row's own line, beside its ✕ — not on a line of its own.
    const unlink = bin.getByRole('button', { name: /Détacher « Poké bols »/ })
    const r = await boxOf(bin.locator('.kitchen__unplaced-row', { hasText: 'Poké bols' }))
    const u = await boxOf(unlink)
    expect(u.y >= r.y - 1 && u.y + u.height <= r.y + r.height + 1, 'the unlink is inside its row').toBe(true)
    const [cut] = await Promise.all([page.waitForRequest(mealsPost('link')), unlink.click()])
    expect(cut.postDataJSON()).toMatchObject({ action: 'link', groups: [['u2'], ['u1']] })
    await expect(bin.locator('.kitchen__unplaced-group.is-linked')).toHaveCount(0)
  })

  test6('without a drag: tap a row, « Lier à » the other one (the non-drag mirror)', async ({ page }) => {
    await openGrid(page)
    const bin = page.locator('.kitchen__day--unplaced')
    await bin.locator('.kitchen__unplaced-open', { hasText: 'Lasagne' }).click()
    const chip = bin.locator('.chip-group', { hasText: 'Lier à' }).getByRole('button', { name: /Poké bols/ })
    const [req] = await Promise.all([page.waitForRequest(mealsPost('link')), chip.click()])
    expect(req.postDataJSON()).toMatchObject({ action: 'link', groups: [['u1', 'u2']] })
    await expect(bin.locator('.kitchen__unplaced-group.is-linked')).toBeVisible()
  })

  test6('a linked pair drags as one: both land on the day, in one slot', async ({ page }) => {
    await openGrid(page)
    await page.locator('.kitchen__unplaced-open', { hasText: 'Lasagne' }).click()
    await page.locator('.chip-group', { hasText: 'Lier à' }).getByRole('button', { name: /Poké bols/ }).click()
    await expect(page.locator('.kitchen__unplaced-group.is-linked')).toBeVisible()
    const tomorrow = addLocalDays(MMID, 1)
    const placed: unknown[] = []
    page.on('request', (r) => void (mealsPost('place')(r) && placed.push(r.postDataJSON())))
    const row = page.locator('.kitchen__unplaced-row', { hasText: 'Poké bols' })
    const target = page.locator(`.kitchen__day[data-dnd-zone="${tomorrow}"]`)
    await holdDrag(page, row, target)
    await expect.poll(() => placed.length).toBe(2)
    expect(placed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'u1', toDate: tomorrow, slot: 'supper' }),
        expect.objectContaining({ id: 'u2', toDate: tomorrow, slot: 'supper' }),
      ]),
    )
    await expect(page.locator('.kitchen__unplaced-row')).toHaveCount(0)
    await expect(target).toContainText('Lasagne')
    await expect(target).toContainText('Poké bols')
  })

  // « drop inside specific meals for a date … dinner being the most spacious and obvious
  // drop zone » (same day): arriving over a day opens its meal pills, the dragged meal's
  // own slot widest (Lasagne is a souper here; 2026-11-17: the band follows the meal).
  test6('arriving over a day opens its meal pills — the meal’s own slot widest — and a pill picks the slot', async ({ page }) => {
    await openGrid(page)
    const tomorrow = addLocalDays(MMID, 1)
    const day = page.locator(`.kitchen__day[data-dnd-zone="${tomorrow}"]`)
    const row = page.locator('.kitchen__unplaced-row', { hasText: 'Lasagne' })
    const a = await boxOf(row)
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
    await page.mouse.down()
    await expect(page.locator('.dnd-ghost')).toBeVisible({ timeout: HOLD * 4 })
    await expect(page.locator('.kitchen__slot-drops'), 'no pills before arriving anywhere').toHaveCount(0)
    const d = await boxOf(day)
    await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2, { steps: 12 })
    const pills = day.locator('.kitchen__slot-drop')
    await expect(pills.first()).toHaveClass(/is-main/)
    await expect(pills.first()).toHaveAttribute('data-dnd-zone', `slot:${tomorrow}:supper`)
    await expect(page.locator('.kitchen__slot-drops'), 'only the day under the finger opens').toHaveCount(1)
    const hero = await boxOf(pills.first())
    const side = await boxOf(pills.nth(1))
    expect(hero.width * hero.height, 'the hero is the big, obvious target').toBeGreaterThan(side.width * side.height * 3)
    const lunch = day.locator(`[data-dnd-zone="slot:${tomorrow}:lunch"]`)
    const l = await boxOf(lunch)
    await page.mouse.move(l.x + l.width / 2, l.y + l.height / 2, { steps: 6 })
    await expect(lunch).toHaveClass(/is-over/)
    const [req] = await Promise.all([page.waitForRequest(mealsPost('place')), page.mouse.up()])
    expect(req.postDataJSON()).toMatchObject({ action: 'place', id: 'u1', toDate: tomorrow, slot: 'lunch' })
    await expect(page.locator('.kitchen__slot-drops')).toHaveCount(0)
  })

  // « Quel repas ? → collation … changes the icon and type and the drag-and-drop main zone »
  // (Marc, 2026-11-17): the picker's slot is the ROW's slot now, not a pick for one trip.
  test6('« Quel repas ? » changes the row itself — and a drag of it opens with that slot as the big band', async ({ page }) => {
    await openGrid(page)
    const bin = page.locator('.kitchen__day--unplaced')
    await bin.locator('.kitchen__unplaced-open', { hasText: 'Lasagne' }).click()
    const snack = bin.locator('.slot-picker').getByRole('button', { name: /Collation/ })
    const [req] = await Promise.all([page.waitForRequest(mealsPost('slot')), snack.click()])
    expect(req.postDataJSON()).toMatchObject({ action: 'slot', ids: ['u1'], slot: 'snack' })
    await expect(snack).toHaveAttribute('aria-pressed', 'true')
    // Close the panel, then drag the row: the band it opens is Collation.
    await bin.locator('.kitchen__unplaced-open', { hasText: 'Lasagne' }).click()
    const tomorrow = addLocalDays(MMID, 1)
    const day = page.locator(`.kitchen__day[data-dnd-zone="${tomorrow}"]`)
    const row = bin.locator('.kitchen__unplaced-row', { hasText: 'Lasagne' })
    const a = await boxOf(row)
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
    await page.mouse.down()
    await expect(page.locator('.dnd-ghost')).toBeVisible({ timeout: HOLD * 4 })
    const d = await boxOf(day)
    await page.mouse.move(d.x + d.width / 2, d.y + 20, { steps: 12 })
    await expect(day.locator('.kitchen__slot-drop').first()).toHaveAttribute('data-dnd-zone', `slot:${tomorrow}:snack`)
    await expect(day.locator('.kitchen__slot-drop').first()).toHaveClass(/is-main/)
    const [place] = await Promise.all([page.waitForRequest(mealsPost('place')), page.mouse.up()])
    expect(place.postDataJSON()).toMatchObject({ action: 'place', id: 'u1', toDate: tomorrow, slot: 'snack' })
  })
})


// ── folded from journey-meals.spec.ts ──────────────────────────────────────────────
test7.describe('grid-side-meal-drag', () => {
  // A SIDE MEAL DRAGS TO ANOTHER DAY ON THE WEEK GRID — as itself.
  //
  // Marc, from the phone, 2026-09-10: « drag n dropping a snack no longer works ». It
  // never had: side meals were rendered `draggable: false` by the very commit that made
  // them look exactly like the supper row (9a1c48f, "side meals render as full
  // tap-to-recipe rows"). Rows that look identical where only one moves is a promise
  // the layout makes and the gesture breaks — so a side meal now drags too, keyed as
  // ONE meal (`meal:date:slot:id`), and lands in the target day in its own slot. The
  // supper headline keeps its older meaning: dragging it moves the day's WHOLE supper
  // plan (keyed by DATE).
  //
  // Both are read from the WRITE, not the screen: the mock echoes nothing, so a drop
  // that fired the wrong body — or none — is only visible at the request.
  //
  // Fixture: day MMID holds « Crêpes » (meal4, breakfast) beside two suppers (meal1
  // « Spaghetti maison », meal5 « Salade César »); the next day holds « Tacos ».

  // > DND_HOLD_MS (400, src/lib/dnd.tsx). Hardcoded because the e2e tsconfig cannot
  // import a .tsx module (no --jsx) — the same shape journey-board-arrange.spec.ts uses for its
  // LONG_PRESS hold. If the arm time ever rises past this, the drag below never starts
  // and both cases go red together, which is the right way to learn it.
  const HOLD = 700

  const isReschedule = (r: Request) =>
    r.method() === 'POST' && new URL(r.url()).pathname === '/api/meals' && /"action":"reschedule"/.test(r.postData() ?? '')

  async function openGrid(page: Page) {
    await page.clock.setFixedTime(new Date(BASE * 1000))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/kitchen')
    await expect(page.locator('.kitchen__day.is-today')).toBeVisible({ timeout: 15_000 })
  }

  /** Press-and-hold a row past DND_HOLD_MS, carry it onto a day zone, release — onto
   *  one of the day's meal pills when `slot` is given (they open as the drag arrives;
   *  the big band — the dragged meal's own slot, `main` when given — is where a drop
   *  « on the day » lands). */
  async function holdDrag(page: Page, from: ReturnType<Page['locator']>, toZoneDate: number, slot?: string, main?: string) {
    const target = page.locator(`.kitchen__day[data-dnd-zone="${toZoneDate}"]`)
    await target.scrollIntoViewIfNeeded()
    const a = await from.boundingBox()
    const b = await target.boundingBox()
    if (!a || !b) throw new Error('drag endpoints not measurable')
    const sx = a.x + a.width / 2
    const sy = a.y + a.height / 2
    await page.mouse.move(sx, sy)
    await page.mouse.down()
    // The hold: rest past the arm time WITHOUT moving (a move before it aborts as a scroll).
    await page.waitForTimeout(HOLD)
    await page.mouse.move(sx + 2, sy + 2)
    await page.mouse.move(b.x + b.width / 2, b.y + 20, { steps: 12 })
    await expect(target).toHaveClass(/is-droptarget/)
    if (main) await expect(target.locator(`[data-dnd-zone="slot:${toZoneDate}:${main}"]`)).toHaveClass(/is-main/)
    if (slot) {
      const pill = target.locator(`[data-dnd-zone="slot:${toZoneDate}:${slot}"]`)
      const p = await pill.boundingBox()
      if (!p) throw new Error('slot pill not measurable')
      await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2, { steps: 6 })
      await expect(pill).toHaveClass(/is-over/)
    }
    await page.mouse.up()
  }

  // Since the meal pills (2026-11-16) a hovered day opens one pill per meal; the big band
  // is the DRAGGED meal's own slot (Marc, 2026-11-17), so a breakfast dropped « on the
  // day » stays a breakfast. Another slot is its own, smaller pill.
  test7('a side meal (breakfast) drags to the next day as ONE meal, and stays a breakfast', async ({ page }) => {
    await openGrid(page)
    const nextDay = addLocalDays(MMID, 1)
    const crepes = page.locator('.kitchen__day.is-today').locator('.kitchen__day-meal', { hasText: 'Crêpes' })
    await expect(crepes).toBeVisible()
    const [req] = await Promise.all([page.waitForRequest(isReschedule, { timeout: 20_000 }), holdDrag(page, crepes, nextDay, undefined, 'breakfast')])
    const body = JSON.parse(req.postData() ?? '{}') as { action: string; id: string; toDate: number; slot?: string }
    expect(body).toMatchObject({ action: 'reschedule', id: 'meal4', toDate: nextDay, slot: 'breakfast' })
  })

  test7('the supper headline still moves the day\'s WHOLE supper plan', async ({ page }) => {
    await openGrid(page)
    const nextDay = addLocalDays(MMID, 1)
    const supper = page.locator('.kitchen__day.is-today').locator('.kitchen__day-meal', { hasText: 'Spaghetti maison' })
    const seen: string[] = []
    page.on('request', (r) => {
      if (isReschedule(r)) seen.push((JSON.parse(r.postData() ?? '{}') as { id: string }).id)
    })
    await holdDrag(page, supper, nextDay)
    await expect.poll(() => seen.slice().sort(), { timeout: 10_000 }).toEqual(['meal1', 'meal5'])
  })
})


// ── folded from journey-meals.spec.ts ──────────────────────────────────────────────
test8.describe('interactions-kitchen', () => {
  // Interaction coverage, La cuisine: the plan, recipes, the meal peek, a kid pick. The harness and its discipline are at the top of interact.ts:
  // a form asserts the request it fires, an optimistic flow asserts what the user sees.

  // ──────────────────────────── kitchen ──────────────────────────────────

  test8.describe('kitchen', () => {
    test8.beforeEach(async ({ page }) => {
      await APP('/kitchen')(page)
      await settle(page, '.hub')
    })

    test8('add a running-low pantry item', async ({ page }) => {
      await page.locator('.subtabs__opt', { hasText: 'Garde-manger' }).click()
      // The add box waits behind its section's ＋ (SectionAdd) — three permanently-open
      // composers used to own the garde-manger's whole first screen.
      await page.getByRole('button', { name: 'Ajouter un aliment', exact: true }).click()
      const input = page.getByRole('textbox', { name: 'Ajouter un aliment', exact: true })
      await input.fill('Lait')
      await expectApi(page, 'POST', 'pantry', () => input.press('Enter'))
    })

    test8('checking a low item adds it to the list (explicit) and clears the reminder', async ({ page }) => {
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

    test8('undo restores a cleared pantry item', async ({ page }) => {
      await page.locator('.subtabs__opt', { hasText: 'Garde-manger' }).click()
      const lows = page.locator('.kitchen__low li')
      await lows.first().locator('button.checkrow__check').click()
      await expect(lows).toHaveCount(2)
      await expect(page.locator('.undo-toast')).toBeVisible()
      await page.locator('.undo-toast__btn').click()
      await expect(lows).toHaveCount(3)
    })

    test8('Ctrl+Z takes back the newest undo entry, but not while typing', async ({ page }) => {
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

    test8('planning a supper saves directly on Enter — no "Mettre" pill, no ingredients opt-in', async ({ page }) => {
      // The per-day planning controls live in the day editor SCENE now
      // (/kitchen/day/:date). Souper renders LAST (chronological order). No
      // submitLabel is passed anymore, so EntityCombobox renders an icon-only ✓
      // instead of a labeled "Mettre" pill, and Enter alone still saves.
      await page.locator('.kitchen__day.is-today').getByRole('button', { name: /Gérer/ }).click()
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

    test8('a day shows its breakfast/lunch/snack slots and sets one (POST meals)', async ({ page }) => {
      await page.locator('.kitchen__day.is-today').getByRole('button', { name: /Gérer/ }).click()
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

    test8('shop the week gathers ingredients and adds them to the list', async ({ page }) => {
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

    test8('adding a use-soon item posts it (and never touches the list)', async ({ page }) => {
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

  test8.describe('recipes', () => {
    test8.beforeEach(async ({ page }) => {
      await APP('/kitchen')(page)
      await settle(page, '.hub')
      // The recipe book now lives behind the "Recettes" sub-tab (kitchen de-densify).
      await page.locator('.subtabs__opt', { hasText: 'Recettes' }).click()
    })

    test8('the servings scaler rescales ingredient quantities', async ({ page }) => {
      // A card opens the recipe view route directly (the detail peek was removed).
      await page.locator('.recipe-card', { hasText: 'Spaghetti' }).first().click() // 4 servings, 400 g pâtes
      const modal = page.locator('.recipe-modal')
      await expect(modal.locator('.recipe-view__ings')).toContainText('400 g')
      await modal.locator('[aria-label="Plus de portions"]').click() // 4 → 5 servings
      await expect(modal.locator('.recipe-view__ings')).toContainText('500 g')
    })

    test8('a recipe pushes its ingredients to the list and opens cook mode', async ({ page }) => {
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

    test8('a step with a duration offers a tappable cook-mode timer', async ({ page }) => {
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

    test8('"quoi cuisiner?" toggles a cookability ranking with badges', async ({ page }) => {
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

    test8('tag chips filter the recipe grid', async ({ page }) => {
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

    test8('creating a recipe posts it', async ({ page }) => {
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

    test8('a recipe step edits in a memo, one open at a time', async ({ page }) => {
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
  test8('a recipe-less meal still opens the peek, with its plan actions', async ({ page }) => {
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
  test8('a recipe-linked meal peeks too, carrying the day door AND the recipe doors', async ({ page }) => {
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

  test8('a kid recipe pick drops a dated idea into the meal-ideas pool', async ({ page }) => {
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
})
