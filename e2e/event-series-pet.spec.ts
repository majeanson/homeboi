import { test, expect } from './fixtures'
import { BASE, BOARD, CERCLE } from './mocks'

// Review #31 (2026-11-17), from a parent of two:
//   « The dog can't be the subject of a rendez-vous. » — the vet, the groomer, the vaccines.
//   « Repeat rules have no end date or exceptions. » — hockey ends in March, swimming runs
//   ten weeks, and I can't skip the week the kid is at the other house.

const AT = BASE + 4 * 3600
const SERIES = { id: 's1', title: 'Vétérinaire', start_at: AT, all_day: 0, member_id: null, contact_id: null, business_id: null,
  recur_json: JSON.stringify({ freq: 'weekly', interval: 1 }), lead_seconds: null, car_id: null, passengers: JSON.stringify(['pet1']), bring_template_id: null }
const occurrence = {
  ...BOARD.today[0]!, id: `s1#${AT}`, title: 'Vétérinaire', start_at: AT, member_id: null, passengers: JSON.stringify(['pet1']),
}
const PET = { id: 'pet1', name: 'Rex', species: null, breed: null, photoKey: null, colour: '#F2A03D', icon: null, birthday: null,
  microchip: null, feeding: null, sitterNotes: null, vetBusinessId: null, weights: [], notes: null }

test.beforeEach(async ({ app, page }) => {
  await page.routeWebSocket(/\/api\/live/, () => {})
  await app.boot({
    clock: 'BASE',
    api: { overrides: { board: { ...BOARD, today: [...BOARD.today, occurrence] }, cercle: { ...CERCLE, pets: [PET] }} },
  })
  // The edit form reads its row by id (`events?id=s1`); writes answer ok.
  await page.route('**/api/events**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.request().method() === 'GET' ? { events: [SERIES] } : { ok: true }) }),
  )
  await page.goto('/board')
})

test('a rendez-vous FOR the dog says so on the board, and the form offers the dog in « Pour qui ? »', async ({ page }) => {
  const row = page.locator('.act', { hasText: 'Vétérinaire' }).first()
  await expect(row).toContainText('Rex')
  await row.click()
  await page.locator('.detail-sheet__actions').getByText('Modifier', { exact: true }).click()
  const pick = page.getByRole('group', { name: 'Pour qui ?' })
  await expect(pick.getByRole('button', { name: 'Rex' })).toHaveAttribute('aria-pressed', 'true')
  // « Jusqu'au »: the series' last day, offered once it repeats.
  await expect(page.getByLabel('Jusqu’au')).toBeVisible()
})

test('« Pas cette fois » skips this one occurrence: PATCH { skipDay } for its local day', async ({ page }) => {
  await page.locator('.act', { hasText: 'Vétérinaire' }).first().click()
  await page.locator('.detail-sheet .action-menu__btn').click()
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'PATCH' && new URL(r.url()).pathname === '/api/events'),
    (async () => {
      await page.getByRole('menuitem', { name: 'Pas cette fois' }).click()
      await page.locator('.confirm__actions').getByRole('button', { name: 'Pas cette fois' }).click()
    })(),
  ])
  const body = req.postDataJSON() as { id: string; skipDay: number }
  expect(body.id).toBe('s1')
  expect(body.skipDay).toBeLessThanOrEqual(AT)
  expect(AT - body.skipDay).toBeLessThan(86400)
})
