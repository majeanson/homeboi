import { test, expect } from './fixtures'

// Review #17 (2026-11-17; Sam's WCAG 2.4.11 « Focus Not Obscured » and two parents' « the
// ＋ sits on what I want to tap »): on a phone, tabbing down the board put a dozen
// focused controls under the fixed tab bar or the floating ＋ (« Planifier aujourd'hui »,
// « Avant de partir », « Toutes les notes »…). The body reserved the band as PADDING,
// which only lengthens the scroll; `scroll-padding-bottom` is what makes the browser stop
// a focused control above it.

test('tabbing down the phone board never leaves the focused control under the bar or the ＋', async ({ app, page }) => {
  await app.boot({ route: '/board', wait: '.board-band', clock: 'BASE', viewport: { width: 375, height: 812 } })
  await expect(page.locator('.add-fab')).toBeVisible()
  const hidden: string[] = []
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab')
    const hit = await page.evaluate(async () => {
      // Two frames: a card that loads late (« Mes habitudes ») can shift the layout between
      // the focus scroll and the measure — one CI run read « Marcher dehors » mid-shift.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body || !el.closest('.hub__body')) return null
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return null
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      const chrome = top?.closest('.add-fab, .hubnav')
      return chrome ? `${el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30)} under ${chrome.className.split(' ')[0]}` : null
    })
    if (hit) hidden.push(hit)
  }
  expect(hidden).toEqual([])
})
