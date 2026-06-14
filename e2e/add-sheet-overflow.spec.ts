import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// A bottom sheet is a vertical surface — it must never scroll left/right. Guards
// the regression where the chore form ("Ajouter une corvée") in the board ＋ sheet
// let you pan sideways once you scrolled down (the sheet had overflow-y:auto but no
// overflow-x, so the cross axis computed to auto). See .sheet in styles/sheets.css.

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

async function sheetOverflowsX(page: Page): Promise<number> {
  return page.evaluate(() => {
    const s = document.querySelector('.sheet') as HTMLElement | null
    return s ? s.scrollWidth - s.clientWidth : -1
  })
}

test('board ＋ chore form does not scroll sideways', async ({ page }) => {
  await boot(page)
  await page.goto('/board')
  await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })

  await page.locator('.add-fab').click()
  await expect(page.locator('.sheet.show')).toBeVisible()
  // Board chooser order is capture / event / chore / routine — open the chore form.
  await page.getByRole('button', { name: 'Corvées', exact: true }).click()
  await expect(page.locator('.operator__chore-form')).toBeVisible()

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
