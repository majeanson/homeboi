import { test, expect } from './fixtures'
import { boxOf } from './measure'
import { ROUTES, boardTask, choreRowOf, somedayTask } from './mocks'
import { addLocalDays, todayLocalDay } from '../src/lib/localDay'

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
  await app.boot({ route: '/todo/e-quick', wait: '.task-form', api: { overrides: { tasks: frame, chores: { chores: [choreRowOf(quick)] } } } })
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
