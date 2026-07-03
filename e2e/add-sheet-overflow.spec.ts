import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// A bottom sheet is a vertical surface — it must never scroll left/right. Guards
// the regression where a wide row in the board ＋ sheet let you pan sideways once
// you scrolled down (the sheet had overflow-y:auto but no overflow-x, so the cross
// axis computed to auto). The operator forms are full-screen scenes now, so the
// remaining widest content is the chooser tile grid. See .sheet in styles/sheets/capture.css.

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

async function sheetOverflowsX(page: Page): Promise<number> {
  return page.evaluate(() => {
    const s = document.querySelector('.sheet') as HTMLElement | null
    return s ? s.scrollWidth - s.clientWidth : -1
  })
}

// Checked at both phone widths — the chooser tile grid is tightest at 360.
for (const width of [360, 390]) {
  test(`board ＋ sheet does not scroll sideways @${width}`, async ({ page }) => {
    await boot(page, width)
    await page.goto('/board')
    await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })

    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    // The chooser tile grid (capture / event / chore / routine) is the widest
    // content now that the operator forms are full-screen scenes.
    await expect(page.locator('.sheet > .cat-grid')).toBeVisible()

    // No horizontal overflow at rest…
    expect(await sheetOverflowsX(page)).toBeLessThanOrEqual(1)

    // …and none after scrolling the sheet down (the reported trigger).
    await page.evaluate(() => {
      const s = document.querySelector('.sheet') as HTMLElement | null
      if (s) s.scrollTop = s.scrollHeight
    })
    await page.waitForTimeout(150)
    expect(await sheetOverflowsX(page)).toBeLessThanOrEqual(1)
    // computed style must explicitly clip the cross axis
    const overflowX = await page.evaluate(() => {
      const s = document.querySelector('.sheet') as HTMLElement | null
      return s ? getComputedStyle(s).overflowX : ''
    })
    expect(overflowX).toBe('hidden')
  })
}
