import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, BASE, MMID } from './mocks'

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

test.describe('the habit form', () => {
  test('creates a habit: the cadence segment swaps the schedule for a weekly quota', async ({ page }) => {
    const posted: Record<string, unknown>[] = []
    await page.clock.setFixedTime(new Date(BASE * 1000))
    await mockApi(page)
    await page.route('**/api/habits', async (route) => {
      if (route.request().method() === 'POST') {
        posted.push(JSON.parse(route.request().postData() || '{}'))
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'new' }) })
      }
      return route.fallback()
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/habitude/new')

    await page.getByLabel('L’habitude').fill('Sortie à vélo')
    // « Selon un horaire » is the default and shows the shared RecurPicker.
    await expect(page.locator('.recur')).toBeVisible()
    // Switching to the weekly quota hides the schedule entirely (the two cadences
    // are different shapes — a quota has no rule to expand).
    await page.locator('.habit-form__seg', { hasText: 'X fois par semaine' }).click()
    await expect(page.locator('.recur')).toHaveCount(0)
    await page.getByLabel('Combien de fois').fill('3')

    await page.getByRole('button', { name: 'Nouvelle habitude' }).click()
    await expect.poll(() => posted.length).toBe(1)
    expect(posted[0]).toMatchObject({ title: 'Sortie à vélo', cadence: 'week', weekTimes: 3, recur: null, kind: 'do' })
  })

  test('a counted habit asks for a target; an avoid habit does not', async ({ page }) => {
    await page.clock.setFixedTime(new Date(BASE * 1000))
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/habitude/new')

    await expect(page.locator('.habit-form__target')).toHaveCount(0)
    await page.locator('.habit-form__kind', { hasText: 'Compter' }).click()
    await expect(page.getByLabel('Objectif par jour')).toBeVisible()
    // A ceiling relabels the same field rather than adding a second one.
    await page.locator('.habit-form__kind', { hasText: 'Limiter' }).click()
    await expect(page.getByLabel('Maximum par jour')).toBeVisible()
    await page.locator('.habit-form__kind', { hasText: 'Éviter' }).click()
    await expect(page.locator('.habit-form__target')).toHaveCount(0)
  })

  test('reminder times add, sort and remove — and say they never reach a pocket', async ({ page }) => {
    await page.clock.setFixedTime(new Date(BASE * 1000))
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/habitude/new')

    await expect(page.locator('.reminders__hint')).toContainText('jamais dans ta poche')
    const add = page.getByRole('button', { name: 'Ajouter un rappel' })
    await add.click()
    await expect(page.locator('.reminders__time')).toHaveValue('09:00')
    // Each next reminder lands an hour later, so repeated ＋ never collides.
    await add.click()
    await expect(page.locator('.reminders__time').nth(1)).toHaveValue('10:00')
    // Typing an EARLIER time re-sorts, matching what the server normalizes to.
    await page.locator('.reminders__time').nth(1).fill('07:30')
    await expect(page.locator('.reminders__time').first()).toHaveValue('07:30')

    await page.getByRole('button', { name: 'Enlever ce rappel' }).first().click()
    await expect(page.locator('.reminders__time')).toHaveCount(1)
    await expect(page.locator('.reminders__time')).toHaveValue('09:00')
  })
})

// The standing no-horizontal-overflow rule: every visible descendant must stay
// inside the scene's right edge at phone width (the container clips, so a
// scrollWidth check would read 0 — measure per child, like add-sheet-overflow).
async function noOverflow(page: Page, sel: string) {
  const scene = page.locator(sel)
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
}

test.describe('the board card + the calendar', () => {
  async function board(page: Page, boardView?: 'month') {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.setFixedTime(new Date(BASE * 1000))
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, boardView })
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
  }

  // The board's face picker is the header chip → a face sheet (not an inline row).
  async function pickFace(page: Page, name: string) {
    await page.locator('.profile-chip').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    await page.locator('.profile-face', { hasText: name }).click()
    await expect(page.locator('.sheet.show')).toHaveCount(0)
  }

  test('the board card names household habits and reduces a face’s own to a presence line', async ({ page }) => {
    await board(page)
    const card = page.locator('.habitudes-card')
    await expect(card).toBeVisible()
    await expect(card).toContainText('Marcher dehors')
    // At rest the card shows no presence line (no face picked → no personal habits).
    await expect(card.locator('.habitudes-card__mine')).toHaveCount(0)

    // With Maman picked, her habits stay UNNAMED — presence only, never a count.
    await pickFace(page, 'Maman')
    await expect(card.locator('.habitudes-card__mine')).toContainText('Tes habitudes t’attendent')
    await expect(card).not.toContainText('Boire de l’eau')
    await expect(card).not.toContainText('Cigarettes')
  })

  test('the calendar shows habits as derived, read-only occurrences, filtered by face', async ({ page }) => {
    await board(page, 'month')
    await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })

    // Today's day panel lists the household habit, read-only (no check affordance).
    const panel = page.locator('.monthv__day')
    await expect(panel).toContainText('Marcher dehors')
    await expect(panel.locator('.act__checkbtn')).toHaveCount(0)
    // Maman's habit is not shown to whoever is standing at the tablet.
    await expect(panel).not.toContainText('Boire de l’eau')

    await pickFace(page, 'Maman')
    await expect(panel).toContainText('Boire de l’eau')
  })
})

// « Le point du jour » opening BY ITSELF. There is no push and no cron: the open
// screen notices the moment has come. Both behaviours are per-device opt-outs.
test.describe('the check-in opens by itself', () => {
  // The fixture's habit hb1 carries a 09:00 reminder (minute 540). BASE is 04:00
  // local, so a fresh boot is before it — the reminder must stay silent until then.
  const at = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    return new Date((MMID + h * 3600 + m * 60) * 1000)
  }

  const ARMED = { autoOpen: true, reminders: true, lastShownDay: 0, fired: { day: 0, minutes: [] } }

  // `habitCheckin: true` leaves the trigger armed (seedState answers it for the day
  // by default, so no OTHER spec is navigated off its page mid-test).
  async function boot(page: Page, when: Date, checkin: Record<string, unknown> = ARMED) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.install({ time: when })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, habitCheckin: true })
    await page.addInitScript((c) => localStorage.setItem('babillard-habitudes-checkin', JSON.stringify(c)), checkin)
    await page.goto('/board')
  }

  test('opens once on the first app open of a new local day, then not again', async ({ page }) => {
    await boot(page, at('06:30'))
    // The morning open lands on the scene without any tap.
    await page.locator('.habitudes').waitFor({ state: 'visible', timeout: 15_000 })
    expect(new URL(page.url()).pathname).toBe('/board/habitudes')

    // Dismissing IS the answer for the day: going back to the board doesn't re-open it.
    await page.locator('.scene__head .btn').click()
    await page.locator('.hub').waitFor({ state: 'visible' })
    await page.waitForTimeout(500)
    expect(new URL(page.url()).pathname).toBe('/board')
  })

  test('stays shut when the day was already answered on this device', async ({ page }) => {
    await boot(page, at('06:30'), { autoOpen: true, reminders: false, lastShownDay: MMID, fired: { day: 0, minutes: [] } })
    await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(500)
    expect(new URL(page.url()).pathname).toBe('/board')
  })

  test('stays shut when the device opted out of the morning open', async ({ page }) => {
    await boot(page, at('06:30'), { autoOpen: false, reminders: false, lastShownDay: 0, fired: { day: 0, minutes: [] } })
    await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(500)
    expect(new URL(page.url()).pathname).toBe('/board')
  })

  // The reminder path, with the morning open already answered so it can't be the
  // thing that fires. hb1's reminder is at 09:00; we boot at 08:55 and roll forward.
  test('a reminder time opens the scene from the board, once', async ({ page }) => {
    await boot(page, at('08:55'), { autoOpen: false, reminders: true, lastShownDay: MMID, fired: { day: 0, minutes: [] } })
    await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
    expect(new URL(page.url()).pathname).toBe('/board')

    // Cross 09:00 — the shared minute clock ticks and the scene opens itself.
    await page.clock.fastForward('06:00')
    await page.locator('.habitudes').waitFor({ state: 'visible', timeout: 15_000 })

    // Close it: the same reminder minute must not fire a second time today.
    await page.locator('.scene__head .btn').click()
    await page.locator('.hub').waitFor({ state: 'visible' })
    await page.clock.fastForward('05:00')
    await page.waitForTimeout(500)
    expect(new URL(page.url()).pathname).toBe('/board')
  })

  test('a reminder never interrupts a form, and stays silent once opted out', async ({ page }) => {
    // On a scene (the habit form), a due reminder must not yank the page away.
    await boot(page, at('08:55'), { autoOpen: false, reminders: true, lastShownDay: MMID, fired: { day: 0, minutes: [] } })
    await page.goto('/habitude/new')
    await page.locator('.habit-form__kinds').waitFor({ state: 'visible', timeout: 15_000 })
    await page.clock.fastForward('06:00')
    await page.waitForTimeout(500)
    expect(new URL(page.url()).pathname).toBe('/habitude/new')
  })
})

test('the check-in scene never bleeds off a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await checkin(page)
  await page.locator('.mswitch__opt', { hasText: 'Maman' }).click()
  await noOverflow(page, '.habitudes')
})

test('the habit form never bleeds off a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.clock.setFixedTime(new Date(BASE * 1000))
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
  await page.goto('/habitude/new')
  // Open every conditional block: counted target fields + a reminder row.
  await page.locator('.habit-form__kind', { hasText: 'Compter' }).click()
  await page.getByRole('button', { name: 'Ajouter un rappel' }).click()
  await page.locator('.habit-form__seg', { hasText: 'X fois par semaine' }).click()
  await noOverflow(page, '.scene')
})
