import { test, expect } from './fixtures'
import { settled } from './measure'

// An open ＋ bottom-sheet must freeze the page BEHIND it. The document never
// scrolls in this app — the real scrollers are #root and .hub__body — so the
// scroll lock (useModal) freezes THOSE, not body. Without it a swipe on a tall
// sheet (the kitchen "Planifier un repas" chooser overflows a short viewport)
// leaked to the page behind and the sheet's lower content was unreachable.

test('open ＋ sheet freezes the page behind; closing releases it', async ({ page, app }) => {
  await app.boot({ viewport: { width: 412, height: 520 } }) // A short viewport (landscape-ish phone) so the kitchen ＋ sheet overflows.
  await page.goto('/kitchen')
  await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })

  // Background scrolls freely while no overlay is open.
  const lockedBefore = await page.evaluate(() => document.documentElement.classList.contains('scroll-locked'))
  expect(lockedBefore).toBe(false)

  await page.locator('.add-fab').click()
  await expect(page.locator('.sheet.show')).toBeVisible()
  await settled(page)

  const open = await page.evaluate(() => {
    const sheet = document.querySelector('.sheet.show') as HTMLElement
    const hub = document.querySelector('.hub__body') as HTMLElement
    const root = document.getElementById('root') as HTMLElement
    return {
      locked: document.documentElement.classList.contains('scroll-locked'),
      hubOverflowY: getComputedStyle(hub).overflowY,
      rootOverflowY: getComputedStyle(root).overflowY,
      // The sheet itself is the one scroller now — and it really does overflow on
      // a short viewport, so its lower content is reachable by scrolling IT.
      sheetScrolls: sheet.scrollHeight > sheet.clientHeight + 1,
      sheetOverflowY: getComputedStyle(sheet).overflowY,
    }
  })
  expect(open.locked).toBe(true)
  expect(open.hubOverflowY).toBe('hidden')
  expect(open.rootOverflowY).toBe('hidden')
  expect(open.sheetScrolls).toBe(true)
  expect(open.sheetOverflowY).toBe('auto')

  // Closing the sheet must release the lock (the page must not stay frozen). Scope to
  // the shown sheet — the detail-peek sheet shell also carries a .sheet__close.
  await page.locator('.sheet.show .sheet__close').click()
  await expect(page.locator('.sheet.show')).toBeHidden()
  const lockedAfter = await page.evaluate(() => document.documentElement.classList.contains('scroll-locked'))
  expect(lockedAfter).toBe(false)
})
