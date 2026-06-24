import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, type Theme } from './mocks'

// « La journée » — the unified prototype board view. Smoke + overflow guard for both
// scopes (Aujourd'hui / Maintenant), day + night, phone + wall, so a regression in
// the shared DaySection / face lens / À régler surfaces here. Writes review PNGs.
const FORMATS = [
  { name: 'phone', width: 390, height: 844, surface: 'mobile' as const },
  { name: 'wall', width: 1280, height: 800, surface: 'kiosk' as const },
]

async function bootJour(page: Page, theme: Theme, surface: 'mobile' | 'kiosk') {
  await mockApi(page)
  await seedState(page, { theme, audience: 'parent', lang: 'fr', calm: true, surface, boardView: 'jour' })
  await page.goto('/board')
  await page.locator('.lajournee').waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(400)
}

const noHOverflow = (page: Page) =>
  page.evaluate(() => {
    const b = document.querySelector('.hub__body')
    return b && b.scrollWidth > b.clientWidth + 1 ? 'overflow' : 'ok'
  })

for (const theme of ['day', 'night'] as Theme[]) {
  for (const f of FORMATS) {
    test(`la-journee-${theme}-${f.name}`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.setViewportSize({ width: f.width, height: f.height })
      await bootJour(page, theme, f.surface)
      // Aujourd'hui (default) renders the day agenda via DaySection (Act rows).
      await expect(page.locator('.lajournee .act').first()).toBeVisible()
      await page.screenshot({ path: `e2e/screenshots/la-journee-aujourdhui-${theme}-${f.name}.png`, fullPage: true })
      // Maintenant: the now/next focus + « À régler ».
      await page.locator('.subtabs__opt', { hasText: 'Maintenant' }).click()
      await page.waitForTimeout(300)
      await page.screenshot({ path: `e2e/screenshots/la-journee-maintenant-${theme}-${f.name}.png`, fullPage: true })
      expect(errors).toEqual([])
      expect(await noHOverflow(page)).toBe('ok')
    })
  }
}
