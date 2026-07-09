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
// through the clip, which `scrollWidth - clientWidth` cannot.

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

// The largest amount (px) by which any VISIBLE descendant of `.sheet` runs past the
// sheet's right edge. Sees through `overflow-x:hidden` (unlike scrollWidth), plus the
// classic sheet-level sideways-pan number for good measure. <= 1 = clean (sub-pixel).
async function worstRightBleed(page: Page): Promise<{ bleed: number; pan: number; culprit: string }> {
  return page.evaluate(() => {
    const sheet = document.querySelector('.sheet') as HTMLElement | null
    if (!sheet) return { bleed: -1, pan: -1, culprit: 'no .sheet' }
    const edge = sheet.getBoundingClientRect().right
    let bleed = 0
    let culprit = ''
    for (const el of Array.from(sheet.querySelectorAll<HTMLElement>('*'))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue // hidden / collapsed — ignore
      const over = r.right - edge
      if (over > bleed) {
        bleed = over
        culprit = (el.className || el.tagName).toString().slice(0, 80)
      }
    }
    return { bleed, pan: sheet.scrollWidth - sheet.clientWidth, culprit }
  })
}

async function assertClean(page: Page, label: string) {
  const { bleed, pan, culprit } = await worstRightBleed(page)
  expect(pan, `${label}: sheet pans sideways`).toBeLessThanOrEqual(1)
  expect(bleed, `${label}: "${culprit}" bleeds off the right edge`).toBeLessThanOrEqual(1)
  // The sheet must explicitly clip the cross axis regardless.
  const overflowX = await page.evaluate(() => {
    const s = document.querySelector('.sheet') as HTMLElement | null
    return s ? getComputedStyle(s).overflowX : ''
  })
  expect(overflowX, `${label}: sheet overflow-x`).toBe('hidden')
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

    // State 2 — tap the "À compléter" (todo) tile to reveal the scope button row
    // (En tout temps / Aujourd'hui / Une date) — the row that used to bleed right.
    const todoTile = page.locator('.cat-pick[data-mode="todo"]')
    if (await todoTile.count()) {
      await todoTile.click()
      await expect(page.locator('.addsheet__scope')).toBeVisible()
      await assertClean(page, 'todo scope row')

      // State 3 — pick "Une date", which reveals the full-width native date input.
      await page.locator('.addsheet__scope .btn').last().click()
      await expect(page.locator('.addsheet__scope-date')).toBeVisible()
      await assertClean(page, 'todo scope row + date picker')
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
