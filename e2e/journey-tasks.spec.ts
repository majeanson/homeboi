import { test, expect } from './fixtures'
import { boxOf } from './measure'
import { BOARD, boardTask, ROUTES, choreRowOf, somedayTask, mockApi, seedState } from './mocks'
import { addLocalDays, todayLocalDay } from '../src/lib/localDay'
import { type Page, test as test6 } from '@playwright/test'

// JOURNEY — TASKS (review #43; was tasks-view.spec.ts + task-card.spec.ts + task-effort.spec.ts + task-look.spec.ts + subject-tasks.spec.ts + todo-overdue.spec.ts + upkeep-overdue.spec.ts).
//
// « Tâches », the fifth board view (plans/2026-11-06-TACHE-UNIFIEE.md): the one home for
// browsing tasks. The lens lives in the URL, someday tasks live here, adding is one field,
// and Réglages sends its old links here instead of holding a second list.

test.describe('tasks-view', () => {
  const OPEN = { route: '/board?view=taches', wait: '.tasks-view' }

  test('the view lists what the bento does not: a someday task', async ({ page, app }) => {
    await app.boot(OPEN)
    await expect(page.locator('.tasks-view')).toContainText('Boîte à lunch des enfants')
    await expect(page.locator('.tasks-view')).toContainText('Un jour')
    await expect(page.locator('.tasks-view')).toContainText('Pas encore fait')
  })

  test('the lens is in the URL, and survives a reload', async ({ page, app }) => {
    await app.boot(OPEN)
    await page.getByRole('radio', { name: 'Sujet' }).click()
    await expect(page).toHaveURL(/par=sujet/)
    await expect(page.locator('.tasks-view')).toContainText('La maison')
    await expect(page.locator('.tasks-view')).toContainText('Sans sujet')
    await page.reload()
    await page.waitForSelector('.tasks-view')
    await expect(page.getByRole('radio', { name: 'Sujet' })).toBeChecked()
    await page.getByRole('radio', { name: 'Personne' }).click()
    await expect(page).toHaveURL(/par=qui/)
    await expect(page.locator('.tasks-view')).toContainText('Maisonnée')
  })

  test('a project subject links here, narrowed to it', async ({ page, app }) => {
    await app.boot({ route: '/board?view=taches&par=sujet&sujet=project:hp9', wait: '.tasks-view' })
    await expect(page.locator('.tasks-view')).toContainText('Réparer la clôture')
    await expect(page.locator('.tasks-view')).not.toContainText('Sortir les poubelles')
  })

  test('adding is one title field, and it files as someday', async ({ page, app }) => {
    await app.boot(OPEN)
    // The mocks are static: the refetch after the POST answers without the new row and takes it
    // back off the view, so the assertion raced it (CI red on e8525e62). Hold that refetch: the
    // optimistic row is what this case pins.
    await page.route('**/api/tasks', async (route) => {
      await new Promise((r) => setTimeout(r, 3000))
      await route.fallback()
    })
    const add = page.locator('.tasks-view').getByPlaceholder('Ajouter une tâche…')
    await add.fill('Trier les photos')
    const post = page.waitForRequest((r) => r.url().includes('/api/tasks') && r.method() === 'POST')
    await add.press('Enter')
    expect(((await post).postDataJSON() as { at: number | null }).at).toBeNull()
    await expect(page.locator('.tasks-view')).toContainText('Trier les photos')
  })

  test('the view fits a 390px phone', async ({ page, app }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await app.boot(OPEN)
    const view = await boxOf(page.locator('.tasks-view'))
    expect(view.x + view.width).toBeLessThanOrEqual(390)
    const rows = page.locator('.tasks-view .act')
    for (let i = 0; i < (await rows.count()); i++) {
      const b = await boxOf(rows.nth(i))
      expect(b.x + b.width).toBeLessThanOrEqual(390)
    }
  })

  test('the view toggle offers it, and a peek edits in its own scene', async ({ page, app }) => {
    await app.boot({ route: '/board', wait: '.board-grid .wg-slot' })
    await page.getByRole('radio', { name: 'Tâches' }).click()
    await expect(page).toHaveURL(/view=taches/)
    await page.locator('.tasks-view [data-item="c1"]').first().locator('.act__hit').click()
    await expect(page.locator('.detail-sheet').getByRole('link', { name: /Modifier/ }).or(page.locator('.detail-sheet'))).toBeVisible()
  })

  test('« Chacun son tour » is a checkbox on any recurring task, and posts the turn order', async ({ page, app }) => {
    // The door names the kind (?kind=upkeep), so this one is kept with the home rows.
    await app.boot({ route: '/home-project/new?kind=upkeep', wait: '.task-form' })
    const form = page.locator('.task-form')
    await form.getByRole('combobox').first().fill('Gouttières')
    await form.getByRole('button', { name: /^Qui/ }).click()
    // Not offered until the task recurs: a one-off has no turns to take.
    await expect(form.getByRole('checkbox', { name: 'Chacun son tour' })).toHaveCount(0)
    await form.getByRole('button', { name: /^Quand/ }).click()
    await form.locator('.recur select').selectOption('weekly')
    await form.getByRole('checkbox', { name: 'Chacun son tour' }).check()
    await form.getByRole('button', { name: 'Papa', exact: true }).click()
    await form.getByRole('button', { name: 'Maman', exact: true }).click()
    const post = page.waitForRequest((r) => r.url().includes('/api/tasks') && r.method() === 'POST')
    await form.locator('button[type="submit"]').click()
    expect(((await post).postDataJSON() as { rotation: string[] }).rotation).toHaveLength(2)
  })

  test('an old Réglages link lands on the view', async ({ page, app }) => {
    await app.boot({ route: '/settings?tab=maison&focus=chores', wait: '.tasks-view' })
    await expect(page).toHaveURL(/view=taches/)
    await app.boot({ route: '/settings?tab=chores', wait: '.tasks-view' })
    await expect(page).toHaveURL(/view=taches/)
  })
})

// ── folded from task-card.spec.ts ──────────────────────────────────────────────
test.describe('task-card', () => {
  // THE MERGED BOARD SECTION (plans/2026-11-06-TACHE-UNIFIEE.md). One card, one Act row, whichever
  // table a task lives in. What a stranger must be able to count on: a one-off ticks in place and
  // stays ticked, a recurring one moves on behind the undo toast, whose turn it is reads on
  // the row, a subject's icon leads, and a bulk clear is one gesture.

  const once = boardTask({ source: 'home', id: 'h-once', title: 'Changer le filtre', subject: { kind: 'carnet', id: 'car1' } })
  const weekly = boardTask({ source: 'task', id: 'c-week', title: 'Sortir le bac', recurring: true, who_id: 'm1', team: ['m1', 'm2'] })
  // The board's one `tasks` list carries the to-dos too (2026-11-08): the fixture's due one rides along.
  const todo = BOARD.tasks.find((t) => t.id === 'td1')!
  const OPEN = { route: '/board', wait: '.board-grid .wg-slot', api: { overrides: { board: { ...BOARD, tasks: [once, weekly, todo] } } } }

  const card = (page: import('@playwright/test').Page) => page.locator('.wg-slot[data-card="todos"]')

  test('one card holds every task, a home row too, and a someday task is not on it', async ({ page, app }) => {
    await app.boot(OPEN)
    const c = card(page)
    await c.scrollIntoViewIfNeeded()
    await expect(c.locator('[data-task="home"]')).toContainText('Changer le filtre')
    await expect(c.locator('[data-item="c-week"]')).toContainText('Sortir le bac')
    await expect(c.locator('[data-item="td1"]')).toContainText('Clés + téléphone')
    await expect(c).not.toContainText('Boîte à lunch')
  })

  test('a one-off ticks in place, stays, and a second tap unticks it', async ({ page, app }) => {
    await app.boot(OPEN)
    const row = card(page).locator('[data-task="home"]')
    await row.scrollIntoViewIfNeeded()
    // The mock is static, and the write refetches: serve what the server would say next.
    await page.route('**/api/board', (r) => r.fulfill({ json: { ...BOARD, tasks: [{ ...once, done: 'ticked', doneAt: BOARD.syncedAt }, weekly] } }))
    const patch = page.waitForRequest((r) => r.url().includes('/api/tasks') && r.method() === 'PATCH')
    await row.locator('.act__checkbtn').click()
    const body = (await patch).postDataJSON() as { id: string; doneAt: number }
    expect(body.id).toBe('h-once')
    // The tick carries its own moment, so an offline replay keeps its real day.
    expect(body.doneAt).toBeGreaterThan(0)
    await expect(row.locator('.act.done')).toBeVisible()
    await expect(page.locator('.undo-toast__btn')).toHaveCount(0)
    await expect(card(page).locator('.todo-clear button')).toBeVisible()

    const undo = page.waitForRequest((r) => r.url().includes('/api/tasks') && r.method() === 'PATCH')
    await row.locator('.act__checkbtn').click()
    expect(((await undo).postDataJSON() as { done: boolean }).done).toBe(false)
  })

  // Whose turn it is lives in the peek (the owner, 2026-11-11: the row is the title and its
  // tick); the title's tint still says who at a glance.
  test('a recurring task moves on behind the undo toast; whose turn it is reads in the peek', async ({ page, app }) => {
    await app.boot(OPEN)
    const row = card(page).locator('[data-item="c-week"]')
    await row.scrollIntoViewIfNeeded()
    await expect(row.locator('.who')).toHaveCount(0)
    await row.locator('.act__hit').click()
    await expect(page.locator('.sheet.detail-sheet.show .detail-sheet__who')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.sheet.detail-sheet.show')).toHaveCount(0)
    await row.locator('.act__checkbtn').click()
    await expect(row).toHaveCount(0)
    await page.locator('.undo-toast__btn').first().click()
    await expect(card(page).locator('[data-item="c-week"]')).toHaveCount(1)
  })

  test('a checked row clears with one gesture, and the count is nowhere', async ({ page, app }) => {
    await app.boot({ ...OPEN, api: { overrides: { board: { ...BOARD, tasks: [{ ...once, done: 'ticked' as const, doneAt: BOARD.syncedAt }, weekly] } } } })
    const c = card(page)
    await c.scrollIntoViewIfNeeded()
    const clear = c.locator('.todo-clear button')
    await expect(clear).not.toContainText(/[0-9]/)
    await clear.click()
    await expect(c.locator('[data-task="home"]')).toHaveCount(0)
    await expect(c.locator('[data-item="c-week"]')).toHaveCount(1)
  })

  test('the ＋ adds for today, and « Un jour » keeps it off the glance', async ({ page, app }) => {
    await app.boot(OPEN)
    const c = card(page)
    await c.scrollIntoViewIfNeeded()
    await c.locator('.sec-label__actbtn').click()
    await c.getByPlaceholder('Ajouter une tâche…').fill('Appeler la garderie')
    const post = page.waitForRequest((r) => r.url().includes('/api/tasks') && r.method() === 'POST')
    await c.getByRole('button', { name: 'Un jour' }).click()
    expect(((await post).postDataJSON() as { at: number | null }).at).toBeNull()
    await expect(c).not.toContainText('Appeler la garderie')
  })
})


// ── folded from task-effort.spec.ts ──────────────────────────────────────────────
test.describe('task-effort', () => {
  // L'EFFORT D'UNE TÂCHE et « TROUVER QUOI FAIRE » (plans/2026-11-06-TACHE-UNIFIEE.md, phase 3b):
  // five optional dots, folded in every task form; the same dots, small, on a row; and in the
  // Tâches view a finder that narrows by « this effort and below » and by horizon, in the URL,
  // with no count anywhere. A task whose effort was never said shows under every effort.

  const SHOTS = process.env.EFFORT_SHOTS
  const today = todayLocalDay()

  const quick = somedayTask({ source: 'task', id: 'e-quick', title: 'Appeler la garderie', effort: 1 })
  const big = somedayTask({ source: 'home', id: 'e-big', title: 'Refaire la clôture', kind: 'plan', effort: 5 })
  const unsaid = somedayTask({ source: 'task', id: 'e-unsaid', title: 'Trier les photos' })
  const soon = boardTask({ source: 'task', id: 'e-soon', title: 'Nettoyer les gouttières', effort: 3, icon: '🍂', who_id: 'm3', team: ['m1', 'm3'], day: addLocalDays(today, 3), dueToday: false, onBoard: false })
  const frame = {
    ...(ROUTES.tasks as object),
    tasks: [quick, big, unsaid, soon],
    subjects: { carnets: [], contacts: [], pets: [], projects: [], trips: [] },
  }
  const shown = (page: import('@playwright/test').Page, id: string) => page.locator(`.tasks-view [data-item="${id}"]`)

  test('the task form: effort is one tap away, a dot sends, the same dot clears', async ({ page, app }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await app.boot({ route: '/chore/new', wait: '.task-form' })
    const form = page.locator('.task-form')
    const fold = form.getByRole('button', { name: /^Effort/ })
    await expect(fold).toHaveAttribute('aria-expanded', 'false')
    await form.getByPlaceholder(/tâche/i).first().fill('Laver les fenêtres')
    await fold.click()
    const dots = form.getByRole('radiogroup', { name: 'Effort' }).getByRole('radio')
    await expect(dots).toHaveCount(5)
    await dots.nth(3).click()
    await expect(dots.nth(3)).toHaveAttribute('aria-checked', 'true')
    // Folded again, the fold says what it holds (LEAN invariant 1).
    await fold.click()
    await expect(fold).toContainText('Exigeant')
    await fold.click()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/effort-chore-390.png`, fullPage: true })
    // Five 44px dots never leave a 390px phone.
    for (let i = 0; i < 5; i++) {
      const b = await boxOf(dots.nth(i))
      expect(b.x + b.width).toBeLessThanOrEqual(390)
      expect(b.height).toBeGreaterThanOrEqual(40)
    }
    // Tap the same dot: cleared. Then pick again, and save.
    await dots.nth(3).click()
    await expect(dots.nth(3)).toHaveAttribute('aria-checked', 'false')
    await dots.nth(1).click()
    // A title and an effort: a to-do (effort never routes, lib/taskTarget).
    const post = page.waitForRequest((r) => r.url().includes('/api/tasks') && r.method() === 'POST')
    await form.locator('button[type="submit"]').last().click()
    expect((await post).postDataJSON()).toMatchObject({ title: 'Laver les fenêtres', effort: 2 })
  })

  // The owner, 2026-11-11: « too many infos in the pill ». A row is its look, its title and its
  // tick; the day, the effort and whose turn are in the peek. Every task ticks, any day.
  test('a row is its title and its tick; the peek says the day and the effort', async ({ page, app }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await app.boot({ route: '/board?view=taches', wait: '.tasks-view', api: { overrides: { tasks: frame } } })
    const row = shown(page, 'e-soon')
    await expect(row).toBeVisible()
    await expect(row.locator('.effort-mark, .when, .act__badge')).toHaveCount(0)
    // Three days out, and still tickable: done early is done.
    await expect(row.locator('.act__checkbtn')).toHaveCount(1)
    await row.locator('.act__hit').click()
    const sheet = page.locator('.sheet.detail-sheet.show')
    await expect(sheet.locator('.detail-sheet__when')).not.toBeEmpty()
    // The effort as its dots, the team as faces (no photo here, so each keeps its name).
    await expect(sheet.locator('.detail-sheet__facts').getByRole('img', { name: 'Effort : Moyen' })).toBeVisible()
    await expect(sheet.locator('.detail-sheet__face')).toHaveCount(2)
    await expect(sheet.locator('.detail-sheet__facename')).toHaveText(['Maman', 'Léa'])
    // The peek wears the row's own picture and tint (lookOf), not a generic chore glyph.
    await expect(sheet.locator('.detail-sheet__emoji')).toHaveText('🍂')
    const spine = await sheet.locator('.detail-sheet__spine').evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(spine).toBe('rgb(136, 163, 111)') // Léa's #88A36F: the row's tint is whose it is
    // A stale --vvh (iOS leaves one behind) no longer caps the peek to a sliver.
    await page.evaluate(() => document.documentElement.style.setProperty('--vvh', '120px'))
    expect((await boxOf(sheet)).height).toBeGreaterThan(160)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/peek-390.png` })
    await page.keyboard.press('Escape')
    await expect(page.locator('.sheet.detail-sheet.show')).toHaveCount(0)
    if (SHOTS) {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.screenshot({ path: `${SHOTS}/effort-rows-390.png` })
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'night'))
      await page.locator('.tasks-view__actions').getByRole('button', { name: /Trouver quoi faire/ }).click()
      await page.locator('.task-finder').getByRole('radio', { name: /Moyen/ }).click()
      await expect(page.locator('.task-finder').getByRole('radio', { name: /Moyen/ })).toHaveAttribute('aria-checked', 'true')
      await page.screenshot({ path: `${SHOTS}/effort-rows-desktop-dark.png` })
    }
  })

  test('« Trouver quoi faire »: this effort and below, the unsaid always, a horizon, in the URL, no count', async ({ page, app }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await app.boot({ route: '/board?view=taches', wait: '.tasks-view', api: { overrides: { tasks: frame } } })
    const open = page.locator('.tasks-view__actions').getByRole('button', { name: /Trouver quoi faire/ })
    await expect(open).toHaveAttribute('aria-expanded', 'false')
    // The panel is not in the page until its button opens it.
    await expect(page.locator('.task-finder')).toHaveCount(0)
    await open.click()
    const finder = page.locator('.task-finder')
    const dots = finder.getByRole('radiogroup', { name: 'Effort, au plus' }).getByRole('radio')
    await dots.nth(1).click()
    await expect(page).toHaveURL(/effort=2/)
    await expect(shown(page, 'e-quick')).toBeVisible()
    await expect(shown(page, 'e-unsaid'), 'a task with no effort is never hidden by the effort').toBeVisible()
    await expect(shown(page, 'e-big')).toHaveCount(0)
    await expect(shown(page, 'e-soon')).toHaveCount(0)
    // The horizon: « Cette semaine » holds the gutters only, and they are a 3 — so nothing at 2.
    const when = finder.getByRole('radiogroup', { name: 'D’ici' })
    await when.getByRole('radio', { name: 'Cette semaine' }).click()
    await expect(page).toHaveURL(/quand=semaine/)
    await expect(page.getByText('Rien de cette taille ici.', { exact: false })).toBeVisible()
    await dots.nth(2).click()
    await expect(shown(page, 'e-soon')).toBeVisible()
    await expect(shown(page, 'e-quick')).toHaveCount(0)
    // « Un jour »: the long run, where the undated live.
    await when.getByRole('radio', { name: 'Un jour' }).click()
    await expect(shown(page, 'e-quick')).toBeVisible()
    await expect(shown(page, 'e-unsaid')).toBeVisible()
    await expect(shown(page, 'e-soon')).toHaveCount(0)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/finder-390.png`, fullPage: true })
    // Calm: nothing in the finder or the view counts what is left.
    expect(await finder.innerText()).not.toMatch(/\d/)
    await expect(page.locator('.tasks-view')).not.toContainText(/\d+\s*(restante|tâche)/i)
    // Nothing in the open finder leaves a 390px phone.
    const kids = finder.locator('button')
    for (let i = 0; i < (await kids.count()); i++) {
      const b = await boxOf(kids.nth(i))
      expect(b.x + b.width).toBeLessThanOrEqual(390)
    }
    // Tap the chosen ones again: both cleared, the URL is clean, everything is back.
    await when.getByRole('radio', { name: 'Un jour' }).click()
    await dots.nth(2).click()
    await expect(page).not.toHaveURL(/effort=|quand=/)
    for (const id of ['e-quick', 'e-big', 'e-unsaid', 'e-soon']) await expect(shown(page, id)).toBeVisible()
  })

  test('a linked finder opens on its answer and says it while folded', async ({ page, app }) => {
    await app.boot({ route: '/board?view=taches&effort=1&quand=unjour', wait: '.tasks-view', api: { overrides: { tasks: frame } } })
    const open = page.locator('.tasks-view__actions').getByRole('button', { name: /Trouver quoi faire/ })
    await expect(open).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('.task-finder').getByRole('radio', { name: /Tout simple/ })).toHaveAttribute('aria-checked', 'true')
    await open.click()
    await expect(open).toContainText('jusqu’à tout simple')
    await expect(open).toContainText('Un jour')
    await expect(shown(page, 'e-quick')).toBeVisible()
    await expect(shown(page, 'e-big')).toHaveCount(0)
  })

  test('a to-do’s one form holds its effort, and saving patches it', async ({ page, app }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await app.boot({ route: '/todo/e-quick', wait: '.task-form', api: { overrides: { tasks: frame }, taskRows: [choreRowOf(quick)] } })
    const edit = page.locator('.scene .task-form')
    // It already has an effort, so its fold opens itself: editing never hides a pick.
    await expect(edit.getByRole('button', { name: /^Effort/ })).toHaveAttribute('aria-expanded', 'true')
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/effort-todo-edit-390.png`, fullPage: true })
    await edit.getByRole('radio', { name: /Tout simple/ }).click()
    const patch = page.waitForRequest((r) => r.url().includes('/api/tasks') && r.method() === 'PATCH')
    await edit.locator('button[type="submit"]').last().click()
    expect((await patch).postDataJSON()).toMatchObject({ id: 'e-quick', title: 'Appeler la garderie', effort: null })
  })

  // The view's one row of buttons (2026-11-10): the quick add, then the row, then the tasks.
  // « Qui a fait quoi » answers a question about people, so only the « Personne » lens has it;
  // « Une chose à moi » adds a subject, so only the « Sujet » lens has it.
  test('the tasks first, then the quick add and one row of buttons; the ledger only by person, a subject door only by subject', async ({ page, app }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await app.boot({ route: '/board?view=taches', wait: '.tasks-view', api: { overrides: { tasks: frame } } })
    const row = page.locator('.tasks-view__actions')
    const ledger = page.getByText('Qui a fait quoi cette semaine ?')
    const thing = row.getByRole('link', { name: /Une chose à moi/ })
    const lens = page.getByRole('radiogroup', { name: 'Regarder par' })
    // The tasks lead (the owner, 2026-11-10); the quick add and the row wait under the last one.
    // The fridge notes and the postbox door stay on the other views; this one is the list.
    await expect(page.getByRole('button', { name: /Boîte aux lettres/ })).toHaveCount(0)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/first-screen-390.png` })
    const field = await boxOf(page.locator('.tasks-view').getByRole('combobox').first())
    const r = await boxOf(row)
    const tasks = page.locator('.tasks-view [data-item]')
    const lastTask = await boxOf(tasks.nth((await tasks.count()) - 1))
    expect(field.y).toBeGreaterThan(lastTask.y)
    expect(r.y).toBeGreaterThan(field.y)
    // The ＋ sits inside the field: no « Ajouter » line between the field and the row.
    await expect(page.locator('.tasks-view__add').getByRole('button', { name: 'Ajouter', exact: true })).toBeVisible()
    expect(r.y - (field.y + field.height)).toBeLessThan(16)
    await expect(row.getByRole('link', { name: /Tâche détaillée/ })).toHaveAttribute('href', '/chore/new')
    await expect(row.getByRole('button', { name: /Trouver quoi faire/ })).toHaveAttribute('aria-expanded', 'false')
    // Nothing in the row leaves a 390px phone.
    const kids = row.locator('a, button')
    for (let i = 0; i < (await kids.count()); i++) {
      const b = await boxOf(kids.nth(i))
      expect(b.x + b.width).toBeLessThanOrEqual(390)
    }
    await expect(ledger).toHaveCount(0)
    await expect(thing).toHaveCount(0)
    await lens.getByRole('radio', { name: 'Personne' }).click()
    await expect(ledger).toBeVisible()
    await expect(thing).toHaveCount(0)
    await lens.getByRole('radio', { name: 'Sujet' }).click()
    await expect(ledger).toHaveCount(0)
    await expect(thing).toBeVisible()
    // One panel at a time: opening the seeds closes the finder.
    await row.getByRole('button', { name: /Trouver quoi faire/ }).click()
    await expect(page.locator('.task-finder')).toBeVisible()
    await row.getByRole('button', { name: 'Idées de saison' }).click()
    await expect(page.locator('.season-seeds')).toBeVisible()
    await expect(page.locator('.task-finder')).toHaveCount(0)
    if (SHOTS) {
      await page.screenshot({ path: `${SHOTS}/actions-390.png`, fullPage: true })
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'night'))
      await page.screenshot({ path: `${SHOTS}/actions-desktop-dark.png`, fullPage: true })
    }
  })

  // The owner, 2026-11-11: « maximise content and height on mobile ». The board's controls
  // (clock, short date, face, the five views as glyphs) take ONE line, and so do the three
  // lenses with their small ＋, which goes to the add field ready to type.
  test('one line for the board controls, one for the lenses and their ＋ to the add field', async ({ page, app }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await app.boot({ route: '/board?view=taches', wait: '.tasks-view', api: { overrides: { tasks: frame } } })
    const oneLine = async (sel: string) => {
      const kids = page.locator(`${sel} > *`)
      const ys = new Set<number>()
      for (let i = 0; i < (await kids.count()); i++) {
        const b = await boxOf(kids.nth(i))
        expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width)
        ys.add(Math.round(b.y + b.height / 2))
      }
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(6)
    }
    await oneLine('.board-controls')
    const date = page.locator('.board-controls__date')
    await expect(date).not.toContainText(/\b(lun|mar|mer|jeu|ven|sam|dim)\./)
    // The views are the priority (the owner, 2026-11-11): full 36px glyphs at every phone
    // width, and the date takes what is left — shown WHOLE or hidden whole, never « 11 n… ».
    // At the widest hour (two digits: a 9 h morning run passed while 10 h clipped).
    await page.locator('.board-controls__clock').evaluate((el) => (el.textContent = '22 h 58'))
    const shown: boolean[] = []
    // 480 is still the phone row (≤560px); at 390 beside « Qui ? » and a two-digit hour the
    // date does NOT fit (21px left of the 60 it needs) — hidden, which is the rule working.
    for (const width of [480, 390, 360, 320]) {
      await page.setViewportSize({ width, height: 844 })
      await oneLine('.board-controls')
      for (const w of await page.locator('.board-controls .segmented__opt').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width)))
        expect(w, `a view glyph at ${width}px`).toBeGreaterThanOrEqual(36)
      const fit = await date.evaluate((slot) => {
        const s = slot.getBoundingClientRect()
        const t = slot.firstElementChild!.getBoundingClientRect()
        const inside = t.left >= s.left - 0.5 && t.right <= s.right + 0.5 && t.top >= s.top - 0.5 && t.bottom <= s.bottom + 0.5
        const gone = t.top >= s.bottom - 0.5
        return inside ? 'whole' : gone ? 'hidden' : 'clipped'
      })
      expect(fit, `the date at ${width}px`).not.toBe('clipped')
      shown.push(fit === 'whole')
    }
    // The rule must have something to decide: shown where it fits, hidden where it cannot.
    expect(shown[0]).toBe(true)
    expect(shown[3]).toBe(false)
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('radiogroup', { name: 'Regarder par' }).getByRole('radio', { name: 'Sujet' })).toBeVisible()
    await expect(page.locator('.tasks-view__lens .segmented__label')).toHaveCount(0)
    await oneLine('.tasks-view__lens')
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/one-line-390.png` })
    await page.locator('.tasks-view__goadd').click()
    await expect(page.locator('.tasks-view__add').getByRole('combobox').first()).toBeFocused()
  })
})


// ── folded from task-look.spec.ts ──────────────────────────────────────────────
test.describe('task-look', () => {
  // L'ALLURE D'UNE TÂCHE (plans/2026-11-06-TACHE-UNIFIEE.md, phase 3): a task wears its own icon,
  // else its subject's, and the look is one tap away in every form, never an open control.

  const SHOTS = process.env.LOOK_SHOTS

  const own = boardTask({ source: 'task', id: 'l-own', title: 'Promener Rex', icon: '🐶', subject: { kind: 'carnet', id: 'car1' } })
  const inherits = boardTask({ source: 'home', id: 'l-inh', title: 'Vérifier le toit', kind: 'upkeep', subject: { kind: 'carnet', id: 'car1' } })
  const frame = {
    ...(ROUTES.tasks as object),
    tasks: [own, inherits],
    subjects: { carnets: [{ id: 'car1', name: 'La maison', kind: 'home', color: '#5891AC', facts: { emoji: '🏡' } }], contacts: [], pets: [], projects: [], trips: [] },
  }

  test('a row wears its own icon, else its subject’s', async ({ page, app }) => {
    await app.boot({ route: '/board?view=taches', wait: '.tasks-view', api: { overrides: { tasks: frame } } })
    await expect(page.locator('[data-item="l-own"] .act__emoji')).toHaveText('🐶')
    await expect(page.locator('[data-item="l-inh"] .act__emoji')).toHaveText('🏡')
  })

  test('the task form: the look is folded, suggests from the title, and sends a pick', async ({ page, app }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await app.boot({ route: '/chore/new', wait: '.task-form' })
    const form = page.locator('.task-form')
    const look = form.getByRole('button', { name: /Allure/ })
    await expect(look).toHaveAttribute('aria-expanded', 'false')
    await form.getByPlaceholder(/corvée|tâche/i).first().fill('Nettoyer les gouttières')
    await expect(look).toContainText('🍂')
    await look.click()
    // Nothing picked: the colour row leads with « Comme le sujet », selected.
    await expect(form.getByRole('button', { name: 'Par défaut' })).toHaveAttribute('aria-pressed', 'true')
    await form.getByRole('button', { name: 'Prendre 🍂' }).click()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/look-chore-390.png`, fullPage: true })
    // Nothing in the open look leaves a 390px phone.
    const picker = form.locator('.look-picker')
    const kids = picker.locator('button')
    for (let i = 0; i < (await kids.count()); i++) {
      const b = await boxOf(kids.nth(i))
      expect(b.x + b.width).toBeLessThanOrEqual(390)
    }
    // A title and a look, nothing else: a to-do (lib/taskTarget), wearing the pick.
    const post = page.waitForRequest((r) => r.url().includes('/api/tasks') && r.method() === 'POST')
    await form.locator('button[type="submit"]').last().click()
    const body = (await post).postDataJSON() as { icon: string | null; color: string | null }
    expect(body.icon).toBe('🍂')
    expect(body.color).toBeNull()
  })

  test('a to-do opens the one form, its look already open, and saving patches it', async ({ page, app }) => {
    await app.boot({ route: '/board?view=taches', wait: '.tasks-view', api: { overrides: { tasks: frame }, taskRows: [choreRowOf(own)] } })
    // A to-do's peek has the same « Modifier » as every task: the one form, at /todo/:id.
    await page.locator('[data-item="l-own"] .act__hit').click()
    const peek = page.locator('.detail-sheet')
    await peek.waitFor({ state: 'visible' })
    await peek.locator('.action-menu__btn').click()
    await page.getByRole('menuitem', { name: 'Modifier' }).click()
    await page.waitForURL(/\/todo\/l-own/)
    const edit = page.locator('.scene .task-form')
    // It already wears a pick of its own, so the fold opens itself: editing never hides a pick.
    await expect(edit.getByRole('button', { name: /Allure/ })).toHaveAttribute('aria-expanded', 'true')
    // …and its subject too: « Sur quoi ? » can change after creation (phase 2's leftover door).
    await expect(edit.getByRole('button', { name: /Sur quoi/ })).toHaveAttribute('aria-expanded', 'true')
    await edit.getByRole('button', { name: 'Comme le sujet' }).click()
    // A recurrence on a to-do: since the merge (0150) nothing is « not kept yet ». The row moves
    // up to the face that shows a recurrence, so the form has no line to say, and sends it.
    // (It is due today, so « Quand ? » holds a date and opened itself.)
    await expect(edit.getByRole('button', { name: /^Quand/ })).toHaveAttribute('aria-expanded', 'true')
    await edit.locator('.recur select').selectOption('weekly')
    await expect(edit.locator('.status-msg--info')).toHaveCount(0)
    const patch = page.waitForRequest((r) => r.url().includes('/api/tasks') && r.method() === 'PATCH')
    await edit.locator('button[type="submit"]').last().click()
    const body = (await patch).postDataJSON() as Record<string, unknown>
    expect(body).toMatchObject({ id: 'l-own', icon: '🐶', color: null, subject: { kind: 'carnet', id: 'car1' }, recur: { freq: 'weekly' } })
  })

  test('« Une chose à moi »: a thing carnet with its own name and look', async ({ page, app }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await app.boot({ route: '/maison?add=chose', wait: '.hub__body' })
    const dialog = page.getByRole('dialog', { name: 'Une chose à moi' })
    await expect(dialog.getByRole('button', { name: /Allure/ })).toHaveAttribute('aria-expanded', 'true')
    await dialog.getByLabel('Nom', { exact: true }).fill('Le jardin')
    await dialog.getByRole('button', { name: 'Prendre 🌱' }).click()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/thing-390.png`, fullPage: true })
    const post = page.waitForRequest((r) => r.url().includes('/api/carnets') && r.method() === 'POST')
    await dialog.locator('button[type="submit"]').click()
    expect((await post).postDataJSON()).toMatchObject({ kind: 'thing', name: 'Le jardin', facts: { emoji: '🌱' } })
  })

  test('« Sur quoi ? » makes a new thing in place, and saving it does not save the task', async ({ page, app }) => {
    await app.boot({ route: '/chore/new', wait: '.task-form' })
    const chores: string[] = []
    page.on('request', (r) => {
      if (/\/api\/(tasks|chores|todos|home-projects)$/.test(r.url()) && r.method() === 'POST') chores.push(r.url())
    })
    const form = page.locator('.task-form')
    await form.getByPlaceholder(/tâche/i).first().fill('Tondre')
    await form.getByRole('button', { name: /Sur quoi/ }).click()
    await form.locator('.task-form__subject select').selectOption({ label: 'Une chose à moi…' })
    const dialog = page.getByRole('dialog', { name: 'Une chose à moi' })
    await dialog.getByLabel('Nom', { exact: true }).fill('La pelouse')
    const post = page.waitForRequest((r) => r.url().includes('/api/carnets') && r.method() === 'POST')
    await dialog.locator('button[type="submit"]').click()
    await post
    await expect(dialog).toHaveCount(0)
    expect(chores).toEqual([])
  })

  test('a starter pack adds a season of one subject in one tap, and one « Annuler » takes it all back', async ({ page, app }) => {
    const posts: { title: string; icon: string }[] = []
    const deletes: string[] = []
    let n = 0
    // After boot: a later route wins, and the boot installs the mock API.
    await app.boot({ route: '/board?view=taches', wait: '.tasks-view' })
    await page.route('**/api/tasks', async (route) => {
      const m = route.request().method()
      if (m === 'POST') {
        posts.push(route.request().postDataJSON())
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: `pack-${++n}` }) })
      }
      if (m === 'DELETE') {
        deletes.push((route.request().postDataJSON() as { id: string }).id)
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      }
      return route.fallback()
    })
    await page.locator('.tasks-view__actions').getByRole('button', { name: 'Idées de saison' }).click()
    const pack = page.locator('.season-seeds__pack').filter({ hasText: 'La maison' }).first()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/packs.png`, fullPage: true })
    await expect(pack).not.toContainText(/[0-9]/)
    await pack.getByRole('button').click()
    await expect.poll(() => posts.length).toBeGreaterThan(1)
    // Each seed brings its own picture as the task's icon.
    expect(posts.every((x) => typeof x.icon === 'string' && x.icon.length > 0)).toBe(true)
    await page.getByRole('button', { name: 'Annuler' }).first().click()
    await expect.poll(() => deletes.length).toBe(posts.length)
  })
})


// ── folded from subject-tasks.spec.ts ──────────────────────────────────────────────
test.describe('subject-tasks', () => {
  // A SUBJECT'S TASKS: one component on a carnet, a person and a pet. What is on this thing now, a
  // one-field add that files itself here, and a history of names and dates. Never a number.

  const home = { id: 'k1', parentId: null, kind: 'home', name: 'Notre maison', mediaKey: null, color: '#88a36f', facts: null, installedAt: null, lifespanMonths: null, linkId: null, notes: null, sort: 0 }
  const carnets = { carnets: [home], soon: [] }
  const onCarnet = boardTask({ source: 'task', id: 'c-t', title: 'Vérifier le toit', subject: { kind: 'carnet', id: 'k1' } })
  const upkeep = boardTask({ source: 'home', id: 'c-u', title: 'Filtre', kind: 'upkeep', subject: { kind: 'carnet', id: 'k1' } })
  const frame = {
    ...(ROUTES.tasks as object),
    tasks: [onCarnet, upkeep],
    history: [{ key: 'home:hp-vax:1', title: 'Ramonage', at: 1_700_000_000, who_id: 'm1' }],
  }
  const OPEN = { route: '/cercle/carnet/k1', wait: '.subject-tasks', api: { overrides: { carnets, tasks: frame } } }

  test('a carnet lists its tasks once, and adds one that files itself here', async ({ page, app }) => {
    await app.boot(OPEN)
    const s = page.locator('.subject-tasks')
    await expect(s).toContainText('Vérifier le toit')
    // An upkeep row already reads in the Entretien section above, with its cadence.
    await expect(s).not.toContainText('Filtre')
    await s.locator('.sec-label__actbtn').click()
    await s.getByPlaceholder('Ajouter une tâche…').fill('Appeler le couvreur')
    const post = page.waitForRequest((r) => r.url().includes('/api/tasks') && r.method() === 'POST')
    await s.getByPlaceholder('Ajouter une tâche…').press('Enter')
    expect(((await post).postDataJSON() as { subject: unknown }).subject).toEqual({ kind: 'carnet', id: 'k1' })
  })

  test('a history is names and dates, and no count anywhere', async ({ page, app }) => {
    await app.boot(OPEN)
    const s = page.locator('.subject-tasks')
    await s.locator('.disclosure__summary').click()
    await expect(s.locator('.task-history li')).toContainText('Ramonage')
    await expect(s.locator('.disclosure__summary')).not.toContainText(/[0-9]/)
  })
})


// ── folded from todo-overdue.spec.ts ──────────────────────────────────────────────
test6.describe('todo-overdue', () => {
  // « En attente depuis… » — a loose to-do left on a day that has passed.
  //
  // It used to vanish. `GET /api/todos` selected `day IS NULL OR day = today`, and the
  // sweep only ever removed checklist INSTANCES, so a to-do someone pinned to Tuesday
  // still existed in the database on Wednesday and appeared NOWHERE: not on the board,
  // not in any glance, only on that one past day's page nobody navigates back to.
  // bmad/11 tier-1 seam #3 — lost intended work, silently.
  //
  // The fix deliberately rewrites nothing: the row keeps its own day. Since the merged card
  // (2026-11-06) it has no group of its own: it reads first, with the same muted line every
  // owed task wears. Calm: a quiet date, no count, no red.

  const DAY = 86_400
  const base = ROUTES.todos as { todos: Record<string, unknown>[] }
  const today = () => (base.todos[0]?.day as number | undefined) ?? 0

  // Since 2026-11-08 the board reads EVERY task from its own payload (one `tasks` list), a
  // loose to-do included; /api/todos keeps the departure checklists.
  async function board(page: Page, todos: unknown, tasks = BOARD.tasks) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page, { overrides: { todos, board: { ...BOARD, tasks } } })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
  }

  const card = (page: Page) => page.locator('.wg-slot[data-card="todos"]')

  test6('a loose to-do left on a past day leads the card, and its peek says since when', async ({ page }) => {
    const late = boardTask({
      source: 'task',
      id: 'td-late',
      title: 'Rapporter les livres à la bibliothèque',
      day: today() - 3 * DAY,
      dueToday: false,
      overdueSince: today() - 3 * DAY,
    })
    await board(page, base, [...BOARD.tasks, late])

    const row = card(page).locator('.act', { hasText: 'Rapporter les livres' })
    await expect(row).toBeVisible()
    // The row stays quiet (the owner, 2026-11-10): « En attente depuis » is a detail of the peek.
    await expect(row.locator('.when')).toHaveCount(0)

    // It leads the card: owed rows are painted above the day's.
    const today_ = card(page).locator('.act', { hasText: 'Clés + téléphone' })
    expect((await boxOf(row)).y).toBeLessThan((await boxOf(today_)).y)

    // Tap it: the peek says since when. Calm: a date and nothing more, no « 3 jours de retard ».
    await row.locator('.act__hit').click()
    const when = page.locator('.detail-sheet__when')
    await expect(when).toContainText('Prévu le')
    await expect(when).not.toContainText(/jours?/)
  })

  test6('a stale checklist instance is never presented as owed', async ({ page }) => {
    // A past-day « Avant de partir » instance is finished business: the server sweeps these,
    // and it is no task at all (_lib/taskItem), so the card cannot show it.
    await board(page, {
      ...base,
      todos: [
        ...base.todos,
        { id: 'td-stale', title: 'Vérifier les portes (mardi)', day: today() - DAY, member_id: null, done_at: null, position: 1, section: 'Avant de partir', source_template_id: 'tpl1' },
      ],
    })

    await expect(card(page)).toBeVisible()
    await expect(card(page).locator('.act', { hasText: 'Vérifier les portes (mardi)' })).toHaveCount(0)
  })

  test6('with nothing overdue no row wears the owed line', async ({ page }) => {
    await board(page, ROUTES.todos)
    await expect(card(page)).toBeVisible()
    await expect(card(page).locator('.act .when', { hasText: 'Prévu le' })).toHaveCount(0)
  })
})


// ── folded from upkeep-overdue.spec.ts ──────────────────────────────────────────────
test.describe('upkeep-overdue', () => {
  // « Entretiens saisonniers » — the overdue carry-forward. A missed upkeep due date
  // (TaskItem.overdueSince, functions/_lib/upkeep) rides the « À faire » card as a
  // checkable Act row wearing the calm « En attente depuis … » sub-line: no badge,
  // no count, and it must survive until checked. Checking defers the PATCH behind
  // the undo toast (Board.markHomeDone); a read-only guest gets no check at all
  // (Act drops onCheck via isGuest()).

  const DAY = 86400
  const OWED_SINCE = BOARD.syncedAt - 12 * DAY

  // The board's one `tasks` list (2026-11-08): the owed entretien as _lib/taskItem stamps it.
  const TASK = boardTask({ source: 'home', id: 'hov1', title: 'Nettoyer les gouttières', color: '#C98A5A', kind: 'upkeep', recurring: true, dueToday: false, overdueSince: OWED_SINCE, day: OWED_SINCE + 90 * 86400 })
  const OPEN = { route: '/board', wait: '.board-grid .wg-slot', api: { overrides: { board: { ...BOARD, tasks: [TASK] } } } }

  const row = (page: Page) =>
    page.locator('.wg-slot[data-card="todos"] .act').filter({ hasText: 'Nettoyer les gouttières' })

  test('an overdue entretien waits on « Tâches », and its peek says since when', async ({ page, app }) => {
    await app.boot(OPEN)
    const r = row(page)
    await r.scrollIntoViewIfNeeded()
    await expect(r).toBeVisible()
    // The row stays quiet; the peek carries the muted date, never a count or « X jours de retard ».
    await expect(r.locator('.when')).toHaveCount(0)
    await r.locator('.act__hit').click()
    await expect(page.locator('.detail-sheet__when')).toContainText('Prévu le')
  })

  test('checking it hides the row behind the undo toast, and undo brings it back', async ({ page, app }) => {
    await app.boot(OPEN)
    const r = row(page)
    await r.scrollIntoViewIfNeeded()
    // Split row: the body peeks, the check disc ticks.
    await r.locator('.act__checkbtn').click()
    await expect(r).toHaveCount(0)
    // The write is DEFERRED — nothing fired yet; the toast offers the way back.
    const undoBtn = page.locator('.undo-toast__btn').first()
    await expect(undoBtn).toBeVisible()
    await undoBtn.click()
    await expect(row(page)).toHaveCount(1)
  })

  test('« Reporter » lives behind the peek: postpone hides the row, undo brings it back', async ({ page, app }) => {
    await app.boot(OPEN)
    const r = row(page)
    await r.scrollIntoViewIfNeeded()
    // Split row: the body opens the detail peek (actions behind the detail door).
    await r.locator('.act__hit').click()
    const sheet = page.locator('.detail-sheet')
    await sheet.waitFor({ state: 'visible' })
    const actions = sheet.locator('.detail-sheet__actions')
    // Both postpone flavours show (the mock row recurs → « Au prochain cycle »).
    await expect(actions.getByText('Reporter d’une semaine', { exact: true })).toBeVisible()
    await expect(actions.getByText('Au prochain cycle', { exact: true })).toBeVisible()
    await actions.getByText('Reporter d’une semaine', { exact: true }).click()
    // Peek closes, row goes quiet at once; the PATCH waits behind the undo toast.
    await expect(sheet).toBeHidden()
    await expect(row(page)).toHaveCount(0)
    const undoBtn = page.locator('.undo-toast__btn').first()
    await expect(undoBtn).toBeVisible()
    await undoBtn.click()
    await expect(row(page)).toHaveCount(1)
  })

  test('a read-only guest sees the owed row but no check', async ({ page, app }) => {
    await app.boot({ api: OPEN.api })
    await page.addInitScript(() => localStorage.setItem('babillard-guest-token', '1'))
    await page.goto(OPEN.route)
    await page.waitForSelector(OPEN.wait)
    const r = row(page)
    await r.scrollIntoViewIfNeeded()
    await expect(r).toBeVisible()
    await expect(r.locator('.act__checkbtn')).toHaveCount(0)
    await expect(r.locator('.check')).toHaveCount(0)
  })
})
