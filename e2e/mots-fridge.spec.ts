import { test, expect, type Page, type Request } from '@playwright/test'
import { mockApi, seedState, BASE, BOARD, notesFromMots } from './mocks'

// « Mots » — ONE card since 2026-09-29 (migration 0142): the fridge notes and the member-
// to-member « Laisse un mot » merged. What the old mots card did must still happen on the
// fridge, so each behaviour Marc chose to keep is pinned here:
//   · an addressed mot shows ONLY on its face (and to nobody at rest);
//   · tapping one that waits OPENS it — it is not taken down;
//   · « Garder » puts any paper on the Souvenirs shelf;
//   · the author sees what they left, under the papers (« Ce que j'ai laissé »).
// Fixture faces: m1 Maman, m2 Papa, m3 Léa.

const FOR_LEA = { id: 'n9', text: 'Bravo pour ta lecture !', member_id: 'm2', for_member_id: 'm3', created_at: BASE, opened_at: null, saved_at: null }

const isNotes = (method: string) => (r: Request) => r.method() === method && new URL(r.url()).pathname === '/api/notes'

async function boot(page: Page, face: string | null) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript((f) => {
    try {
      localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
      if (f) localStorage.setItem('babillard-profile', f)
    } catch {
      /* noop */
    }
  }, face)
  await mockApi(page)
  // The board carries the addressed paper beside the fixture's two family-wide ones…
  await page.route('**/api/board**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...BOARD, notes: [...BOARD.notes, FOR_LEA] }) })
      : route.fallback(),
  )
  // …and /api/notes (the raw mots read: face dot, outbox) carries it too, as a mot from Papa.
  await page.route('**/api/notes**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(notesFromMots([{ ...FOR_LEA, member_id: 'm3', author_member_id: 'm2' }])),
        })
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.clock.setFixedTime(BASE * 1000)
  await page.goto('/board')
  await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })
}

test('an addressed mot shows only on its own face — at rest nobody sees it', async ({ page }) => {
  await boot(page, null)
  await expect(page.locator('.note-card').first()).toBeVisible()
  await expect(page.getByText('Bravo pour ta lecture !')).toHaveCount(0)
})

test('on its face it waits, says « Pour toi », and a tap OPENS it instead of taking it down', async ({ page }) => {
  await boot(page, 'm3')
  const paper = page.locator('.note-card--waiting', { hasText: 'Bravo pour ta lecture !' })
  await expect(paper).toBeVisible()
  await expect(paper).toContainText('Pour toi')

  let deleted = false
  page.on('request', (r) => {
    if (isNotes('DELETE')(r)) deleted = true
  })
  const [req] = await Promise.all([page.waitForRequest(isNotes('PATCH')), paper.locator('.note-card__tap').click()])
  expect(JSON.parse(req.postData() || '{}')).toMatchObject({ id: 'n9', opened: true })
  expect(deleted, 'opening a mot must never take it down').toBe(false)
})

test('« Garder » puts a paper on the Souvenirs shelf', async ({ page }) => {
  await boot(page, null)
  // Scoped to the fridge: the day note also wears .note-card, and has no badge.
  const badge = page.locator('.notes .note-card__shelf-badge').first()
  await expect(badge).toHaveAttribute('aria-label', 'Garder')
  const [req] = await Promise.all([page.waitForRequest(isNotes('PATCH')), badge.click()])
  expect(JSON.parse(req.postData() || '{}')).toMatchObject({ saved: true })
})

test('the author sees what they left, and whether it was seen, under the papers', async ({ page }) => {
  await boot(page, 'm2')
  const fold = page.locator('.disclosure', { hasText: 'Ce que j’ai laissé' })
  await expect(fold).toBeVisible()
  await fold.getByRole('button', { name: /Ce que j’ai laissé/ }).click()
  await expect(fold).toContainText('Bravo pour ta lecture !')
  await expect(fold).toContainText('Léa')
})
