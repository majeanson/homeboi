import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, BASE } from './mocks'

// « Mes habitudes » ▸ « Le point du jour » — the daily check-in scene. Locks the
// four kind-specific tap behaviours (do / count / limit / avoid), the private-ish
// face filter, and the calm tone (a limit gone over is noted, never scolded).
//
// The clock is frozen to the mock epoch so the fixture's `due_days` (local
// midnights around MMID) read as "today" — otherwise nothing is due and the scene
// is empty. Same frontend-only harness as the other specs: Vite + stubbed /api/**.

async function checkin(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(new Date(BASE * 1000))
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
  await page.goto('/board/habitudes')
  await page.locator('.habitudes').waitFor({ state: 'visible', timeout: 15_000 })
}

const row = (page: Page, title: string) => page.locator('.habit-row', { hasText: title })

test.describe('Le point du jour', () => {
  test('shows the household habits due today; a member’s stay private until their face is picked', async ({ page }) => {
    await checkin(page)
    // At rest (« Maisonnée ») only the household-wide habits show.
    await expect(row(page, 'Marcher dehors')).toBeVisible()
    await expect(row(page, 'Pas de chocolat')).toBeVisible()
    // Maman's habits are hers — never shown to whoever is standing at the tablet.
    await expect(row(page, 'Boire de l’eau')).toHaveCount(0)
    await expect(row(page, 'Cigarettes')).toHaveCount(0)

    // Picking her face reveals them (plus the household ones).
    await page.locator('.mswitch__opt', { hasText: 'Maman' }).click()
    await expect(row(page, 'Boire de l’eau')).toBeVisible()
    await expect(row(page, 'Marcher dehors')).toBeVisible()
  })

  test('a "do" habit settles in place on one tap — the row never moves under the finger', async ({ page }) => {
    await checkin(page)
    const walk = row(page, 'Marcher dehors')
    await walk.getByRole('button', { name: 'C’est fait' }).click()
    // It settles where it stands (quietly dimmed) rather than jumping into a fold.
    await expect(walk).toHaveClass(/habit-row--done/)
    await expect(walk).toBeVisible()
    // Re-tapping takes it back — the day is never locked.
    await walk.getByRole('button', { name: 'Fait aujourd’hui' }).click()
    await expect(walk).not.toHaveClass(/habit-row--done/)
  })

  test('a "count" habit tallies toward its target and only settles when reached', async ({ page }) => {
    await checkin(page)
    await page.locator('.mswitch__opt', { hasText: 'Maman' }).click()
    const water = row(page, 'Boire de l’eau')
    const plus = water.getByRole('button', { name: 'Encore un' })
    await expect(water.locator('.habit-row__sub')).toHaveText('0 sur 8 verres')

    // Tallying is a REPEATED tap, so ＋1 must not move between taps (the corrector
    // is always rendered, merely disabled at zero — it never inserts itself before
    // the primary button and slides it out from under the finger).
    const before = await plus.boundingBox()
    await plus.click()
    await expect(water.locator('.habit-row__sub')).toHaveText('1 sur 8 verres')
    expect(await plus.boundingBox()).toEqual(before)

    // Still asking — a partial day is not settled.
    await expect(water).not.toHaveClass(/habit-row--settled/)
    await water.getByRole('button', { name: 'En enlever un' }).click()
    await expect(water.locator('.habit-row__sub')).toHaveText('0 sur 8 verres')
  })

  test('a "limit" habit can be confirmed as none, and going over is noted — never scolded', async ({ page }) => {
    await checkin(page)
    await page.locator('.mswitch__opt', { hasText: 'Maman' }).click()
    const smoke = row(page, 'Cigarettes')
    // A ceiling habit is asking even at zero — otherwise "none today" is
    // indistinguishable from "never opened the app".
    await expect(smoke.locator('.habit-row__sub')).toHaveText('0 de 5')
    await expect(smoke.getByRole('button', { name: 'Aucune aujourd’hui' })).toBeVisible()

    // Six taps takes it past the ceiling: the copy goes quiet, not red.
    for (let i = 0; i < 6; i++) await smoke.getByRole('button', { name: 'Encore un' }).click()
    await expect(smoke.locator('.habit-row__sub')).toHaveText('C’est noté.')
    await expect(smoke).toHaveClass(/habit-row--over/)
    // Over the ceiling still SETTLES the day (it's recorded), and never reads done.
    await expect(smoke).not.toHaveClass(/habit-row--done/)
  })

  test('an "avoid" habit offers « Tenu » and « Petit écart », neither styled as failure', async ({ page }) => {
    await checkin(page)
    const choc = row(page, 'Pas de chocolat')
    await choc.getByRole('button', { name: 'Petit écart' }).click()
    // The confirmation stays readable in place — the row doesn't vanish on a slip.
    await expect(choc.locator('.habit-row__sub')).toHaveText('Un petit écart — ça arrive.')
    await expect(choc).not.toHaveClass(/habit-row--done/)

    // Saying it was held afterwards is always allowed — the day is never locked.
    await choc.getByRole('button', { name: 'Tenu' }).click()
    await expect(choc).toHaveClass(/habit-row--done/)
  })

  test('a week-quota habit says how many times are left, and its history opens', async ({ page }) => {
    await checkin(page)
    const bike = row(page, 'Sortie à vélo')
    await expect(bike.locator('.habit-row__sub')).toHaveText('Encore 2 fois cette semaine')
    await bike.getByRole('button', { name: 'C’est fait' }).click()
    // One of the two is in: the quota line counts down rather than congratulating.
    await expect(bike.locator('.habit-row__sub')).toHaveText('Encore une fois cette semaine')

    // Opening the row shows its own week — seven dots, one filled, no rank anywhere.
    await bike.locator('.habit-row__body').click()
    await expect(page.locator('.habit-history__dot')).toHaveCount(7)
    await expect(page.locator('.habit-history__dot.is-done')).toHaveCount(1)
    await expect(page.locator('.habit-history__line')).toContainText('1 jour cette semaine')
  })
})

// The standing no-horizontal-overflow rule: every visible descendant must stay
// inside the scene's right edge at phone width (the container clips, so a
// scrollWidth check would read 0 — measure per child, like add-sheet-overflow).
test('the check-in scene never bleeds off a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await checkin(page)
  await page.locator('.mswitch__opt', { hasText: 'Maman' }).click()

  const scene = page.locator('.habitudes')
  const right = await scene.evaluate((el) => el.getBoundingClientRect().right)
  const overflowing = await scene.evaluate((el, edge) => {
    const bad: string[] = []
    for (const child of el.querySelectorAll('*')) {
      const r = child.getBoundingClientRect()
      if (r.width > 0 && r.right > edge + 1) bad.push(child.className?.toString() ?? child.tagName)
    }
    return bad
  }, right)
  expect(overflowing).toEqual([])
})
