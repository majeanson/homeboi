import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

test.use({ hasTouch: true })

test('cercle drawing zoom overlay portals to body and closes', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 })
  await mockApi(page)
  const member = { id: 'm1', displayName: 'Marc', avatarKind: 'initial', avatarRef: '', colour: '#5891AC', isChild: false, email: null, phone: null, birthday: null, notes: null, gender: 'm' }
  await page.route('**/api/cercle**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [], members: [member], links: [], groups: [] }) })
  })
  await page.route('**/api/family-notes**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      notes: [{ id: 'fn1', member_id: null, author_member_id: 'm1', title: '', text: '', media_kind: 'drawing', media_key: 'nm_fn1', scene_key: null, created_at: 1, updated_at: null }],
    }) })
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })

  await page.goto('/cercle?section=notes')
  await expect(page.locator('.cercle-notes .cnote__thumb').first()).toBeVisible({ timeout: 15_000 })

  // Open the zoom viewer by tapping the drawing thumbnail.
  await page.locator('.cercle-notes .cnote__thumb').first().tap()
  await expect(page.locator('.zoom-overlay')).toBeVisible()

  // PORTAL: the overlay is a direct child of <body>, NOT trapped inside the note row.
  expect(await page.locator('body > .zoom-overlay').count()).toBe(1)
  expect(await page.locator('.cnote .zoom-overlay').count()).toBe(0)

  // The overlay covers the full viewport (proof it escaped the small card box).
  const box = (await page.locator('.zoom-overlay').boundingBox())!
  expect(box.width).toBeGreaterThan(700)
  expect(box.height).toBeGreaterThan(1100)

  // Close via ✕ and stays closed.
  await page.locator('.zoom-overlay__close').tap()
  await page.waitForTimeout(400)
  await expect(page.locator('.zoom-overlay')).toHaveCount(0)

  // Reopen, close via backdrop, stays closed.
  await page.locator('.cercle-notes .cnote__thumb').first().tap()
  await expect(page.locator('.zoom-overlay')).toBeVisible()
  await page.locator('.zoom-overlay').tap({ position: { x: 20, y: 30 } })
  await page.waitForTimeout(400)
  await expect(page.locator('.zoom-overlay')).toHaveCount(0)
})
