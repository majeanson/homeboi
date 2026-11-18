import { test, expect } from './fixtures'
import { BASE, BOARD } from './mocks'
import { boxOf } from './measure'

// Review #13 (2026-11-17), seen by two personas on a phone: beside a drawing on the
// board, its age stood one word per line, « il / y / a / 65 / j ». The card is a flex
// row and the stamp got a sliver of it; on a media card it now takes its own line.
// Review #24 then took the stamp off drawings and photos altogether: a keepsake does not
// « traîne depuis 65 jours ». A voice memo is still a media card with an age, so it
// carries the layout guard.

const DAY = 86_400

const note = (id: string, media_kind: string, media_key: string) => ({
  ...BOARD.notes[0]!,
  id,
  text: '',
  media_kind,
  media_key,
  created_at: BASE - 65 * DAY,
})

test('a drawing carries no age; a voice memo’s age reads on one line', async ({ app, page }) => {
  await app.boot({
    route: '/board',
    wait: '.hub',
    clock: 'BASE',
    viewport: { width: 390, height: 844 },
    api: { overrides: { board: { ...BOARD, notes: [note('nd1', 'drawing', 'nm_e2e'), note('na1', 'audio', 'nm_audio'), ...BOARD.notes] } } },
  })
  await expect(page.locator('[data-item="nd1"]')).toBeVisible()
  await expect(page.locator('[data-item="nd1"] .note-card__age')).toHaveCount(0)

  const age = page.locator('[data-item="na1"] .note-card__age')
  await expect(age).toContainText('il y a 65 j')
  expect((await boxOf(age)).height).toBeLessThan(20)
})
