import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Plan seam #8: filling a week cost seven full-screen day scenes. An EMPTY day cell
// in the week grid is now the field itself — tap it, type, done. The day scene still
// owns the rest (sides, note, recipe, who cooks), and the pencil still opens it.
test('an empty day cell plans the supper in place', async ({ page }) => {
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

  // An empty day announces itself as plannable…
  const emptyCell = page.locator('.kitchen__day-sum-empty').first()
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
