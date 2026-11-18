import { test, expect } from './fixtures'
import { boxOf } from './measure'

// Review #20 (2026-11-17), Thérèse on the board with « ? » armed:
//   · tapping the meal row opened its real sheet (« Retirer du plan »), no explanation;
//   · the « Ce soir » bubble popped up at the foot of the screen, over another card;
//   · help seemed to switch itself off after one tap (the hint bar vanished);
//   · « Voir le guide » walked off to Réglages.
// Now: every tap in a card explains that card, beside the finger; the bar stays; the
// guide card opens over the board.

test('armed, a tap in a card explains it beside the finger, and help stays on', async ({ app, page }) => {
  await app.boot({ route: '/board', wait: '.board-band', clock: 'BASE', viewport: { width: 390, height: 844 } })
  await page.locator('.help-toggle').first().click()
  await expect(page.locator('.help-hint')).toBeVisible()

  // A control INSIDE « Aujourd'hui » that is not a help target of its own.
  const row = page.locator('.wg-slot[data-card="today"] button:not(.help-title)').first()
  await expect(row).toBeVisible()
  const r = await boxOf(row)
  await row.click()
  await expect(page.locator('.sheet.show.detail-sheet')).toHaveCount(0)
  const bubble = page.locator('.help-bubble--float')
  await expect(bubble).toBeVisible()
  // Beside the tap: its top within a bubble's height of the finger.
  const b = await boxOf(bubble)
  expect(Math.abs(b.y - (r.y + r.height / 2))).toBeLessThan(b.height + 40)
  // Still armed.
  await expect(page.locator('.help-hint')).toBeVisible()

  // « Voir le guide » opens the card over the board, not Réglages.
  await bubble.locator('.help-bubble__guide').click()
  await expect(page.locator('.guide-sheet')).toBeVisible()
  await expect(page).toHaveURL(/\/board/)
})
