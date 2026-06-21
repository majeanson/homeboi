import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Verifies the DrawPad zoom/pan + pen-takeover (#14) in the running app. Multi-touch
// pinch can't be driven headlessly, but the wheel zoom exercises the same viewport,
// and a simulated pen drag exercises the takeover that replaced signature_pad's own
// input — including drawing WHILE zoomed and the export-flatten-to-1× fix.

async function openPad(page: Page) {
  await page.goto('/drawings')
  await expect(page.getByRole('heading', { name: 'Mes dessins' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Dessiner' }).click()
  const canvas = page.locator('.drawpad__canvas')
  await expect(canvas).toBeVisible()
  return canvas
}

// Drag the pen across the canvas (default mode) — content is detected via the
// committed PointGroup, so the gallery save isn't treated as empty.
async function drawStroke(page: Page, box: { x: number; y: number; width: number; height: number }) {
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 10 })
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.35, { steps: 10 })
  await page.mouse.up()
}

test('the wheel zooms the canvas; the zoom badge taps back to fit', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  const canvas = await openPad(page)
  const box = (await canvas.boundingBox())!

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -600) // zoom in

  // The badge only renders once zoomed past 100%, so its presence proves the zoom.
  const badge = page.locator('.drawpad__zoom')
  await expect(badge).toBeVisible()
  await expect(badge).toContainText('%')

  await badge.click() // snap back to fit
  await expect(badge).toHaveCount(0)
})

test('a freehand stroke is detected and saved (pen takeover at 1×)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  const canvas = await openPad(page)
  const box = (await canvas.boundingBox())!

  await drawStroke(page, box)

  // Save (Épingler) → the gallery POSTs the drawing. If the takeover left the pad
  // "empty", save() would cancel without a request.
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/api/drawings') && r.method() === 'POST', { timeout: 10_000 }),
    page.getByRole('button', { name: 'Épingler', exact: true }).click(),
  ])
  expect(req).toBeTruthy()
})

test('a stroke drawn WHILE zoomed in still saves', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  const canvas = await openPad(page)
  const box = (await canvas.boundingBox())!

  // Zoom in first…
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -600)
  await expect(page.locator('.drawpad__zoom')).toBeVisible()

  // …then draw at the zoom (coords map screen→content), and save (flattens to 1×).
  await drawStroke(page, box)
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/api/drawings') && r.method() === 'POST', { timeout: 10_000 }),
    page.getByRole('button', { name: 'Épingler', exact: true }).click(),
  ])
  expect(req).toBeTruthy()
})
