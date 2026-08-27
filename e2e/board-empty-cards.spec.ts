import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, BOARD, ROUTES } from './mocks'

// « Une carte qui n'a rien à dire s'en va » — the board's empty-card contract, and
// the one AUJOURDHUI §6 gap no spec covered: every frame we shoot has a full
// fixture, so nothing ever asserted that a card LEAVES when its data empties.
//
// The mechanism is `useReportEmpty` (lib/useReportEmpty.ts) plus each card's `mode`
// in lib/boardCards. Three states, and the middle one is the subtle one:
//
//   • 'never'  — dropped before it reaches a slot; not in the DOM at all (that's
//     the « Jamais » pref, covered by board-customize.spec).
//   • 'auto'   — collapsed when empty. The slot stays MOUNTED under the `hidden`
//     attribute rather than unmounting, because a self-fetching card can only
//     discover it is empty AFTER it has fetched — unmounting it would take the
//     fetch with it and the card could never come back. So the assertion here is
//     "hidden", never "absent"; a card that unmounts itself is the bug.
//   • 'always' — holds its place with a uniform placeholder, because its door is
//     unconditional: leaving the house isn't contingent on the agenda.
//
// A regression in either direction is invisible in a screenshot of a seeded
// household — which is exactly why it went untested for so long.

const slot = (page: Page, card: string) => page.locator(`.wg-slot[data-card="${card}"]`)

// Everything « Demain » counts as content. It is deliberately a WIDE net
// (boardModel `hasTomorrow`): tomorrow's forecast alone earns the card, because
// "il va pleuvoir demain" is a real thing to say about tomorrow even when the
// agenda is bare. Emptying only the events is not emptying the card.
const NO_TOMORROW = { tomorrow: [], tomorrowMeal: null, tomorrowMeals: [], tomorrowNote: null }
const wxNoTomorrow = () => ({ ...(ROUTES.weather as Record<string, unknown>), tomorrow: null })

async function board(page: Page, overrides?: Record<string, unknown>) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, overrides ? { overrides } : {})
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
  await page.goto('/board')
  await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
}

test('the control: with the seeded household, both auto cards are on the board', async ({ page }) => {
  // Without this, every assertion below could pass because the selector is wrong.
  await board(page)
  await expect(slot(page, 'tomorrow')).toBeVisible()
  await expect(slot(page, 'toFinish')).toBeVisible()
})

test('« Demain » collapses when tomorrow holds nothing at all — forecast included', async ({ page }) => {
  await board(page, { board: { ...BOARD, ...NO_TOMORROW }, weather: wxNoTomorrow() })
  await expect(slot(page, 'toFinish')).toBeVisible() // the rest of the board is intact
  await expect(slot(page, 'tomorrow')).toBeHidden()
  // Mounted, not unmounted — see the header note. If this ever becomes 0, the card
  // started returning null on its own and lost the ability to reappear.
  await expect(slot(page, 'tomorrow')).toHaveCount(1)
})

test('« Demain » STAYS when only its events are empty but a supper is planned', async ({ page }) => {
  // The half of the contract a naive `!events.length && return null` breaks: an
  // empty agenda with tacos planned is still something to say about tomorrow.
  await board(page, { board: { ...BOARD, tomorrow: [] }, weather: wxNoTomorrow() })
  await expect(slot(page, 'tomorrow')).toBeVisible()
})

test('« Demain » STAYS on a bare day when the forecast alone has something to say', async ({ page }) => {
  // The wide net, asserted on purpose so nobody "tidies" the weather out of
  // hasTomorrow: no events, no meals, no note — but rain tomorrow, so the card earns
  // its place. This is also why the fresh-household test below still shows it.
  await board(page, { board: { ...BOARD, ...NO_TOMORROW } })
  await expect(slot(page, 'tomorrow')).toBeVisible()
})

test('« À finir » collapses when there are no leftovers', async ({ page }) => {
  await board(page, { board: { ...BOARD, leftovers: [] } })
  await expect(slot(page, 'tomorrow')).toBeVisible() // again: the board still renders
  await expect(slot(page, 'toFinish')).toBeHidden()
})

test('a « toujours » card keeps its place on a completely empty day', async ({ page }) => {
  // `fresh` empties every fixture — a brand-new household. The auto cards collapse;
  // the always cards must NOT, or a new household lands on a blank board with no
  // door into anything.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, { fresh: true })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
  await page.goto('/board')
  await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })

  await expect(slot(page, 'today')).toBeVisible() // mode: 'always'
  await expect(slot(page, 'departure')).toBeVisible() // mode: 'always'
  await expect(slot(page, 'toFinish')).toBeHidden() // mode: 'auto', genuinely empty

  // The two 'auto' cards that legitimately SURVIVE an empty household, both because
  // their content is DERIVED rather than stored — worth pinning, since "tidying" the
  // derivation out would silently blank a new household's board:
  //   • « Demain » — `weather` is FRESH_EXEMPT (a new household still has a sky), so
  //     tomorrow's forecast alone earns the card (see the test above).
  //   • « À venir » — the fêtes QC/CA are derived client-side (lib/year), not rows.
  await expect(slot(page, 'tomorrow')).toBeVisible()
  await expect(slot(page, 'upcoming')).toBeVisible()
  // A row, not merely a header — deliberately NOT asserted by name: which fête is
  // next depends on today's date, and pinning "Fête du Travail" would quietly rot
  // into a failure a fortnight later.
  await expect(slot(page, 'upcoming').locator('.act__text .title').first()).toBeVisible()

  // …and an 'always' card that has nothing to say still draws a real card, not an
  // empty frame: the slot supplies the shared header + a calm empty line.
  await expect(slot(page, 'departure').locator('.bento, .wg-slot__placeholder').first()).toBeVisible()
})
