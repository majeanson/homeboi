import { test, expect } from './fixtures'
import { BASE, BOARD } from './mocks'
import { boxOf } from './measure'

// Review #13 (2026-11-17), seen by two personas on a phone: beside a drawing on the
// board, its age stood one word per line, « il / y / a / 65 / j ». The card is a flex
// row and the stamp got a sliver of it; it now takes its own line, never broken.

const DAY = 86_400

test('a drawing’s age reads on one line, under the drawing', async ({ app, page }) => {
  const drawing = {
    ...BOARD.notes[0]!,
    id: 'nd1',
    text: '',
    media_kind: 'drawing',
    media_key: 'nm_e2e',
    created_at: BASE - 65 * DAY,
  }
  await app.boot({
    route: '/board',
    wait: '.hub',
    clock: 'BASE',
    viewport: { width: 390, height: 844 },
    api: { overrides: { board: { ...BOARD, notes: [drawing, ...BOARD.notes] } } },
  })
  const age = page.locator('[data-item="nd1"] .note-card__age')
  await expect(age).toContainText('il y a 65 j')
  const line = await boxOf(page.locator('[data-item="nd1"] .note-card__draw'))
  const box = await boxOf(age)
  // One line of 0.7rem text, and below the picture rather than squeezed beside it.
  expect(box.height).toBeLessThan(20)
  expect(box.y).toBeGreaterThanOrEqual(line.y + line.height - 1)
})
