import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « Plus tard » on an « À régler » signal (bmad/11 tier-2 #7, migration 0122).
//
// The friction scan is DERIVED, so an acknowledgement has nowhere to live on the
// thing itself — hence a table keyed on the signal's own key, household-scoped so
// the kitchen tablet stops nagging about what the phone just quieted.
//
// Without it an unresolvable friction re-nagged on every scan: a ride whose driver
// genuinely isn't settled yet, a birthday you've decided not to buy for. The one
// surface built to REDUCE mental load was spending it.
const SIGNALS = {
  signals: [
    { kind: 'ride', key: 'ride:e1', label: 'Soccer de Léa', at: 1, href: '/event/e1' },
    { kind: 'birthday', key: 'bday:p1', label: 'Mamie', at: 2, href: '/maison?section=family' },
  ],
}

test('« Plus tard » quiets one friction, behind an undo', async ({ page }) => {
  await mockApi(page, { overrides: { 'a-regler': SIGNALS } })
  const posts: Record<string, unknown>[] = []
  await page.route('**/api/a-regler', async (route) => {
    if (route.request().method() === 'POST') {
      posts.push(route.request().postDataJSON())
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    }
    return route.fallback()
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/settings?tab=board&sub=thisweek')

  const rows = page.locator('.tweek__regler .a-regler__row')
  await expect(rows).toHaveCount(2)

  // The control is a SIBLING of the row's link, not nested inside it — a button in
  // a link is a nested interactive no screen reader or keyboard handles sanely.
  const first = rows.first()
  await expect(first.locator('.a-regler__row-link .a-regler__snooze')).toHaveCount(0)
  await first.locator('.a-regler__snooze').click()

  // Hidden at once (useDeferredRemoval), and the write is HELD behind the toast —
  // the scan is live-polled, so writing first would let a poll flash the row back.
  await expect(rows).toHaveCount(1)
  await expect(page.locator('.undo-toast')).toBeVisible()
  expect(posts).toHaveLength(0)

  // Undo puts it back and nothing was ever written.
  await page.locator('.undo-toast__btn').first().click()
  await expect(rows).toHaveCount(2)
  expect(posts).toHaveLength(0)
})

test('letting the undo lapse writes the snooze, keyed on the signal', async ({ page }) => {
  await mockApi(page, { overrides: { 'a-regler': SIGNALS } })
  const posts: Record<string, unknown>[] = []
  await page.route('**/api/a-regler', async (route) => {
    if (route.request().method() === 'POST') {
      posts.push(route.request().postDataJSON())
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    }
    return route.fallback()
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/settings?tab=board&sub=thisweek')

  await page.locator('.tweek__regler .a-regler__row').first().locator('.a-regler__snooze').click()
  // DEFAULT_UNDO_MS is 15 s; wait past it for the held write to fire.
  await expect.poll(() => posts.length, { timeout: 25_000 }).toBe(1)
  // Keyed on the signal's own stable key, so the snooze follows the friction rather
  // than its position in the list.
  expect(posts[0]).toMatchObject({ key: 'ride:e1' })
})
