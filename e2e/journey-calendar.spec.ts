import { test, expect, type Page, type Route, type Locator } from '@playwright/test'
import { mockApi, seedState, BASE, MMID, CAR } from './mocks'
import { boxOf } from './measure'
import { addLocalDays } from '../src/lib/localDay'
import { test as test2, test as test7, test as test8 } from './fixtures'
import { isApi } from './interact'

// JOURNEY — THE CALENDAR (review #43; was month-day-panel.spec.ts + month-readable.spec.ts + week-view.spec.ts + year-to-month.spec.ts + cold-week-anchor.spec.ts + calendar-delete.spec.ts + when-labels.spec.ts + schedule-night.spec.ts).
//
// The Mois (calendar) day panel — the surface behind two reported frictions:
//
//  1. It carried TWO near-identical doors, « Voir la journée » (the editable day page)
//     and « Voir ce moment » (the same day, read-only, in the retired « Moments »
//     scene). One door now.
//  2. The six-week grid plus a six-item legend pushed the whole panel below the fold,
//     so tapping a date changed something you couldn't see. The grid is now capped
//     against the viewport and picking a day scrolls the panel into view.
//
// Frontend-only harness (Vite + stubbed /api/**), same as the other board specs.

// The reported viewport: a tall phone/small tablet in the 520–900px band, which had no
// cell-height cap at all before this pass.
test.describe('month-day-panel', () => {
  const REPORTED = { width: 660, height: 1176 }
  const PHONE = { width: 390, height: 844 }
  // Past the 900px breakpoint, where the calendar and the day sit side by side.
  const WIDE = { width: 1280, height: 900 }

  // The cell to hang the fixture on. Deliberately mid-grid and therefore IN-month: tapping
  // an out-of-month cell moves the calendar to that month, which re-requests /api/month
  // with a new `from` — and since this stub is relative to `from`, the seeded things would
  // land somewhere else entirely and the assertions would chase a moving target.
  const SEED_IDX = 20
  // Answer /api/month with two named things on that cell, whatever window the
  // calendar asks for. The shared fixture's month rows sit on a frozen date that no longer
  // falls inside the live window, so it renders an empty grid — fine for the layout tests
  // above, useless for anything about what a cell SAYS. Registered after mockApi so it wins
  // (Playwright tries routes newest-first).
  const EVENT_TITLE = 'Dentiste'
  const MEAL_TITLE = 'Pâté chinois'
  // The seeded cell's day is `from` walked SEED_IDX local days on — `addLocalDays`, the
  // household zone's own arithmetic (America/Toronto, DST-aware; the lib pins the zone, so
  // Node's UTC on CI does not matter), never `from + SEED_IDX * 86400`: the November grid
  // starts in October and crosses the fall-back Sunday, after which a fixed-86400 day lands
  // at 23:00 the day before, and the cell that bucketed by LOCAL midnight (lib/monthgrid)
  // never matches it. Red on CI from 2026-11-01 until this — the documented trap
  // (CLAUDE.md « Day arithmetic on a local midnight »).
  async function seedMonthOnCell(page: Page) {
    await page.route('**/api/month**', async (route) => {
      const from = Number(new URL(route.request().url()).searchParams.get('from'))
      const day = addLocalDays(from, SEED_IDX)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          events: [{ id: 'ev1', title: EVENT_TITLE, at: day + 14 * 3600, all_day: 0, member_id: null, day }],
          meals: [{ id: 'ml1', slot: 'souper', title: MEAL_TITLE, cook_member_id: null, day }],
          tasks: [],
          dayNotes: [],
          todos: [],
          trips: [],
          tripPlans: [],
          habits: [],
        }),
      })
    })
  }

  async function mois(page: Page, viewport = REPORTED) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize(viewport)
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, boardView: 'month' })
    await page.goto('/board')
    await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })
  }

  test.describe('Mois — the day panel', () => {
    test('offers ONE door into the day, and it opens the day page', async ({ page }) => {
      await mois(page)
      const panel = page.locator('.monthv__day')
      // « Voir ce moment » is gone with « Moments »; « Voir la journée » is the one way in.
      await expect(panel.getByRole('button', { name: /Voir ce moment/ })).toHaveCount(0)
      const door = panel.locator('.monthv__open-day')
      await expect(door).toHaveCount(1)

      await door.click()
      // /kitchen/day/<local-midnight secs> — the editable day, not a read-only recap.
      await page.waitForURL(/\/kitchen\/day\/\d+/)
      await expect(page.locator('.scene')).toBeVisible()
    })

    test('picking a date brings the panel into view instead of leaving it below the fold', async ({ page }) => {
      await mois(page)
      const panel = page.locator('.monthv__day')

      // Tap a date in the last week row — the furthest point down the grid, i.e. the
      // worst case for the panel sitting off screen.
      const cells = page.locator('.monthv__cell')
      await cells.nth((await cells.count()) - 3).click()

      // The panel's header must now be inside the viewport: this is the regression guard.
      // `toPass` absorbs the smooth-scroll settling (reduced motion makes it instant, but
      // the assertion shouldn't depend on that).
      await expect(async () => {
        const box = await panel.locator('.monthv__day-h').boundingBox()
        expect(box).not.toBeNull()
        expect(box!.y).toBeGreaterThanOrEqual(0)
        expect(box!.y + box!.height).toBeLessThanOrEqual(REPORTED.height)
      }).toPass({ timeout: 5_000 })
    })

    // The cell cap is a `max-height` budgeted off the viewport. It only ever SHRINKS, so
    // most sizes are untouched — what it exists for is the WIDE-BUT-SHORT window in the
    // 520–900px band, where seven square columns grew tall enough that the six-week grid
    // alone was taller than the screen. Measured on this harness before the cap:
    //   390×844 → 37% of the viewport      660×1176 → 46%      820×1180 → 57%
    //   860×820 → 86%                      880×700  → 103%  ← the grid outgrew the page
    // and after it, 880×700 and 860×820 both come down to 60% while the rest don't move.
    // (Note 660×1176 — the reported case — was never the cells: there the day panel was
    // pushed down by the STACK above it, which is what the scroll-into-view test covers.)
    test('the six-week grid never outgrows the screen, phone through kiosk', async ({ page }) => {
      for (const viewport of [
        { width: 390, height: 844 },
        REPORTED,
        { width: 820, height: 1180 },
        { width: 860, height: 820 },
        { width: 880, height: 700 },
        { width: 1280, height: 900 },
      ]) {
        await mois(page, viewport)
        const grid = await page.locator('.monthv__grid').boundingBox()
        expect(grid, `grid missing at ${viewport.width}px`).not.toBeNull()
        expect(
          grid!.height / viewport.height,
          `the grid claims too much of a ${viewport.width}×${viewport.height} screen`,
        ).toBeLessThan(0.75)
        // …and a cell stays a real tap target at every width.
        const cell = await page.locator('.monthv__cell').first().boundingBox()
        expect(cell!.height, `cells too small at ${viewport.width}px`).toBeGreaterThanOrEqual(38)
      }
    })

    // ── The pinned drawer ───────────────────────────────────────────────────────────
    // Stronger than the scroll-into-view guard above: below 900px the panel is sticky to
    // the bottom of the scrollport, so the picked day is on screen with NO scrolling at
    // all — including right after tapping the furthest cell down the grid.
    test('on a phone the day stays pinned on screen, with no scrolling', async ({ page }) => {
      await mois(page, PHONE)
      const cells = page.locator('.monthv__cell')
      await cells.nth((await cells.count()) - 3).click()
      const head = await page.locator('.monthv__day-h').boundingBox()
      expect(head).not.toBeNull()
      expect(head!.y).toBeGreaterThanOrEqual(0)
      expect(head!.y + head!.height).toBeLessThanOrEqual(PHONE.height)
      // …and the fold caret really folds the body away, without hiding the header.
      const body = page.locator('.monthv__day-body')
      await expect(body).toBeVisible()
      const fold = page.locator('.monthv__day-fold')
      await expect(fold).toHaveAttribute('aria-expanded', 'true')
      await fold.click()
      await expect(body).toBeHidden()
      await expect(fold).toHaveAttribute('aria-expanded', 'false')
      await expect(page.locator('.monthv__day-h')).toBeVisible()
    })

    // ── Two columns on a wide screen ────────────────────────────────────────────────
    test('on a wide screen the day sits BESIDE the calendar, not under it', async ({ page }) => {
      await mois(page, WIDE)
      const grid = await page.locator('.monthv__grid').boundingBox()
      const day = await page.locator('.monthv__day').boundingBox()
      expect(grid).not.toBeNull()
      expect(day).not.toBeNull()
      // Beside: the panel starts after the grid ends horizontally, and overlaps it vertically.
      expect(day!.x, 'the day panel should be to the right of the grid').toBeGreaterThanOrEqual(grid!.x + grid!.width - 1)
      expect(day!.y, 'the day panel should start level with the calendar').toBeLessThan(grid!.y + grid!.height)
      // In view without scrolling — the whole point of the column.
      expect(day!.y).toBeGreaterThanOrEqual(0)
      expect(day!.y).toBeLessThan(WIDE.height)
      // Folding is a narrow-screen affordance; there is nothing to reclaim in a column.
      await expect(page.locator('.monthv__day-fold')).toBeHidden()
    })

    // ── The tapped day names its things ─────────────────────────────────────────────
    // There is no view toggle any more: the grid is always a calm dotted glance, and the
    // The tapped day is simply the LIT one. It used to grow out of its square and float a
    // ~3-column tile over its neighbours, spelling its items out — and that tile brought
    // two guards with it: it had to stay inside the grid (it once hung ~80px past the
    // right edge when its side rules lost a specificity fight) and it had to stop
    // swallowing taps meant for the dates underneath.
    //
    // Both guards are retired because the thing they guarded is gone (Marc, 2026-08-26).
    // What replaced them is stricter and simpler: the cell never changes shape, so it can
    // neither bleed nor cover anything. e2e/lean-forms.spec.ts holds that contract («a
    // picked day keeps the grid's shape — no pop-out tile»); this one keeps the part that
    // is still this file's job — the grid stays inside the board, and every day in a row
    // is tappable in turn.
    test('the tapped day lights up without changing the grid, and its neighbours stay tappable', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize(REPORTED)
      await mockApi(page)
      await seedMonthOnCell(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, boardView: 'month' })
      await page.goto('/board')
      await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })

      // The density control is gone for good, and so are the in-cell words.
      await expect(page.locator('.monthv__density')).toHaveCount(0)
      await expect(page.locator('.monthv__lines')).toHaveCount(0)

      const seeded = page.locator('.monthv__cell').nth(SEED_IDX)
      await expect(seeded.locator('.monthv__dots')).toBeVisible()
      await seeded.click()
      await expect(seeded).toHaveClass(/is-on/)
      // Tapped or not, the cell still shows its dots and keeps its shape.
      await expect(seeded.locator('.monthv__dots')).toBeVisible()

      // The day PANEL is where the names live — that is the surface with room for them.
      await expect(page.locator('.monthv__day')).toContainText(EVENT_TITLE)
      await expect(page.locator('.monthv__day')).toContainText(MEAL_TITLE)

      // Seven consecutive days, tapped in turn: Playwright fails a click outright if
      // something covers the target, so this is also the proof that nothing floats over
      // a neighbour any more.
      for (let k = 0; k < 7; k++) {
        const cell = page.locator('.monthv__cell').nth(14 + k)
        await cell.click()
        await expect(cell).toHaveClass(/is-on/)
      }

      // No cell may push the grid wider than the board (per-child bounds, not scrollWidth:
      // the hub body clips overflow-x, so scrollWidth reads 0 — see CLAUDE.md).
      const gridBox = await boxOf(page.locator('.monthv__grid'))
      for (const cell of await page.locator('.monthv__cell').all()) {
        const b = await cell.boundingBox()
        if (b) expect(b.x + b.width, 'a cell bleeds past the grid').toBeLessThanOrEqual(gridBox.x + gridBox.width + 1)
      }
    })

    // ── A tapped MEAL's own « Voir la journée » is a MEAL door ──────────────────────
    // Marc, 2026-09-04: "select a meal ... Voir la journée button ... should take it
    // to meal subtab (but only because it's a meal we clicked)". buildMeal's day door
    // (src/components/detail/adapters.ts) used to land the default « Journée » face
    // like any other day door — wrong here, since the tap that opened this peek WAS a
    // meal. The day panel's OWN « Voir la journée » button (`.monthv__open-day`,
    // tested above) stays on the default face: that one wasn't reached via a meal.
    test('tapping a meal in the day panel, then « Voir la journée », lands on the Repas face', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize(REPORTED)
      await mockApi(page)
      await seedMonthOnCell(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, boardView: 'month' })
      await page.goto('/board')
      await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })

      const seeded = page.locator('.monthv__cell').nth(SEED_IDX)
      await seeded.click()
      const panel = page.locator('.monthv__day')
      await panel.locator('.act').filter({ hasText: MEAL_TITLE }).click()

      const sheet = page.locator('.detail-sheet')
      await sheet.waitFor({ state: 'visible', timeout: 10_000 })
      await sheet.locator('.detail-sheet__actions').getByText('Voir la journée', { exact: true }).click()

      await page.waitForURL(/\/kitchen\/day\/\d+\?vue=repas/)
    })

    // ── Where you are lives in the URL ──────────────────────────────────────────────
    test('the picked day and month ride in ?date=, and survive a reload', async ({ page }) => {
      await mois(page)
      // Today is the default, so it is stored as NO param.
      expect(new URL(page.url()).searchParams.get('date')).toBeNull()

      const header = page.locator('.monthv__day-h > b')
      const todayTitle = await header.innerText()
      const cells = page.locator('.monthv__cell')
      await cells.nth(20).click()
      // The URL updates a tick before the panel re-renders — wait for the panel, or the
      // snapshot below captures today's title and the reload check compares nothing.
      await expect(header).not.toHaveText(todayTitle)
      const picked = new URL(page.url()).searchParams.get('date')
      expect(picked, 'picking a day should write ?date=').toMatch(/^\d+$/)

      const dayTitle = await header.innerText()
      await page.reload()
      await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })
      expect(new URL(page.url()).searchParams.get('date')).toBe(picked)
      await expect(page.locator('.monthv__day-h > b')).toHaveText(dayTitle)

      // « Aujourd'hui » clears it again rather than writing today's date.
      await page.locator('.monthv__today').click()
      await expect.poll(() => new URL(page.url()).searchParams.get('date')).toBeNull()
    })

    // ── One ⋯ for everything you can add to the day ─────────────────────────────────
    test('the day menu seeds the event form with the picked date', async ({ page }) => {
      await mois(page)
      const cells = page.locator('.monthv__cell')
      await cells.nth(20).click()
      const picked = new URL(page.url()).searchParams.get('date')!

      await page.locator('.monthv__day-tools button[aria-haspopup]').click()
      await page.getByRole('menuitem', { name: /rendez-vous/i }).click()
      // /event/new?date=<the same local-midnight secs the calendar had selected>
      await page.waitForURL(/\/event\/new/)
      expect(new URL(page.url()).searchParams.get('date')).toBe(picked)
    })

    // A read-only guest gets no ⋯ (every entry is a write) but still READS the calendar
    // fully: tapping a date still opens that day's cell and its panel. Reading is never
    // gated on isGuest() — over-applying that guard is the mistake that hid board
    // reordering and the whole in-app guide from the public demo.
    test('a read-only guest loses the add menu but still opens a day', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize(REPORTED)
      await mockApi(page, { signedIn: false })
      await page.route('**/api/guest/whoami**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'showcase' }) }),
      )
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, boardView: 'month' })
      await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
      await page.goto('/board')
      await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })

      await expect(page.locator('.monthv__day-tools button[aria-haspopup]')).toHaveCount(0)
      // Reading is untouched: a tapped date still opens in place.
      const cell = page.locator('.monthv__cell').nth(20)
      await cell.click()
      await expect(cell).toHaveClass(/is-on/)
      await expect(page.locator('.monthv__day-h')).toBeVisible()
    })
  })

  // ── The legend is a HIGHLIGHT LENS ────────────────────────────────────────────────
  // The shape key under the grid used to be decoration (aria-hidden, unclickable). Each
  // entry is a toggle now: tap « Rendez-vous » and every day carrying one steps forward in
  // the grid while the rest step back, and the pane below swaps from "the picked day" to
  // "that kind, all month" — rolled up date by date, the same rows the day face prints.
  test.describe('Mois — the legend lens', () => {
    const lit = (page: Page) => page.locator('.monthv__legend-item[aria-pressed="true"]')

    async function moisSeeded(page: Page, viewport = REPORTED) {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize(viewport)
      await mockApi(page)
      await seedMonthOnCell(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, boardView: 'month' })
      await page.goto('/board')
      await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })
    }

    test('lights one kind across the month and rolls it up below', async ({ page }) => {
      await moisSeeded(page)
      const panel = page.locator('.monthv__day')
      // Nothing lit to begin with: the pane is the picked day and says BOTH seeded things.
      await expect(lit(page)).toHaveCount(0)
      expect(new URL(page.url()).searchParams.get('type')).toBeNull()

      await page.locator('.monthv__legend-item', { hasText: 'Rendez-vous' }).click()
      // The pick lives in the URL, beside ?date= — a lit calendar is a linkable place.
      await expect.poll(() => new URL(page.url()).searchParams.get('type')).toBe('event')
      await expect(lit(page)).toHaveCount(1)

      // The grid: exactly the seeded day steps forward, and only in-month cells may.
      const seeded = page.locator('.monthv__cell').nth(SEED_IDX)
      await expect(seeded).toHaveClass(/is-lit/)
      await expect(page.locator('.monthv__cell.is-lit')).toHaveCount(1)
      await expect(page.locator('.monthv__cell.is-lit.is-out')).toHaveCount(0)
      // …and the rendez-vous marker inside it is the one carrying weight.
      await expect(seeded.locator('.monthv__dot--event.is-lit')).toHaveCount(1)
      // …and the OTHER marker on that day (the meal) steps back rather than disappearing:
      // the lens is a reading weight, never a filter of the grid.
      await expect(seeded.locator('.monthv__dots .is-dim')).toHaveCount(1)

      // The pane: the month's rendez-vous, under their date — and NOT the meal.
      await expect(panel.locator('.monthv__rollup')).toHaveCount(1)
      await expect(panel).toContainText(EVENT_TITLE)
      await expect(panel).not.toContainText(MEAL_TITLE)
      // The day's own doors make no sense over a month — they give way to « revenir ».
      await expect(panel.locator('.monthv__open-day')).toHaveCount(0)
      await expect(panel.locator('.monthv__lens-clear')).toHaveCount(1)

      // Swapping lens re-aims the whole thing rather than stacking a second filter.
      await page.locator('.monthv__legend-item', { hasText: 'Repas' }).click()
      await expect(lit(page)).toHaveCount(1)
      await expect(panel).toContainText(MEAL_TITLE)
      await expect(panel).not.toContainText(EVENT_TITLE)

      // The ✕ puts the calendar back exactly as it was.
      await panel.locator('.monthv__lens-clear').click()
      await expect.poll(() => new URL(page.url()).searchParams.get('type')).toBeNull()
      await expect(page.locator('.monthv__cell.is-lit')).toHaveCount(0)
      await expect(panel.locator('.monthv__open-day')).toHaveCount(1)
    })

    test('survives a reload, and a roll-up date is the way back into that day', async ({ page }) => {
      await moisSeeded(page)
      await page.locator('.monthv__legend-item', { hasText: 'Rendez-vous' }).click()
      await expect.poll(() => new URL(page.url()).searchParams.get('type')).toBe('event')

      await page.reload()
      await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })
      await expect(lit(page)).toHaveCount(1)
      await expect(page.locator('.monthv__day')).toContainText(EVENT_TITLE)

      // Tapping the roll-up's date badge drops the lens and opens that single day — the
      // roll-up is a map back into the calendar, never a dead end.
      await page.locator('.monthv__rollup-date').first().click()
      await expect.poll(() => new URL(page.url()).searchParams.get('type')).toBeNull()
      await expect(page.locator('.monthv__cell').nth(SEED_IDX)).toHaveClass(/is-on/)
      // …and the full day is back: both seeded things, and the day's own door.
      const panel = page.locator('.monthv__day')
      await expect(panel).toContainText(EVENT_TITLE)
      await expect(panel).toContainText(MEAL_TITLE)
      await expect(panel.locator('.monthv__open-day')).toHaveCount(1)
    })

    // Desktop reachability + no horizontal overflow: the legend is a row of real buttons
    // now, so it has to be keyboard-operable and it must not bleed off a 390px phone.
    test('is keyboard-operable and fits a phone', async ({ page }) => {
      await moisSeeded(page, PHONE)
      const chip = page.locator('.monthv__legend-item', { hasText: 'Tâches' })
      await chip.focus()
      await page.keyboard.press('Enter')
      await expect(chip).toHaveAttribute('aria-pressed', 'true')
      await page.keyboard.press('Enter')
      await expect(chip).toHaveAttribute('aria-pressed', 'false')

      // Per-child bounds vs the legend's own box (the hub body clips overflow-x, so
      // scrollWidth reads 0 — see CLAUDE.md § Horizontal overflow).
      const row = await boxOf(page.locator('.monthv__legend'))
      for (const it of await page.locator('.monthv__legend-item').all()) {
        const b = await boxOf(it)
        expect(b.x + b.width, 'a legend chip bleeds past the row').toBeLessThanOrEqual(row.x + row.width + 1)
        expect(b.height, 'a legend chip is too small to tap').toBeGreaterThanOrEqual(26)
      }
    })
  })
})

// ── folded from journey-calendar.spec.ts ──────────────────────────────────────────────
test2.describe('month-readable', () => {
  test2.use({ timezoneId: 'America/Toronto' })

  // Review #21 (2026-11-17), Geneviève and Mélanie on a phone: « Mois » was coloured dots
  // « smaller than a grain of rice » under a legend in ~10px type; nobody could tell a vet
  // appointment from a supper. Now a cell names its first item, the markers are bigger,
  // and the legend reads.

  test2('on a phone, a month cell names what is on it, and the legend reads', async ({ app, page }) => {
    // The shared month mock is empty but for habits (not cell markers): give it rendez-vous.
    const ev = (id: string, title: string, at: number, day: number) => ({ id, title, at, all_day: 0, member_id: null, day })
    const events = [ev('e1', 'Vétérinaire', BASE + 3600, MMID), ev('e2', 'Dentiste', BASE + 3 * 3600, MMID)]
    const month = { events, meals: [], tasks: [], dayNotes: [], todos: [], trips: [], tripPlans: [], habits: [] }
    await app.boot({ route: '/board?view=month', wait: '.monthv__grid', clock: 'BASE', viewport: { width: 390, height: 844 }, api: { overrides: { month } } })
    const names = page.locator('.monthv__cell .monthv__name')
    await expect(names.first()).toBeVisible()
    expect((await names.first().textContent())?.trim().length).toBeGreaterThan(0)
    // One name per cell on a phone: seven columns leave no room for two.
    const perCell = await page.locator('.monthv__cell').evaluateAll((cells) =>
      Math.max(...cells.map((c) => [...c.querySelectorAll('.monthv__name')].filter((n) => (n as HTMLElement).offsetParent).length)),
    )
    expect(perCell).toBe(1)
    // Legible: the legend at ≥ 12px, a marker at ≥ 7px.
    const legendPx = await page.locator('.monthv__legend').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    expect(legendPx).toBeGreaterThanOrEqual(12)
    const dot = page.locator('.monthv__dot').first()
    if (await dot.count()) expect((await boxOf(dot)).height).toBeGreaterThanOrEqual(6.5)
  })
})


// ── folded from journey-calendar.spec.ts ──────────────────────────────────────────────
test.describe('week-view', () => {
  // « La semaine » — the third calendar face (src/components/board/WeekView.tsx).
  //
  // The app could show a day, a month and a year; the unit a household actually plans
  // in had no glance. What makes this view worth existing is that it has room for the
  // WORDS a month cell cannot afford — so the assertions here are mostly about words
  // being present and legible, not about the grid being correct (the month's own specs
  // already cover the payload, and both views read it through the same `linesFor`).

  // The board fixture's clock is pinned by the app, so anchor the week on the browser's
  // own local midnights — the same thing WeekView does. SEVEN of them, each computed by
  // the calendar (`setDate`), never `day0 + i * 86_400`: a DST day is 23 or 25 h long,
  // so a fixed day off a local midnight lands at 23:00 the night before — which is how
  // this spec went red on the 2026-10-30 run (the week that holds Nov 1) while the app
  // was right. The documented trap in CLAUDE.md (« Day arithmetic on a local midnight »).
  const monthWindow = (days: number[]) => ({
    events: [
      { id: 'e1', title: 'Rendez-vous dentiste', at: days[0]! + 9 * 3600, all_day: 0, member_id: 'm3', day: days[0] },
      { id: 'e2', title: 'Souper chez Mamie', at: days[2], all_day: 1, member_id: null, day: days[2] },
    ],
    meals: [{ id: 'm1', slot: 'supper', title: 'Spaghetti maison', cook_member_id: 'm1', day: days[0] }],
    tasks: [],
    dayNotes: [],
    todos: [],
    trips: [],
    tripPlans: [],
    // A daily habit on EVERY day of the window. It must not appear on any row: a habit is
    // not a marker (dayLines `markersFor`) — the week shipped listing it seven times.
    habits: Array.from({ length: 7 }, (_, i) => ({
      id: `hb${i}`,
      habit_id: 'h1',
      title: 'Boire assez d’eau',
      icon: '💧',
      colour: null,
      kind: 'do',
      member_id: null,
      day: days[i],
      done: i % 2 === 0,
    })),
    transfers: [],
  })

  test('the week spells its days out, and each row is a link into that day', async ({ page }) => {
    const days = await page.evaluate(() => {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      return Array.from({ length: 7 }, (_, i) => {
        const x = new Date(d)
        x.setDate(d.getDate() + i)
        return Math.floor(x.getTime() / 1000)
      })
    })
    await mockApi(page, { overrides: { month: monthWindow(days) } })
    await seedState(page, { theme: 'day', lang: 'fr', surface: 'mobile', boardView: 'semaine' })
    await page.goto('/board')

    const rows = page.locator('.weekv__day')
    // Seven days, always — a week is a fixed window, not "the days that have something".
    // Collapsing the empty ones is how a glance stops being able to say « jeudi is free ».
    await expect(rows).toHaveCount(7)

    // The WORDS. A title that only rendered as a dot would mean this view had become a
    // narrow month, which is the one thing it must not be.
    await expect(rows.first()).toContainText('Rendez-vous dentiste')
    await expect(rows.first()).toContainText('Spaghetti maison')
    // …and the clock face on a timed thing, absent on an all-day one.
    await expect(rows.first().locator('.weekv__time')).toHaveCount(1)
    await expect(rows.nth(2).locator('.weekv__time')).toHaveCount(0)
    await expect(rows.nth(2)).toContainText('Souper chez Mamie')

    // A free day says so, once and quietly — and it IS free, even though the fixture puts
    // a daily habit on it: habits are not markers on a glance surface. The bug this pins
    // (2026-09-16) listed « Boire assez d’eau » on all seven rows.
    await expect(rows.nth(1).locator('.weekv__free')).toBeVisible()
    await expect(page.locator('.weekv__day')).not.toContainText(['Boire assez d’eau'])
    await expect(page.locator('.weekv__line', { hasText: 'Boire assez d’eau' })).toHaveCount(0)

    // Every row is a real LINK to the ONE day door — not a div with an onClick. It has
    // to survive a middle-click and a keyboard, and be announced as a link (PARITY.md).
    const href = await rows.first().locator('a').getAttribute('href')
    expect(href).toBe(`/kitchen/day/${days[0]}`)
    await expect(rows.nth(3).locator('a')).toHaveAttribute('href', `/kitchen/day/${days[3]}`)
  })

  test('stepping a week moves the window and names where you landed', async ({ page }) => {
    await mockApi(page)
    await seedState(page, { theme: 'day', lang: 'fr', surface: 'mobile', boardView: 'semaine' })
    await page.goto('/board')

    const title = page.locator('.weekv .monthv__title')
    const first = await title.textContent()
    // « Cette semaine » is not offered while you are on it — it holds its slot instead
    // (visibility), so the arrows never move under a finger mid-tap.
    await expect(page.locator('.weekv .monthv__today.is-hidden')).toHaveCount(1)

    await page.locator('.weekv .monthv__nav').last().click()
    await expect(title).not.toHaveText(first ?? '')
    // …and now the way back is offered.
    await expect(page.locator('.weekv .monthv__today')).not.toHaveClass(/is-hidden/)

    await page.locator('.weekv .monthv__today').click()
    await expect(title).toHaveText(first ?? '')
  })

  test('the view survives a reload — it is this device’s chosen glance', async ({ page }) => {
    await mockApi(page)
    await seedState(page, { theme: 'day', lang: 'fr', surface: 'mobile' })
    await page.goto('/board')

    // Pick it from the toggle rather than seeding it, so this covers the SAVE too.
    await page.locator('.boardview .segmented__opt', { hasText: 'La semaine' }).click()
    await expect(page.locator('.weekv')).toBeVisible()

    await page.reload()
    await expect(page.locator('.weekv')).toBeVisible()
  })
})


// ── folded from journey-calendar.spec.ts ──────────────────────────────────────────────
test.describe('year-to-month', () => {
  // « Je clique du calendrier annuel vers un mois, et rien ne charge » (Marc, 2026-08-28).
  //
  // The transition itself is sound: the mini-month writes `?date=<local-midnight secs>`
  // and Mois derives its window from it. What makes it look broken is the FAILURE state,
  // and this surface has a property that makes that unusually costly:
  //
  //   `MONTH_KEY` has no `live` (browsing is not a glance surface, so it never polls) and
  //   the client sets `refetchOnWindowFocus: false`. After its retries are spent, NOTHING
  //   retries a failed month fetch. The « Réessayer » button is the only door there is.
  //
  // So this pins both halves: the happy path actually renders the month you asked for,
  // and the failed path always leaves a way out — including offline, which is when a
  // person is most likely to be tapping around a calendar that will not load.

  test('a mini-month opens THAT month, and asks the server for its window', async ({ page }) => {
    const windows: string[] = []
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    page.on('request', (r) => {
      const u = new URL(r.url())
      if (u.pathname === '/api/month') windows.push(u.search)
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', boardView: 'annee' })
    await page.goto('/board')
    await page.locator('.yearv').waitFor({ state: 'visible', timeout: 15_000 })

    const before = windows.length
    await page.locator('.yearv__month').nth(3).click()

    // It left the year view for the calendar, and put the month in the URL so the view
    // survives a reload / a peek / a trip to the day page.
    await expect(page.locator('.monthv__grid')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.yearv')).toHaveCount(0)
    await expect(page).toHaveURL(/[?&]date=\d+/)
    // …and it fetched a NEW window, not the one it was already showing.
    await expect.poll(() => windows.length, { timeout: 10_000 }).toBeGreaterThan(before)
  })

  test('a year whose fetch fails says so — never a lying « rien cette année »', async ({ page }) => {
    // The unfixed twin of the month bug (Marc, 2026-09-02: « my calendar doesn't
    // work and can't load until I do a hard refresh »): /api/year failed once,
    // YearView had no error state, so it painted twelve blank mini-months plus a
    // calm "nothing this year" — with no retry door and (no poll on this surface)
    // no automatic retry, ever. Now it wears the same LoadError face as Mois, and
    // « Réessayer » actually recovers once the server does.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await page.route('**/api/year**', (route) => route.fulfill({ status: 500, body: 'nope' }))
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', boardView: 'annee' })
    await page.goto('/board')
    await page.locator('.yearv').waitFor({ state: 'visible', timeout: 15_000 })

    await expect(page.locator('.yearv .load-error')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.yearv .load-error button')).toHaveCount(1)
    // The failed read must not masquerade as an empty year.
    await expect(page.locator('.yearv .empty-state')).toHaveCount(0)

    // Server recovers → « Réessayer » brings the year back (mockApi's fixture).
    await page.unroute('**/api/year**')
    await page.locator('.yearv .load-error button').click()
    await expect(page.locator('.yearv .load-error')).toHaveCount(0, { timeout: 20_000 })
  })

  test('a month whose fetch fails still offers the way out — online', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await page.route('**/api/month**', (route) => route.fulfill({ status: 500, body: 'nope' }))
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', boardView: 'annee' })
    await page.goto('/board')
    await page.locator('.yearv').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('.yearv__month').nth(3).click()

    await expect(page.locator('.load-error').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.load-error button'), 'the only door on a non-polling view').toHaveCount(1)
  })

  test('…and offline too — the surface never polls, so the button is the only recovery', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await page.route('**/api/month**', (route) => route.fulfill({ status: 500, body: 'nope' }))
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', boardView: 'annee' })
    await page.goto('/board')
    await page.locator('.yearv').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('.yearv__month').nth(3).click()
    await expect(page.locator('.load-error').first()).toBeVisible({ timeout: 20_000 })

    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    // Quiet, because no signal is weather rather than a surprise…
    await expect(page.locator('.load-error .status-msg')).toHaveCount(0)
    // …but never a dead end. This is the regression the report caught: dropping the
    // button offline left a blank calendar with two grey lines and nothing to tap.
    await expect(page.locator('.load-error button')).toHaveCount(1)
  })
})


// ── folded from journey-calendar.spec.ts ──────────────────────────────────────────────
test.describe('cold-week-anchor', () => {
  // bmad/11 tier-3, "cold kitchen grid flashes a Jan-1970 week (`weekStart ?? 0`)".
  //
  // The named site (the Kitchen grid) was already fixed — it holds a Skeleton until the
  // meals payload lands. Sweeping the RULE rather than the site turned up a fifth
  // consumer that was NOT guarded, and where the same epoch anchor was worse than a
  // flash: `IdeasPage` feeds its labelled week straight into the ideas drawer's
  // "plan it on…" day chips (MealPool → MealPlanPicker), so on a cold open a tap wrote
  // a meal dated 1 Jan 1970. RecipeViewPage, AddSheet and nextMeal all already had the
  // `weekStart ? … : []` guard; IdeasPage was the one of the five that didn't.
  //
  // Driven by never fulfilling /api/meals, which IS the cold first paint.
  //
  // NOTE ON THE ASSERTION: the first version of this spec looked for the string "1970"
  // and passed with the bug planted — `formatWeekday` renders « jeudi », never a year,
  // so the epoch was invisible to it. That is the "a guard that has never been red
  // proves nothing" trap, and it only surfaced because the plant was actually run. The
  // assertion is structural now: with no anchor there must be no day chip to tap.

  test('the ideas drawer offers no day to plan on until the real week anchor arrives', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    // Cold: the meals payload never lands, so `weekStart` stays at its `?? 0` fallback.
    await page.route('**/api/meals**', () => {
      /* deliberately never fulfilled */
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/kitchen/idees')
    await expect(page.locator('.scene.ideas-drawer')).toBeVisible()

    // Open an idea's plan picker — the door the day chips live behind.
    await page.locator('.kitchen__idea-name').first().click()
    const picker = page.locator('.meal-plan-pick')
    await expect(picker, 'the picker itself still opens — only its days are withheld').toBeVisible()

    // The row of "plan it on…" days must be EMPTY. With the epoch anchor it held ten
    // weekday chips, every one of them writing a meal in January 1970. (« À placer »
    // carries no date, so it may stay — it is not a day.)
    await expect(picker.locator('.meal-plan-pick__days .chip:not(.meal-plan-pick__unplaced)')).toHaveCount(0)
  })

  test('once the week anchor lands, the days are offered again', async ({ page }) => {
    // The other side, so the guard can't be "fixed" by simply never showing days.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/kitchen/idees')
    await expect(page.locator('.scene.ideas-drawer')).toBeVisible()

    await page.locator('.kitchen__idea-name').first().click()
    const days = page.locator('.meal-plan-pick .meal-plan-pick__days .chip:not(.meal-plan-pick__unplaced)')
    await expect(days.first()).toBeVisible()
    expect(await days.count()).toBeGreaterThan(0)
  })
})


// ── folded from journey-calendar.spec.ts ──────────────────────────────────────────────
test.describe('calendar-delete', () => {
  // « Make sure we can remove/delete easily from detail popups and such for rendez-vous
  // and others on calendar » (Marc, 2026-09-16). Before this, the month panel's corvée and
  // entretien peeks had no « Modifier » and no « Supprimer », a planned meal tapped there
  // could not be taken off the plan, and the day page — which edits a rendez-vous inline
  // instead of opening the peek — had no way to delete one at all. One shared hook
  // (components/detail/EntityRemovals) now hands the same doors to the board, the month
  // panel and the day page.
  //
  // Frontend-only harness (Vite + stubbed /api/**). The calendar is pinned to MMID (the
  // mocks' frozen local midnight) through `?date=`, and every dated thing sits on that day
  // whatever window /api/month is asked for, so the panel always shows the four rows.

  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })

  const EVENT = { id: 'ev1', title: 'Dentiste', start_at: MMID + 14 * 3600, all_day: 0, member_id: null, contact_id: null, business_id: null, recur_json: null, lead_seconds: null, car_id: null, passengers: null, bring_template_id: null }
  const CHORE = { id: 'ch1', title: 'Sortir le recyclage', rotation_json: '[]', current_idx: 0, last_done_at: null, last_done_by: null, color: '#5891AC', recur_json: null, recur_start: MMID, lead_seconds: null, announce_evening: 0 }

  async function seed(page: Page, opts: { guest?: boolean } = {}) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.routeWebSocket(/\/api\/live/, () => {})
    if (opts.guest) {
      // The link guest's whole identity (the guest-settings spec's boot): no operator
      // session, a `showcase` whoami, and the device-side guest token.
      await mockApi(page, { signedIn: false })
      await page.route('**/api/guest/whoami**', (route: Route) => route.fulfill(json({ kind: 'showcase' })))
      await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
    } else {
      await mockApi(page)
    }
    // Registered AFTER mockApi so they win (Playwright tries routes newest-first).
    await page.route('**/api/month**', (route: Route) =>
      route.fulfill(
        json({
          events: [{ id: 'ev1', title: 'Dentiste', at: MMID + 14 * 3600, all_day: 0, member_id: null, day: MMID }],
          meals: [{ id: 'ml1', slot: 'souper', title: 'Pâté chinois', cook_member_id: null, day: MMID }],
          // Every task on the calendar is one list (TaskCell, 2026-11-08); every delete goes to
          // /api/tasks (0153).
          tasks: [
            { id: 'ch1', taskId: 'ch1', source: 'task', title: 'Sortir le recyclage', color: '#5891AC', icon: null, kind: null, who_id: null, day: MMID, done: false, recurring: false, soon: false },
            { id: 'hp1', taskId: 'hp1', source: 'home', title: 'Changer le filtre', color: '#88A36F', icon: null, kind: 'upkeep', who_id: null, day: MMID, done: false, recurring: false, soon: false },
          ],
          dayNotes: [],
          todos: [],
          trips: [],
          tripPlans: [],
          habits: [],
        }),
      ),
    )
    await page.route('**/api/events**', (route: Route) => route.fulfill(route.request().method() === 'GET' ? json({ events: [EVENT] }) : json({ ok: true })))
    // The one form's read of a task (functions/api/tasks/one; it was /api/chores, review #37).
    await page.route('**/api/tasks/one**', (route: Route) => route.fulfill(json({ task: new URL(route.request().url()).searchParams.get('id') === CHORE.id ? CHORE : null })))
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, boardView: 'month', surface: 'mobile' })
  }

  async function openMonthPanel(page: Page) {
    await page.goto(`/board?date=${MMID}`)
    await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })
    return page.locator('.monthv__day')
  }

  const waitDelete = (page: Page, path: string, timeout = 30_000) =>
    page.waitForRequest((r) => r.method() === 'DELETE' && new URL(r.url()).pathname === `/api/${path}`, { timeout })

  test.describe('Mois — the day panel’s peeks can delete', () => {
    test('a rendez-vous: « Supprimer » is a visible button in the peek → confirm → DELETE /api/events', async ({ page }) => {
      await seed(page)
      const panel = await openMonthPanel(page)
      await panel.locator('.act', { hasText: 'Dentiste' }).first().click()
      const sheet = page.locator('.detail-sheet')
      await sheet.waitFor({ state: 'visible' })
      const del = sheet.locator('.detail-sheet__actions').getByRole('button', { name: 'Supprimer', exact: true })
      await expect(del).toBeVisible()
      const [req] = await Promise.all([
        waitDelete(page, 'events'),
        (async () => {
          await del.click()
          await page.locator('.confirm__actions').getByRole('button', { name: 'Supprimer' }).click()
        })(),
      ])
      expect(req.postDataJSON()).toMatchObject({ id: 'ev1' })
    })

    test('a task: the peek offers « Modifier » (→ its scene) and « Supprimer » (deferred behind the undo toast)', async ({ page }) => {
      await seed(page)
      const panel = await openMonthPanel(page)
      const row = panel.locator('.act', { hasText: 'Sortir le recyclage' })
      await row.first().click()
      const sheet = page.locator('.detail-sheet')
      await sheet.waitFor({ state: 'visible' })
      await sheet.locator('.action-menu__btn').click()
      await expect(page.getByRole('menuitem', { name: 'Modifier' })).toBeVisible()
      await page.getByRole('menuitem', { name: 'Supprimer' }).click()
      // Deferred: the row leaves the panel now, the toast offers « Annuler », and the
      // DELETE only fires once the undo window closes.
      await expect(row).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible()
      await page.clock.install()
      const [req] = await Promise.all([waitDelete(page, 'tasks'), page.clock.runFor(16_000)])
      expect(req.postDataJSON()).toMatchObject({ id: 'ch1' })
    })

    test('an entretien: same two doors, same tier', async ({ page }) => {
      await seed(page)
      const panel = await openMonthPanel(page)
      const row = panel.locator('.act', { hasText: 'Changer le filtre' })
      await row.first().click()
      const sheet = page.locator('.detail-sheet')
      await sheet.waitFor({ state: 'visible' })
      await sheet.locator('.action-menu__btn').click()
      await expect(page.getByRole('menuitem', { name: 'Modifier' })).toBeVisible()
      await page.getByRole('menuitem', { name: 'Supprimer' }).click()
      await expect(row).toHaveCount(0)
      await page.clock.install()
      const [req] = await Promise.all([waitDelete(page, 'tasks'), page.clock.runFor(16_000)])
      expect(req.postDataJSON()).toMatchObject({ id: 'hp1' })
    })

    test('a planned meal: « Retirer du plan » in the peek → DELETE /api/meals, with an undo', async ({ page }) => {
      await seed(page)
      const panel = await openMonthPanel(page)
      await panel.locator('.act', { hasText: 'Pâté chinois' }).first().click()
      const sheet = page.locator('.detail-sheet')
      await sheet.waitFor({ state: 'visible' })
      // A free-text meal (no recipe doors) keeps its plan actions VISIBLE — « Retirer du
      // plan » is a danger button in the row, not a ⋯ item (buildMeal folds only when the
      // recipe doors are present).
      const [req] = await Promise.all([waitDelete(page, 'meals'), sheet.locator('.detail-sheet__actions').getByRole('button', { name: 'Retirer du plan' }).click()])
      expect(req.postDataJSON()).toMatchObject({ id: 'ml1' })
      await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible()
    })

    test('a read-only guest sees none of the delete doors', async ({ page }) => {
      await seed(page, { guest: true })
      const panel = await openMonthPanel(page)
      await panel.locator('.act', { hasText: 'Sortir le recyclage' }).first().click()
      const sheet = page.locator('.detail-sheet')
      await sheet.waitFor({ state: 'visible' })
      await expect(sheet.locator('.action-menu__btn')).toHaveCount(0)
      await expect(sheet.getByRole('button', { name: 'Supprimer', exact: true })).toHaveCount(0)
    })
  })

  test.describe('the day page can delete what it edits', () => {
    test('a rendez-vous edited inline shows « Supprimer le rendez-vous » under the form → confirm → DELETE', async ({ page }) => {
      await seed(page)
      await page.goto(`/kitchen/day/${MMID}`)
      await page.locator('.scene').waitFor({ state: 'visible', timeout: 15_000 })
      await page.locator('.act', { hasText: 'Dentiste' }).first().click()
      const del = page.getByRole('button', { name: 'Supprimer le rendez-vous' })
      await expect(del).toBeVisible()
      const [req] = await Promise.all([
        waitDelete(page, 'events'),
        (async () => {
          await del.click()
          await page.locator('.confirm__actions').getByRole('button', { name: 'Supprimer' }).click()
        })(),
      ])
      expect(req.postDataJSON()).toMatchObject({ id: 'ev1' })
    })

    test('a task row opens the same peek as the calendar: « Supprimer » hides it, the write waits behind the toast', async ({ page }) => {
      await seed(page)
      await page.goto(`/kitchen/day/${MMID}`)
      await page.locator('.scene').waitFor({ state: 'visible', timeout: 15_000 })
      const row = page.locator('.act', { hasText: 'Sortir le recyclage' })
      await row.first().click()
      const sheet = page.locator('.detail-sheet')
      await sheet.waitFor({ state: 'visible' })
      await sheet.locator('.action-menu__btn').click()
      await page.getByRole('menuitem', { name: 'Supprimer' }).click()
      await expect(row).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible()
      await page.clock.install()
      const [req] = await Promise.all([waitDelete(page, 'tasks'), page.clock.runFor(16_000)])
      expect(req.postDataJSON()).toMatchObject({ id: 'ch1' })
    })

    test('an entretien row opens the peek with « Modifier » + « Supprimer »', async ({ page }) => {
      await seed(page)
      await page.goto(`/kitchen/day/${MMID}`)
      await page.locator('.scene').waitFor({ state: 'visible', timeout: 15_000 })
      const row = page.locator('.act', { hasText: 'Changer le filtre' })
      await row.first().click()
      const sheet = page.locator('.detail-sheet')
      await sheet.waitFor({ state: 'visible' })
      await sheet.locator('.action-menu__btn').click()
      await expect(page.getByRole('menuitem', { name: 'Modifier' })).toBeVisible()
      await page.getByRole('menuitem', { name: 'Supprimer' }).click()
      await expect(row).toHaveCount(0)
    })
  })
})


// ── folded from journey-calendar.spec.ts ──────────────────────────────────────────────
test7.describe('when-labels', () => {
  // Review #12 (2026-11-17), Mélanie: three small lies about WHEN.
  //   · « Quel jour ? » listed « mardi … lundi mardi mercredi jeudi », no dates;
  //   · an all-day rendez-vous taking the car read « 0 h 00–0 h 00 » on /voiture;
  //   · a shared `/board?view=week` landed on the grid without a word.

  const DAY = 86_400

  test7('?view=week opens « La semaine »', async ({ app, page }) => {
    await app.boot({ route: '/board?view=week', wait: '.hub' })
    await expect(page.locator('.weekv')).toBeVisible()
  })

  test7('the meal day picker dates every chip past tomorrow; no two alike', async ({ app, page }) => {
    // The mock's meal window starts on its fixed anchor day: the clock stands there too.
    await app.boot({ route: '/kitchen?plus=meal', wait: '.hub', clock: 'BASE' })
    const chips = page.locator('.addsheet__days button')
    await expect(chips.first()).toHaveText('Aujourd’hui')
    await expect(chips.nth(1)).toHaveText('Demain')
    await expect(chips.nth(2)).toHaveText(/^\p{Lu}\p{L}+ \d{1,2}$/u)
    const labels = await chips.allTextContents()
    expect(labels.length).toBeGreaterThan(7)
    expect(new Set(labels).size).toBe(labels.length)
  })

  test7('an all-day rendez-vous that takes the car reads « Toute la journée »', async ({ app, page }) => {
    const d = MMID + 2 * DAY
    const car = {
      ...CAR,
      days: CAR.days.map((day) =>
        day.day === d
          ? {
              ...day,
              carSpans: [{ start: d, end: d + DAY, label: 'École de la vue', holderId: 'm1' }],
              rides: day.rides.map((r) => ({ ...r, title: 'École de la vue', at: d, allDay: 1 })),
            }
          : day,
      ),
    }
    await app.boot({ route: '/voiture', api: { overrides: { car } } })
    const row = page.locator('.voiture__day').filter({ hasText: 'École de la vue' })
    await expect(row.locator('.voiture__day-window')).toHaveText('Toute la journée')
    await expect(row).not.toContainText('0 h 00–0 h 00')
  })
})


// ── folded from journey-calendar.spec.ts ──────────────────────────────────────────────
test8.describe('schedule-night', () => {
  // Review #11 (2026-11-17), Mélanie, a rotating-shift nurse, in Réglages ▸ L'auto & horaires:
  //   · a 23 h – 7 h 30 night shift was refused (« end must be after start »);
  //   · the time fields read « 08:00 AM / 05:00 PM » in a French app (the browser's clock);
  //   · « Aucun horaire » showed while the list was still loading, inviting a second entry.

  const SCHEDULE = '/settings?tab=maison&focus=schedule'

  async function setTime(form: Locator, label: string, h: number, m: number) {
    const group = form.getByRole('group', { name: label, exact: true })
    await group.getByRole('combobox', { name: 'Heure' }).selectOption(String(h))
    await group.getByRole('combobox', { name: 'Minute' }).selectOption(String(m))
  }

  test8('a night shift is accepted: it says it ends the next day, and posts end < start', async ({ app, page }) => {
    await app.boot({ route: SCHEDULE })
    await page.locator('#op-schedule').getByRole('button', { name: 'Ajouter un horaire' }).click()
    const form = page.locator('.operator__inline-form').last()
    await form.getByRole('button', { name: 'Papa', exact: true }).click()

    // 24-hour, whatever the browser's locale: the hour list reads « 23 h », never « PM ».
    await expect(form.getByRole('group', { name: 'De', exact: true }).getByRole('combobox', { name: 'Heure' })).toContainText('23 h')
    await expect(form).not.toContainText(/AM|PM/)

    await setTime(form, 'De', 23, 0)
    await setTime(form, 'à', 7, 30)
    await expect(form).toContainText('Finit le lendemain')

    const [req] = await Promise.all([
      page.waitForRequest(isApi('POST', 'schedule'), { timeout: 20_000 }),
      form.getByRole('button', { name: 'Ajouter', exact: true }).click(),
    ])
    const body = JSON.parse(req.postData() || '{}') as { startMin?: number; endMin?: number }
    expect([body.startMin, body.endMin]).toEqual([23 * 60, 7 * 60 + 30])
  })

  test8('while the schedule loads, the list never says « Aucun horaire »', async ({ app, page }) => {
    await app.boot()
    // Hold /api/schedule until the test has looked at the waiting state.
    let release: () => void = () => {}
    const held = new Promise<void>((r) => (release = r))
    await page.route('**/api/schedule', async (route) => {
      await held
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ blocks: [] }) })
    })
    await page.goto(SCHEDULE)
    const section = page.locator('#op-schedule')
    await expect(section.locator('.skeleton').first()).toBeVisible()
    await expect(section).not.toContainText('Aucun horaire')

    release()
    await expect(section).toContainText('Aucun horaire')
  })
})
