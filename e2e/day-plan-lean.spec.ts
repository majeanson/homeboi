import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « Planifier une journée » (/kitchen/day/:date) after the 2026-08-26 pass:
//
//  1. ORDER — the day's schedule leads. What is already booked and can't move
//     (Rendez-vous ▸ Les corvées ▸ Projets) comes before what you decide around it
//     (À compléter). It used to open on the todo list and the meal
//     editor, with the day's own agenda scrolled off below them.
//     2026-09-02: the scene split into TWO FACES behind a `?vue=` sub-tab row —
//     « Journée » (default: the agenda) and « Repas » (the meal planner). Meal
//     doors (the kitchen pencil, ＋ « Planifier un repas », history, a meal search
//     hit) land `?vue=repas`; day doors land the default.
//  2. ONE ANATOMY — every section is a SecLabel header (glyph · title · rule ·
//     count) whose trailing ＋ is the shared SectionAdd, then its rows, then the
//     composer that ＋ opened. No hand-rolled headings, no full-width
//     « Ajouter un rendez-vous / une corvée » bar camping under each list, and no
//     dashed per-slot « ＋ Ajouter » pill in the meal planner.
//  3. NOTES ON A RENDEZ-VOUS (migration 0121) — a rendez-vous carries its own
//     free-text note, shown as a second sub-line on its row.
//
// The shared `month` fixture is empty, so this spec seeds the day it means to test.

const TODAY = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
})()

const NOTE = 'apporter la carte d’assurance maladie · 3e étage'

const DAY_MONTH = {
  month: {
    // ONE timed rendez-vous: below the ribbon threshold (≥2), so the rows sit in the
    // Rendez-vous bucket where they can be counted and tapped directly.
    events: [{ id: 'de1', title: 'Dentiste — Léa', at: TODAY + 9 * 3600, all_day: 0, member_id: 'm3', day: TODAY, notes: NOTE }],
    meals: [],
    chores: [{ id: 'dc1', title: 'Vider le lave-vaisselle', color: '#88A36F', who: 'Papa', day: TODAY }],
    dayNotes: [],
    todos: [],
    homeProjects: [],
    trips: [],
    tripPlans: [],
    habits: [],
  },
  // Tapping a row opens the EDIT form, which resolves the full series off /api/events
  // (the /api/month occurrence carries display fields only) — so the same rendez-vous
  // has to exist there, note included.
  events: {
    events: [
      { id: 'de1', title: 'Dentiste — Léa', start_at: TODAY + 9 * 3600, all_day: 0, member_id: 'm3', notes: NOTE },
    ],
  },
}

async function openDay(page: Page, opts: { guest?: boolean; vue?: 'repas' } = {}) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
    } catch {
      /* noop */
    }
  })
  await mockApi(page, { overrides: DAY_MONTH, signedIn: !opts.guest })
  if (opts.guest) {
    // A read-only LINK guest (what the public demo is): no operator session, a guest
    // token in localStorage, `showcase` share-mode so they stay in the hub.
    await page.route('**/api/guest/whoami**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'showcase' }) }),
    )
    await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
  }
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto(`/kitchen/day/${TODAY}${opts.vue ? `?vue=${opts.vue}` : ''}`)
  await expect(page.locator('.day-plan__sections')).toBeVisible({ timeout: 15_000 })
}

test('the day leads with its schedule: Rendez-vous and Les corvées come first', async ({ page }) => {
  await openDay(page)
  // The default « Journée » face is the agenda alone — the meal planner is the
  // « Repas » face, one sub-tab over (no « Les repas » section stacked below).
  const headings = (await page.locator('.day-plan__sections .sec-label b').allInnerTexts()).map((s) => s.trim())
  // Projets & Entretien is absent (nothing lands on this day) — it only shows when
  // there is something, and it is a mirror of Réglages ▸ Corvées, not a home.
  expect(headings).toEqual(['Rendez-vous', 'Les corvées', 'À compléter'])
  await expect(page.locator('.day-mng__sec')).toHaveCount(0)
  // Flipping to « Repas » shows the planner (the slot sections), not the agenda.
  await page.getByRole('tab', { name: 'Repas' }).click()
  await expect(page.locator('.day-mng__sec').first()).toBeVisible()
  await expect(page.locator('.day-plan__sec').filter({ hasText: 'Rendez-vous' })).toHaveCount(0)
})

test('every section carries its ＋ in the header — no add bar under the list', async ({ page }) => {
  await openDay(page)
  const rdv = page.locator('.day-plan__sec').filter({ hasText: 'Rendez-vous' })
  // The ＋ lives IN the header row, beside the title and the count.
  const plus = rdv.locator('.sec-label .sec-label__actbtn')
  await expect(plus).toHaveCount(1)
  await expect(rdv.locator('.operator__inline-form')).toHaveCount(0)

  // Tapping it opens the shared EventForm inside the section; the ＋ flips to ✕ and
  // closing it again is the same control.
  await plus.click()
  await expect(rdv.locator('.operator__inline-form')).toBeVisible()
  await expect(plus).toHaveAttribute('aria-expanded', 'true')
  await plus.click()
  await expect(rdv.locator('.operator__inline-form')).toHaveCount(0)

  // The corvées section is the SAME anatomy, not a variation on it.
  const chores = page.locator('.day-plan__sec').filter({ hasText: 'Les corvées' })
  await chores.locator('.sec-label .sec-label__actbtn').click()
  await expect(chores.locator('.operator__inline-form')).toBeVisible()
})

test('« À compléter » keeps its picker behind the same header ＋', async ({ page }) => {
  await openDay(page)
  const todos = page.locator('.todo-sec')
  // The add field is NOT open by default any more — the section leads with its rows.
  await expect(todos.locator('.edit-field input.input')).toHaveCount(0)
  await todos.locator('.sec-label .sec-label__actbtn').click()
  await expect(todos.locator('.edit-field input.input')).toBeFocused()
})

test('a rendez-vous shows its own note on the row', async ({ page }) => {
  await openDay(page)
  const row = page.locator('.day-plan__sec .act').filter({ hasText: 'Dentiste' })
  await expect(row.locator('.act__note')).toContainText(NOTE)
})

test('the event form carries a « Note » fold, open when the rendez-vous has one', async ({ page }) => {
  await openDay(page)
  // A BRAND-NEW rendez-vous: the fold is closed (it is optional detail).
  const rdv = page.locator('.day-plan__sec').filter({ hasText: 'Rendez-vous' })
  await rdv.locator('.sec-label .sec-label__actbtn').click()
  const newFold = rdv.locator('.event-note')
  await expect(newFold).toBeVisible()
  await expect(newFold.locator('textarea')).toHaveCount(0)
  await newFold.getByRole('button', { name: 'Note' }).click()
  await expect(newFold.locator('textarea')).toBeVisible()

  // EDITING the seeded one: the fold is already OPEN with the note in it — a fold
  // may never hide a filled field (LEAN.md invariant 1).
  await page.reload()
  await page.locator('.day-plan__sec .act').filter({ hasText: 'Dentiste' }).click()
  await expect(page.locator('.event-note textarea')).toHaveValue(NOTE)
})

test('the meal slots use the same ＋ chip — no dashed « Ajouter » pill', async ({ page }) => {
  await openDay(page, { vue: 'repas' })
  const supper = page.locator('.day-mng__sec[data-dnd-zone="supper"]')
  await expect(supper.locator('.kitchen__slot-add')).toHaveCount(0)
  const plus = supper.locator('.day-mng__sec-head-row .sec-label__actbtn')
  // Nothing on this day yet, so it reads « Ajouter » (not « Ajouter un autre ») and
  // still names the slot — an icon-only control may never end up unnamed.
  await expect(plus).toHaveAttribute('aria-label', 'Ajouter — Souper')
  await plus.click()
  await expect(supper.locator('.edit-field input.input')).toBeVisible()
})

test('the « + ingrédients » opt-in does not close the dropdown under it', async ({ page }) => {
  // The regression: that chip is a plain <button>, which does NOT take focus on
  // mousedown in Safari/Firefox — so pressing it blurred the input, the combobox's
  // deferred blur check found <body> focused, and the menu shut BETWEEN mousedown
  // and click. The tap toggled nothing and the list vanished. The fix is a
  // mousedown-preventDefault wrapper around the dropdown's header.
  await openDay(page, { vue: 'repas' })
  const supper = page.locator('.day-mng__sec[data-dnd-zone="supper"]')
  await supper.locator('.day-mng__sec-head-row .sec-label__actbtn').click()
  const chip = supper.locator('.kitchen__recipe-staples')
  await expect(chip).toBeVisible()

  // The mechanism, asserted directly (Chromium focuses buttons on mousedown, so the
  // browser this runs in cannot reproduce the Safari half on its own): a cancelable
  // mousedown on the chip must come back prevented.
  const prevented = await chip.evaluate((el) => !el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })))
  expect(prevented).toBe(true)

  // …and the behaviour: tap it, the opt-in turns on and the list is still open.
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  await expect(supper.locator('.combobox__menu')).toBeVisible()
})

test('a read-only guest sees the day, but none of the ＋', async ({ page }) => {
  await openDay(page, { guest: true })
  await expect(page.locator('.day-plan__sections .sec-label__actbtn')).toHaveCount(0)
  await expect(page.locator('.day-plan__sec .act').filter({ hasText: 'Dentiste' })).toBeVisible()
  // …and the « Repas » face is just as read-only: no slot ＋ either (DayEditor
  // gates its own controls via isGuest).
  await page.getByRole('tab', { name: 'Repas' }).click()
  await expect(page.locator('.day-mng__sec').first()).toBeVisible()
  await expect(page.locator('.day-mng__sec .sec-label__actbtn')).toHaveCount(0)
})
