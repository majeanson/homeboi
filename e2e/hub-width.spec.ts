import { test, expect } from './fixtures'

// One scrollbar gutter, not two (solidify 5.3): #root reserved 15px for a scroll that never
// happens inside a hub, beside the real one on .hub__body. Invisible on a phone, where a
// scrollbar has no width, and a dead strip down every tab on a desktop browser.
test('a hub fills the width: only its body reserves a scrollbar', async ({ page, app }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await app.boot({ route: '/kitchen', wait: '.hub' })
  const hub = await page.locator('.hub').evaluate((e) => e.getBoundingClientRect().width)
  expect(hub).toBe(1280)
})
