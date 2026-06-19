import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// The drawing collection / gallery (#14). Smoke coverage so CI exercises the new
// surface: the kept drawings render, the ＋ opens the full draw pad, and the
// toddler lens shows the same wall (bigger tiles, no delete).

test('gallery renders the kept drawings and opens the draw pad', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })

  await page.goto('/drawings')
  await expect(page.getByRole('heading', { name: 'Mes dessins' })).toBeVisible({ timeout: 15_000 })
  // Two kept drawings from the fixture.
  await expect(page.locator('.drawgallery__item')).toHaveCount(2)

  // ＋ Dessiner opens the full pad (full-screen overlay with the tool bar).
  await page.getByRole('button', { name: 'Dessiner' }).click()
  await expect(page.locator('.drawpad')).toBeVisible()
  await expect(page.locator('.drawpad__canvas')).toBeVisible()
})

test('toddler gallery shows the wall without delete controls', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', surface: 'kiosk' })

  await page.goto('/drawings')
  await expect(page.locator('.drawgallery__grid--kid')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.drawgallery__item')).toHaveCount(2)
  // Toddler lens never exposes destructive delete.
  await expect(page.locator('.drawgallery__del')).toHaveCount(0)
})
