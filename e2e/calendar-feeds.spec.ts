import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « Les calendriers » — read-only ICS subscriptions (migration 0129).
//
// The parser itself is unit-tested to death (functions/_lib/ics.test.ts) because that
// is where being subtly wrong is invisible. What only a browser can check is the two
// things the FEATURE promises: that a subscription says honestly whether it is
// working, and that what it brings in reads as somebody else's calendar rather than
// as a household rendez-vous you could edit.

const FEEDS = (rows: unknown[]) => ({ feeds: rows })

async function routeFeeds(page: Page, opts: { list?: unknown[]; post?: unknown; onPost?: (b: unknown) => void }) {
  await page.route('**/api/calendar-feeds**', async (route) => {
    const req = route.request()
    if (req.method() === 'POST') {
      opts.onPost?.(req.postDataJSON())
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(opts.post ?? { id: 'f1', changed: true, error: null, count: 14, partial: 0 }),
      })
    }
    if (req.method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FEEDS(opts.list ?? [])) })
  })
}

const goToCard = async (page: Page) => {
  await seedState(page, { theme: 'day', lang: 'fr', surface: 'mobile' })
  await page.goto('/settings?tab=maison&focus=feeds&lens=regler')
  await expect(page.locator('#op-feeds')).toBeVisible()
}

test('adding a calendar reports what the first fetch actually found', async ({ page }) => {
  // The point: a subscription that silently adds nothing is indistinguishable from a
  // typo, and the household is the only one who can tell. So the verdict arrives with
  // the tap rather than tomorrow night.
  await mockApi(page)
  let posted: unknown = null
  await routeFeeds(page, { onPost: (b) => (posted = b) })
  await goToCard(page)

  const card = page.locator('#op-feeds')
  await card.locator('input').first().fill('École de Léa')
  await card.locator('input').nth(1).fill('https://ecole.example/cal.ics')
  await card.getByRole('button', { name: 'Ajouter' }).click()

  await expect.poll(() => posted).not.toBeNull()
  expect(posted).toMatchObject({ label: 'École de Léa', url: 'https://ecole.example/cal.ics' })
  await expect(card.locator('.status-msg')).toContainText('14')
})

test('a feed that is not a calendar says so instead of looking empty', async ({ page }) => {
  // The common real-world failure is not a 404 — it is a 200 carrying a sign-in page.
  // Reporting it by name is what keeps a household from concluding the feature is
  // broken when the URL is.
  await mockApi(page)
  await routeFeeds(page, { post: { id: 'f1', changed: false, error: 'not-ics', count: 0, partial: 0 } })
  await goToCard(page)

  const card = page.locator('#op-feeds')
  await card.locator('input').first().fill('École')
  await card.locator('input').nth(1).fill('https://ecole.example/login')
  await card.getByRole('button', { name: 'Ajouter' }).click()

  await expect(card.locator('.status-msg')).toContainText('calendrier')
})

test('a subscribed calendar states its health, and its partial rules, on its row', async ({ page }) => {
  await mockApi(page)
  await routeFeeds(page, {
    list: [
      { id: 'f1', url: 'https://a/x.ics', label: 'École de Léa', colour: null, memberId: null, enabled: true, lastFetchAt: 1_760_000_000, lastError: null, partialCount: 2, eventCount: 31 },
      { id: 'f2', url: 'https://b/y.ics', label: 'Hockey', colour: null, memberId: null, enabled: false, lastFetchAt: 1_760_000_000, lastError: 'http', partialCount: 0, eventCount: 0 },
    ],
  })
  await goToCard(page)

  const card = page.locator('#op-feeds')
  // A healthy feed says how much it holds…
  await expect(card).toContainText('31')
  // …and names what it could NOT expand, rather than looking complete.
  await expect(card).toContainText('récurrents')
  // A broken one names the failure. Silence here is the bug.
  await expect(card).toContainText('vérifie-la')
})

test('a feed appointment shows on the calendar, marked apart from the household’s', async ({ page }) => {
  const day0 = await page.evaluate(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return Math.floor(d.getTime() / 1000)
  })
  await mockApi(page, {
    overrides: {
      month: {
        events: [{ id: 'e1', title: 'Rendez-vous dentiste', at: day0 + 9 * 3600, all_day: 0, member_id: 'm3', day: day0 }],
        meals: [],
        chores: [],
        dayNotes: [],
        todos: [],
        homeProjects: [],
        trips: [],
        tripPlans: [],
        habits: [],
        transfers: [],
        feedEvents: [
          { id: 'fe1', title: 'Journée pédagogique', location: null, at: day0, end_at: day0 + 86_400, all_day: 1, day: day0, feedId: 'f1', feedLabel: 'École de Léa', colour: '#5891AC', member_id: null },
        ],
      },
    },
  })
  await seedState(page, { theme: 'day', lang: 'fr', surface: 'mobile', boardView: 'semaine' })
  await page.goto('/board')

  const today = page.locator('.weekv__day').first()
  // Both are on the day…
  await expect(today).toContainText('Rendez-vous dentiste')
  await expect(today).toContainText('Journée pédagogique')
  // …and they do NOT wear the same marker. The feed row is information arriving from
  // outside: nothing can edit it and the next refresh replaces it, so reading as a
  // household rendez-vous would be a promise the app cannot keep.
  const lines = today.locator('.weekv__line')
  await expect(lines).toHaveCount(2)
  const glyphs = await lines.locator('.monthv__dot, .monthv__dot-icon').evaluateAll((els) =>
    els.map((e) => e.className),
  )
  expect(new Set(glyphs).size).toBeGreaterThan(1)
})
