import { test, expect } from './fixtures'
import { BOARD } from './mocks'

// The toddler lens on « La liste » (solidify 4.4: the one toddler tab without a spec). The
// promise is in Liste.tsx: a pre-reader sees what is still needed, as pictures, and a tap
// reads it aloud WITHOUT ticking it. A write from this lens would change a real shopping
// trip behind a parent's back.
const list = [
  { id: 'a', text: 'Lait', checked_at: null },
  { id: 'b', text: 'Pommes', checked_at: null },
  { id: 'c', text: 'Pain', checked_at: 1_700_000_000 },
]

test('only what is still needed shows, as tiles', async ({ page, app }) => {
  await app.boot({ route: '/liste', state: { audience: 'toddler' }, api: { overrides: { board: { ...BOARD, list } } }, wait: '.bigtiles' })
  await expect(page.locator('.bigtile')).toHaveCount(2)
  await expect(page.locator('.bigtiles')).not.toContainText('Pain')
})

test('a tap never writes', async ({ page, app }) => {
  const writes: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/api/') && r.method() !== 'GET') writes.push(`${r.method()} ${r.url()}`)
  })
  await app.boot({ route: '/liste', state: { audience: 'toddler' }, api: { overrides: { board: { ...BOARD, list } } }, wait: '.bigtiles' })
  await page.locator('.bigtile').first().click()
  // Proving no write was sent: nothing marks an absence, so give it the time it would have taken.
  await page.waitForTimeout(300)
  await expect(page.locator('.bigtile')).toHaveCount(2)
  expect(writes).toEqual([])
})

test('an empty list says so, in the same big frame', async ({ page, app }) => {
  await app.boot({ route: '/liste', state: { audience: 'toddler' }, api: { overrides: { board: { ...BOARD, list: [] } } }, wait: '.bigtiles__empty' })
  await expect(page.locator('.bigtile')).toHaveCount(0)
})
