import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, BASE, MMID } from './mocks'

const DAY = 86400

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

  // An intra-day rhythm (« aux 4 h ») asks for several moments, so a « Faire » habit
  // tallies instead of toggling: one tap must not settle a day that wanted four.
  test('an intra-day habit counts its moments — one tap does not settle the day', async ({ page }) => {
    await checkin(page)
    const move = row(page, 'Bouger un peu')
    await expect(move.locator('.habit-row__sub')).toHaveText('0 sur 4 fois')
    // No single « C'est fait » toggle — it borrows the counted ＋1/− pair.
    await expect(move.getByRole('button', { name: 'C’est fait' })).toHaveCount(0)

    const plus = move.getByRole('button', { name: 'Encore un' })
    for (let i = 0; i < 3; i++) await plus.click()
    await expect(move.locator('.habit-row__sub')).toHaveText('3 sur 4 fois')
    await expect(move).not.toHaveClass(/habit-row--done/)

    await plus.click()
    await expect(move.locator('.habit-row__sub')).toHaveText('4 sur 4 fois')
    await expect(move).toHaveClass(/habit-row--done/)
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

  // The two intra-day rhythms. « Aux X heures » previews the exact moments it makes,
  // and those moments ARE the reminders — so the hand-typed list steps aside.
  test('creates an intra-day habit: the hours rhythm previews its moments and owns the reminders', async ({ page }) => {
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
    await page.getByLabel('L’habitude').fill('Bouger un peu')

    // « X fois par jour » — the daily twin of the weekly quota, with no schedule.
    await page.locator('.habit-form__seg', { hasText: 'X fois par jour' }).click()
    await expect(page.locator('.recur')).toHaveCount(0)
    await page.getByLabel('Combien de fois').fill('3')

    // « Aux X heures » — the window makes the moments, and the reminder list is gone.
    await page.locator('.habit-form__seg', { hasText: 'Aux X heures' }).click()
    await expect(page.getByRole('button', { name: 'Ajouter un rappel' })).toHaveCount(0)
    await expect(page.locator('.habit-form__window')).toBeVisible()
    await expect(page.locator('.habit-form__moments')).toContainText('4 moments : 08:00 · 12:00 · 16:00 · 20:00')
    // Halve the spacing and the preview doubles the moments, live.
    await page.getByLabel('Toutes les').fill('6')
    await expect(page.locator('.habit-form__moments')).toContainText('3 moments : 08:00 · 14:00 · 20:00')

    await page.getByRole('button', { name: 'Nouvelle habitude' }).click()
    await expect.poll(() => posted.length).toBe(1)
    // Only the chosen rhythm's own shape is sent; the server NULLs the rest.
    expect(posted[0]).toMatchObject({
      title: 'Bouger un peu',
      cadence: 'hours',
      everyHours: 6,
      windowStart: 480,
      windowEnd: 1200,
      recur: null,
      weekTimes: null,
      dayTimes: null,
    })
  })

  // Three blocks of this form all speak about time. Each must say which question it
  // answers, and the schedule must visibly belong to the rhythm that opened it —
  // otherwise « À quel rythme ? », « Répéter » and « Rappels » read as rivals.
  test('rhythm, schedule and reminders each say what they are for', async ({ page }) => {
    await page.clock.setFixedTime(new Date(BASE * 1000))
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/habitude/new')

    const cadence = page.locator('.habit-form__cadence')
    await expect(cadence.locator('.habit-form__legend-sub')).toContainText('Quand l’habitude revient')
    // « Répéter » lives INSIDE the cadence block — it is the detail of « Selon un
    // horaire », not a separate setting competing with it.
    await expect(cadence.locator('.habit-form__cadence-body .recur')).toBeVisible()

    // The reminders block is OUTSIDE it, and says what a reminder is not.
    const reminders = page.locator('.reminders')
    await expect(cadence.locator('.reminders')).toHaveCount(0)
    await expect(reminders.locator('.reminders__sub')).toContainText('le rappel dit à quelle heure')

    // Each rhythm explains itself in one line as it is chosen.
    await page.locator('.habit-form__seg', { hasText: 'X fois par semaine' }).click()
    await expect(cadence.locator('.habit-form__hint')).toContainText('attend que la semaine soit remplie')
    await page.locator('.habit-form__seg', { hasText: 'X fois par jour' }).click()
    await expect(cadence.locator('.habit-form__hint')).toContainText('à l’intérieur de la journée')

    // An hours rhythm fills the reminders itself — the block keeps its heading and
    // says so, rather than vanishing and leaving the user wondering where it went.
    await page.locator('.habit-form__seg', { hasText: 'Aux X heures' }).click()
    await expect(reminders.locator('.reminders__label')).toBeVisible()
    await expect(reminders).toContainText('Les rappels suivent le rythme')
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

  test('the board card names the due habits with today’s reading, filtered by face', async ({ page }) => {
    await board(page)
    const card = page.locator('.habitudes-card')
    await expect(card).toBeVisible()
    await expect(card).toContainText('Marcher dehors')
    // At rest (« Maisonnée ») a member's own habits are not shown to whoever is
    // standing at the tablet — the face filter, not a blur.
    await expect(card).not.toContainText('Boire de l’eau')
    await expect(card).not.toContainText('Cigarettes')

    // Picking her face names her habits, each with the same quiet reading the
    // check-in row uses — the card answers, rather than only promising.
    await pickFace(page, 'Maman')
    const water = card.locator('.habitudes-card__row', { hasText: 'Boire de l’eau' })
    await expect(water.locator('.habitudes-card__sub')).toHaveText('0 sur 8 verres')
    await expect(card.locator('.habitudes-card__row', { hasText: 'Cigarettes' }).locator('.habitudes-card__sub')).toHaveText('0 de 5')
  })

  test('tapping a card row opens the habit peek — « Modifier » is the edit door', async ({ page }) => {
    // The accessible-edit ask (Marc, Aug 2026): a habit row on the board card opens
    // its own peek (today's reading + the week + the owner), whose « Modifier »
    // lands on the edit form — no more hunting the check-in scene's buried pencil.
    await board(page)
    const card = page.locator('.habitudes-card')
    await card.locator('.habitudes-card__row', { hasText: 'Marcher dehors' }).click()
    const sheet = page.locator('.detail-sheet')
    await expect(sheet).toBeVisible()
    await expect(sheet.locator('.detail-sheet__title')).toHaveText('Marcher dehors')
    await sheet.getByRole('button', { name: 'Modifier' }).click()
    // The edit form's title field ('exact' — the scene itself is labeled « Modifier l’habitude »).
    await expect(page.getByRole('textbox', { name: 'L’habitude', exact: true })).toBeVisible()
    expect(new URL(page.url()).pathname).toMatch(/^\/habitude\/.+\/edit$/)
  })

  test('the board ＋ « Mes habitudes » tile manages: new habit + edit-existing list', async ({ page }) => {
    // The routine-pick shape: « Nouvelle habitude » leads, and EVERY habit —
    // including one not due today — is one tap from its edit form.
    await board(page)
    await page.locator('.add-fab').click()
    await page.getByRole('dialog').getByRole('button', { name: 'Mes habitudes' }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByRole('button', { name: 'Nouvelle habitude' })).toBeVisible()
    await expect(sheet.locator('.sheet__group-label')).toHaveText('Gérer mes habitudes')
    await sheet.locator('.act', { hasText: 'Marcher dehors' }).click()
    expect(new URL(page.url()).pathname).toMatch(/^\/habitude\/.+\/edit$/)
  })

  test('today’s day panel offers real marking controls, filtered by face', async ({ page }) => {
    await board(page, 'month')
    await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })

    // Today's day panel names the household habit with a REAL per-kind row (not
    // just the derived read-only card the future/guest path still uses).
    const panel = page.locator('.monthv__day')
    const walk = panel.locator('.habit-row', { hasText: 'Marcher dehors' })
    await expect(walk).toBeVisible()
    await expect(walk.getByRole('button', { name: 'C’est fait' })).toBeVisible()
    // Maman's habit is not shown to whoever is standing at the tablet.
    await expect(panel.locator('.habit-row', { hasText: 'Boire de l’eau' })).toHaveCount(0)

    await pickFace(page, 'Maman')
    await expect(panel.locator('.habit-row', { hasText: 'Boire de l’eau' })).toBeVisible()
  })

  test('marking a habit from the calendar day panel updates its state', async ({ page }) => {
    await board(page, 'month')
    await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })

    const panel = page.locator('.monthv__day')
    const walk = panel.locator('.habit-row', { hasText: 'Marcher dehors' })
    await walk.getByRole('button', { name: 'C’est fait' }).click()
    await expect(walk).toHaveClass(/habit-row--done/)
    // Survives the refetch the write triggers (HABITS_KEY + MONTH_KEY invalidate) —
    // the mock's check-in read serves this session's marks back.
    await expect(walk.getByRole('button', { name: 'Fait aujourd’hui' })).toBeVisible()
  })

  test('a future day’s panel stays read-only — the derived occurrence, tapping into the scene', async ({ page }) => {
    await board(page, 'month')
    await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })

    // Tomorrow: the very next grid cell after « aujourd'hui ».
    await page.locator('.monthv__cell.is-today + .monthv__cell').click()
    const panel = page.locator('.monthv__day')
    await expect(panel).toContainText('Marcher dehors')
    // No interactive row, no check affordance — just the old derived nav card.
    await expect(panel.locator('.habit-row')).toHaveCount(0)
    await panel.locator('.act', { hasText: 'Marcher dehors' }).click()
    expect(new URL(page.url()).pathname).toBe('/board/habitudes')
  })
})

test.describe('backfill from the history dots — « j\'ai oublié hier »', () => {
  test('tapping a past dot never marks by itself; marking it there fills the dot in', async ({ page }) => {
    // Freeze to Monday 04:00 local (MMID+DAY) so « aujourd'hui » sits at index 1 of
    // the week strip (Sunday-start) and yesterday (MMID, a Sunday) is a real PAST
    // dot right before it — MMID itself (a Sunday) has no earlier dot in its own
    // week to backfill from.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.setFixedTime(new Date((MMID + DAY + 4 * 3600) * 1000))
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/board/habitudes')
    await page.locator('.habitudes').waitFor({ state: 'visible', timeout: 15_000 })

    const walk = row(page, 'Marcher dehors')
    await walk.locator('.habit-row__body').click()
    const history = page.locator('.habit-history')
    await expect(history).toBeVisible()

    const yesterday = history.locator('.habit-history__dot.is-today').locator('xpath=preceding-sibling::li[1]')
    await expect(yesterday).toBeVisible()
    await yesterday.locator('.habit-history__dotbtn').click()

    // A tap only SELECTS the day and reveals its controls — it never marks by itself.
    const markday = history.locator('.habit-history__markday')
    await expect(markday).toBeVisible()
    await expect(yesterday).not.toHaveClass(/is-done/)

    await markday.getByRole('button', { name: 'C’est fait' }).click()
    await expect(yesterday).toHaveClass(/is-done/)

    // Tapping the selected dot again collapses the controls.
    await yesterday.locator('.habit-history__dotbtn').click()
    await expect(markday).toHaveCount(0)
  })
})

test.describe('« En pause »', () => {
  test('a paused habit is invisible on the scene until « En pause » is opened, and « Reprendre » restores it', async ({ page }) => {
    await checkin(page)

    // Archived — invisible everywhere else on the scene (never in the asking or
    // « Déjà réglé » lists).
    await expect(row(page, 'Méditer')).toHaveCount(0)

    const fold = page.locator('.habitudes__paused')
    await expect(fold).toContainText('En pause')
    await fold.locator('.disclosure__summary').click()
    await expect(fold).toContainText('Méditer')

    await fold.getByRole('button', { name: 'Reprendre' }).click()

    // Un-paused: back among the ordinary habits, and the fold empties out.
    await expect(row(page, 'Méditer')).toBeVisible()
    await expect(page.locator('.habitudes__paused')).toHaveCount(0)
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
  // The four-segment cadence row and the hours window's two time fields both wrap
  // rather than bleed — they're the newest rows, and the likeliest to overflow.
  await page.locator('.habit-form__seg', { hasText: 'Aux X heures' }).click()
  await expect(page.locator('.habit-form__window')).toBeVisible()
  await noOverflow(page, '.scene')
})
