import { test, expect, type Page, type Locator, type Request } from '@playwright/test'
import { mockApi, seedState, BASE } from './mocks'

// ─────────────────────────────── The tap budget ───────────────────────────────
// C-18 (bmad/08-the-grandma-test.md): pin the number of TAPS each daily action
// takes starting from the board, so a redesign can't silently make daily life
// slower. Every budget below is the MEASURED minimal count of today's real UI —
// reality, not an aspiration. If a flow legitimately gets FASTER, lower the
// budget; if a change pushes a flow OVER budget, that's the regression this spec
// exists to catch — rethink the change before raising the number.
//
// Rules (kept honest by the tapCounter helper — taps only ever go through it):
//   • Every pointer interaction (a click/tap on anything) counts as 1 tap.
//   • Typing text, filling a native date/time input, and pressing Enter are FREE
//     — a keyboard isn't a tap, and budgets measure navigation friction, not
//     how long a title is.
//   • Each test boots freshly on /board (the kiosk's resting screen) — budgets
//     measure "from the wall", not "from wherever you already were".
//
// Kid mode is deliberately NOT budgeted: the toddler lens is a one-way door
// that's slow to leave BY DESIGN (see babillard-kid-view-one-way-door), and its
// picture-card pace is a feature, not friction to minimize.
//
// The mock API is static for writes (POSTs succeed, data doesn't change), so
// flows assert the INTERACTION completed — the request fired, the input
// cleared, the scene opened — not persisted data.

// Count taps honestly: every pointer interaction in a flow MUST go through
// tap(); the final assertion compares the tally to the pinned budget.
function tapCounter() {
  let taps = 0
  return {
    tap: async (loc: Locator) => {
      taps++
      await loc.click()
    },
    count: () => taps,
  }
}

function assertBudget(flow: string, taps: number, budget: number) {
  expect(
    taps,
    `"${flow}" took ${taps} tap(s) — over its pinned budget of ${budget}. ` +
      'A redesign made this daily action slower (C-18, bmad/08). Rework the flow or consciously re-pin the budget.',
  ).toBeLessThanOrEqual(budget)
}

const isApi = (method: string, path: string) => (r: Request) =>
  r.method() === method && new URL(r.url()).pathname === `/api/${path}`

// Fresh boot on /board — same harness as nav-tabs.spec.ts. reducedMotion keeps
// infinitely-animated elements (toddler float, entrance fades) stable for clicks.
async function boot(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
    } catch {
      /* noop */
    }
  })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/board')
  await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })
}

// ------------------------------------------------------------------ glance: 0

test('glance: supper tonight — 0 taps (the board just says it)', async ({ page }) => {
  await boot(page)
  // « Ce soir » is a band card, always on the resting board — the whole point
  // of the wall tablet is that supper costs zero interactions to know.
  const heroes = page.locator('.board-heroes .now-card .what')
  await expect(heroes.filter({ hasText: 'Spaghetti maison' })).toBeVisible()
  assertBudget('glance: supper tonight', 0, 0)
})

test('auto: see who has the car — 0 taps (the board card says it)', async ({ page }) => {
  await boot(page)
  // The AutoCard mounts from the CAR fixture (status: Papa holds the car until
  // this evening) — "où est l'auto ?" is answered at a glance, no navigation.
  const status = page.locator('.auto-card__status')
  await expect(status).toBeVisible()
  await expect(status).toContainText('Avec Papa')
  assertBudget('auto: see who has the car', 0, 0)
})

// ------------------------------------------------------------------- liste

test('liste: check an item — 2 taps (tab + the row toggle)', async ({ page }) => {
  await boot(page)
  const { tap, count } = tapCounter()
  await tap(page.locator('.hubnav a[href="/liste"]')) // 1 — the hub tab
  const row = page.locator('.today-feed .list-rows .list-row', { hasText: 'Pain' })
  await expect(row).toBeVisible({ timeout: 10_000 })
  await tap(row.locator('.list-row__toggle')) // 2 — check it off (a MARK, in place)
  await expect(page.locator('.list-row__main.done')).toHaveCount(1)
  assertBudget('liste: check an item', count(), 2)
})

test('liste: add an item — 2 taps (tab + field focus; typing + Enter are free)', async ({ page }) => {
  await boot(page)
  const { tap, count } = tapCounter()
  await tap(page.locator('.hubnav a[href="/liste"]')) // 1 — the hub tab
  const input = page.locator('.today-feed form.edit-field .input').first()
  await expect(input).toBeVisible({ timeout: 10_000 })
  await tap(input) // 2 — focus the add bar
  await input.fill('beurre')
  await Promise.all([
    page.waitForRequest(isApi('POST', 'list'), { timeout: 20_000 }),
    input.press('Enter'), // free — Enter submits (EditField convention)
  ])
  // addItem() clears the field synchronously — the interaction completed.
  await expect(input).toHaveValue('')
  assertBudget('liste: add an item', count(), 2)
})

// Measured: the flyer/deals browser's real front door is on LA LISTE (the visible
// « Circulaires » shortcut under the add bar → /liste/circulaires). La cuisine has
// no deals entry point — grocery deals belong to the shopping surface, so the
// honest path is board → liste → Circulaires = 2 taps. (The ＋ sheet's
// « Parcourir les circulaires » tile is the slower 3-tap road; the budget pins
// the fastest one.)
test('liste: browse the flyers/deals — 2 taps (tab + the Circulaires shortcut)', async ({ page }) => {
  await boot(page)
  const { tap, count } = tapCounter()
  await tap(page.locator('.hubnav a[href="/liste"]')) // 1 — the hub tab
  // Scope to the visible shortcut row — the ＋ sheet's (closed) flyer tile shares
  // the same accessible name, so a bare role query is ambiguous.
  const browse = page.locator('.list-actions').getByRole('button', { name: 'Parcourir les circulaires' })
  await expect(browse).toBeVisible({ timeout: 10_000 })
  await tap(browse) // 2 — straight into the deals browser scene
  await expect(page).toHaveURL(/\/liste\/circulaires$/)
  await expect(page.locator('.scene .deals-search')).toBeVisible({ timeout: 10_000 })
  assertBudget('liste: browse the flyers', count(), 2)
})

// ------------------------------------------------------------------- kitchen

test('kitchen: see the week — 1 tap (the hub tab; Repas is the default sub-tab)', async ({ page }) => {
  await boot(page)
  const { tap, count } = tapCounter()
  await tap(page.locator('.hubnav a[href="/kitchen"]')) // 1 — the hub tab
  const week = page.locator('.kitchen__week')
  await expect(week).toBeVisible({ timeout: 15_000 })
  // The week is real content, not an empty shell — day one carries the supper.
  await expect(week).toContainText('Spaghetti maison')
  assertBudget('kitchen: see the week', count(), 1)
})

// ------------------------------------------------------------------- event

test('event: add a rendez-vous — 3 taps (＋ FAB + tile + save; typing is free)', async ({ page }) => {
  await boot(page)
  const { tap, count } = tapCounter()
  await tap(page.locator('.add-fab')) // 1 — the contextual ＋
  await expect(page.locator('.sheet.show')).toBeVisible()
  const tile = page.locator('.cat-pick', { hasText: 'Rendez-vous' })
  await expect(tile).toBeVisible()
  await Promise.all([
    page.waitForURL(/\/event\/new/),
    tap(tile), // 2 — the event tile (navigates to the full-screen scene)
  ])
  const form = page.locator('.scene form.operator__inline-form')
  await form.locator('input.input').first().fill('Rendez-vous coiffeur') // free
  await form.locator('input[type="date"]').fill('2026-07-15') // free (keyboard, not a tap)
  await Promise.all([
    page.waitForRequest(isApi('POST', 'events'), { timeout: 20_000 }),
    tap(form.locator('button[type="submit"]')), // 3 — save
  ])
  assertBudget('event: add a rendez-vous', count(), 3)
})

// ------------------------------------------------------------------- routines

test('routines: open a routine to run — 2 taps (tab + the card’s ▶ Faire)', async ({ page }) => {
  await boot(page)
  const { tap, count } = tapCounter()
  await tap(page.locator('.hubnav a[href="/routines"]')) // 1 — the hub tab
  // .first(): the overview renders one grid per moment-of-day group.
  await expect(page.locator('.routines-grid').first()).toBeVisible({ timeout: 15_000 })
  // Measured: each routine card carries a direct ▶ « Faire » run button — the
  // player is 2 taps away, not via the peek (card → peek → Faire would be 3).
  await tap(page.locator('.routine-card__run').first()) // 2 — straight into the player
  await expect(page).toHaveURL(/\/routine\/[^/]+\/run$/)
  await expect(page.locator('.tdl')).toBeVisible({ timeout: 10_000 })
  assertBudget('routines: open a routine to run', count(), 2)
})

// ------------------------------------------------------------------- voyage

// The default fixture has no trip, so seed one via a route override (registered
// AFTER mockApi → it wins), the voyage.spec pattern. The clock freezes at BASE so
// the trip (BASE → BASE+5j) reads as upcoming and the « Prochain voyage » card
// mounts (it hides itself when nothing's coming — calm).
test('voyage: open the next trip — 1 tap (the board card row)', async ({ page }) => {
  const DAY = 86400
  const TRIP = {
    id: 'trip1',
    title: 'Vacances en Floride',
    destination: 'Orlando',
    start_at: BASE,
    end_at: BASE + 5 * DAY,
    members: [],
    media_kind: null,
    media_key: null,
    colour: '#5891AC',
    notes: null,
    position: 0,
    created_at: BASE,
    updated_at: null,
  }
  await page.clock.setFixedTime(new Date(BASE * 1000))
  await boot(page)
  await page.route('**/api/trips**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ trips: [TRIP] }) })
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
  )
  await page.route('**/api/trip-notes**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes: [] }) }),
  )
  await page.route('**/api/trip-packing**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }),
  )
  await page.reload() // pick up the trip override on a clean board load
  await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })

  const { tap, count } = tapCounter()
  const row = page.locator('.voyage-card__open', { hasText: 'Vacances en Floride' })
  await expect(row).toBeVisible({ timeout: 10_000 })
  await tap(row) // 1 — board card row → the trip notebook scene
  await expect(page).toHaveURL(/\/voyage\/trip1$/)
  await expect(page.locator('.scene', { hasText: 'Vacances en Floride' })).toBeVisible({ timeout: 10_000 })
  assertBudget('voyage: open the next trip', count(), 1)
})
