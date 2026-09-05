import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, BASE } from './mocks'

// A DOOR LANDS ON ITS TARGET.
//
// Reported from the phone about « Note du jour » in the calendar's ⋯ menu: it opened
// the day scene and stopped. The note composer was right there, closed — so asking for
// the note cost a second tap to go find it. « Quand on fait une action, ça devrait
// popup non seulement l'écran, mais aussi focus sur la bonne chose. »
//
// The rule, and what this spec pins: a door that names a THING opens onto that thing
// ready to act, not merely onto the page that contains it. The URL grammar is already
// there and this only had to be USED — see DISCOVERY.md:
//
//   ?focus=<thing>  open this composer on the day scene (DayPlanPage; the same
//                   one-shot, consumed-on-arrival shape as Réglages' own ?focus=)
//   ?plus=<mode>    open the ＋ sheet on that tile (HubLayout)
//   ?add=1          open the notes editor (pages/Notes)
//
// A door that names a PAGE (« Planifier aujourd'hui » → the day's plan) is not in
// scope: the page IS the target there.

async function boot(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
}

const DAY = Math.floor(BASE / 86400) * 86400

test.describe('the day scene opens the composer you asked for', () => {
  test('?focus=note opens the day note, seeded and ready', async ({ page }) => {
    await boot(page)
    await page.goto(`/kitchen/day/${DAY}?focus=note`)
    await expect(page.locator('.day-plan__note .edit-field')).toBeVisible({ timeout: 8000 })
    // One-shot: consumed on arrival, so a refresh or a back-nav doesn't reopen it.
    await expect(page).not.toHaveURL(/focus=/)
  })

  test('?focus=meal opens the hero slot on the Repas face', async ({ page }) => {
    await boot(page)
    await page.goto(`/kitchen/day/${DAY}?vue=repas&focus=meal`)
    await expect(page.locator('.day-mng__sec .edit-field input.input').first()).toBeVisible({ timeout: 8000 })
    await expect(page).not.toHaveURL(/focus=/)
  })

  test('an unknown ?focus= is ignored, not a crash or a stuck param', async ({ page }) => {
    await boot(page)
    await page.goto(`/kitchen/day/${DAY}?focus=zzz`)
    await expect(page.locator('.scene').first()).toBeVisible({ timeout: 8000 })
    await expect(page).not.toHaveURL(/focus=/)
  })
})

test('« Note du jour » in the calendar ⋯ lands IN the note, not just on the page', async ({ page }) => {
  // The reported path, end to end.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  // The Mois view is a stored board view, not a query param.
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile', boardView: 'month' })
  await page.goto('/board')
  await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })
  await page.getByRole('button', { name: 'Actions de la journée' }).click()
  await page.getByRole('menuitem', { name: 'Note du jour' }).click()
  await expect(page.locator('.day-plan__note .edit-field')).toBeVisible({ timeout: 8000 })
})

// An EMPTY card says « rien pour l'instant » — which is an invitation to add one, so
// tapping it must open the add rather than dropping you on a page to hunt for it.
// (lib/boardCards `emptyTo`.)
const emptyDoors: [string, string, string][] = [
  ['les notes', '/notes?add=1', '.note-editor'],
  ['les routines', '/maison?plus=routine', '.sheet.show, .scene'],
  ['« À finir bientôt »', '/kitchen?plus=leftovers', '.sheet.show, .scene'],
  ['les mots du frigo', '/board?plus=note', '.sheet.show'],
]
for (const [what, url, sel] of emptyDoors) {
  test(`an empty ${what} card taps straight into its add (${url})`, async ({ page }) => {
    await boot(page)
    await page.goto(url)
    await expect(page.locator(sel).first()).toBeVisible({ timeout: 8000 })
  })
}
