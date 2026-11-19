import { test, expect } from './fixtures'
import { MMID } from './mocks'

// Review #24 (2026-11-17), the calm pass on counts and nags:
//   · « À régler +2 » was a mystery number, and its tap went into Réglages;
//   · « Compléter les familles 6 » wore a count badge;
//   · « Compter les dodos jusqu'à Noël ? » was asked every morning, from July;
//   · drawings wore « il y a 65 j » (journey-drawings.spec.ts holds that one).

test.use({ timezoneId: 'America/Toronto' })

test('« À régler » names each friction with its own fix: no « +N », no detour into Réglages', async ({ app, page }) => {
  const signals = [
    { kind: 'meal-empty', key: 'meal-empty:tomorrow', label: 'souper', sub: 'tomorrow', at: MMID + 86_400, href: '/kitchen?item=a' },
    { kind: 'birthday', key: 'birthday:b1', label: 'Mamie', at: MMID + 3 * 86_400, href: '/maison?item=b' },
  ]
  await app.boot({ route: '/board', wait: '.board-band', clock: 'BASE', api: { overrides: { 'a-regler': { signals } } } })
  const card = page.locator('.now-card--regler')
  await expect(card).toBeVisible()
  await expect(card).not.toContainText(/\+\d/)
  const links = card.locator('.now-card__frictions a')
  await expect(links).toHaveCount(2)
  expect(await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual(['/kitchen?item=a', '/maison?item=b'])
})

test('the décompte is offered only for a day within three weeks', async ({ app, page }) => {
  // Early August: nothing major for over three weeks → no question on the board.
  await app.boot({ route: '/board', wait: '.board-band', clock: Date.UTC(2025, 7, 1, 16) / 1000 })
  await expect(page.locator('.countdown-card__ask')).toHaveCount(0)
})
