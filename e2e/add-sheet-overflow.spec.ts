import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// A bottom sheet is a vertical surface — it must never scroll left/right, and nothing
// inside it may bleed off the right edge. Guards two regressions:
//   1. the whole sheet panning sideways once you scrolled down (old bug: overflow-y:auto
//      but no overflow-x, so the cross axis computed to auto);
//   2. a wide inner row (e.g. the todo "En tout temps / Aujourd'hui / Une date" scope
//      buttons) running UNDER the right edge — invisible to a scrollWidth check because
//      `.sheet` is `overflow-x:hidden`, so the clip hides it. See .sheet in
//      styles/sheets/capture.css and the .cluster/.rail row primitives in styles/core.css.
//
// The measurement that catches #2 is a per-element bounding-rect check: for every
// visible descendant, its right edge must not exceed the sheet's right edge. That sees
// through the clip, which `scrollWidth - clientWidth` cannot. The check itself
// (worstRightBleed/assertClean) lives in e2e/overflow.ts, shared with the
// state-matrix suite.
import { assertClean } from './overflow'

async function boot(page: Page, width = 390) {
  await page.setViewportSize({ width, height: 844 })
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

// Checked at both phone widths — content is tightest at 360.
for (const width of [360, 390]) {
  test(`board ＋ sheet never overflows sideways @${width}`, async ({ page }) => {
    await boot(page, width)
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
    await page.waitForTimeout(150)
    await assertClean(page, 'chooser grid, scrolled')

    // State 2 — open the « Note rapide » box's 📎, which unfolds a Cluster of three
    // memo chips (Mémo vocal · Dessiner · Photo). These were three full-width
    // buttons; as a wrapped chip row they must still stay inside the sheet at 360px.
    await page.locator('.addsheet__lead .memo-attach__btn').click()
    await expect(page.locator('.memo-attach__picks')).toBeVisible()
    await assertClean(page, 'note attach chip row')
    await page.locator('.addsheet__lead .memo-attach__btn').click()

    // State 3 — tap the "À compléter" (todo) tile to reveal the scope button row
    // (En tout temps / Aujourd'hui / Une date) — the row that used to bleed right.
    const todoTile = page.locator('.cat-pick[data-mode="todo"]')
    if (await todoTile.count()) {
      await todoTile.click()
      await expect(page.locator('.addsheet__scope')).toBeVisible()
      await assertClean(page, 'todo scope row')

      // State 4 — pick "Une date", which reveals the full-width native date input.
      await page.locator('.addsheet__scope .btn').last().click()
      await expect(page.locator('.addsheet__scope-date')).toBeVisible()
      await assertClean(page, 'todo scope row + date picker')

      // State 4b — open the « Modèles : » dropdown. Each template row now carries a
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
  test(`« Depuis ce matin » sheet never overflows sideways @${width}`, async ({ page }) => {
    await boot(page, width)
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
  test(`IdeasDrawer never overflows sideways @${width}`, async ({ page }) => {
    await boot(page, width)
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
    for (const label of ['Favoris', 'À écouler', 'Proposé par']) {
      await page.locator('.ideas-drawer .subtabs__opt', { hasText: label }).click()
      await page.waitForTimeout(150)
      await assertClean(page, `ideas drawer, ${label} tab`, IDEAS_BOX, 'auto')
    }
  })
}
