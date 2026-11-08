import { test, expect } from './fixtures'
import { boxOf } from './measure'
import { ROUTES, boardTask } from './mocks'

// L'ALLURE D'UNE TÂCHE (plans/2026-11-06-TACHE-UNIFIEE.md, phase 3): a task wears its own icon,
// else its subject's, and the look is one tap away in every form, never an open control.

const SHOTS = process.env.LOOK_SHOTS

const own = boardTask({ source: 'todo', id: 'l-own', title: 'Promener Rex', icon: '🐶', subject: { kind: 'carnet', id: 'car1' } })
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

test('the chore form: the look is folded, suggests from the title, and sends a pick', async ({ page, app }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await app.boot({ route: '/chore/new', wait: '.operator__chore-form' })
  const form = page.locator('.operator__chore-form')
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
  const post = page.waitForRequest((r) => r.url().includes('/api/chores') && r.method() === 'POST')
  await form.locator('button[type="submit"]').last().click()
  const body = (await post).postDataJSON() as { icon: string | null; color: string | null }
  expect(body.icon).toBe('🍂')
  expect(body.color).toBeNull()
})

test('a to-do’s edit door holds its look, and a pick patches it', async ({ page, app }) => {
  await app.boot({ route: '/board?view=taches', wait: '.tasks-view', api: { overrides: { tasks: frame } } })
  await page.locator('[data-item="l-own"] .act').click()
  const edit = page.locator('.task-edit')
  // It already wears a pick of its own, so the fold opens itself: editing never hides a pick.
  await expect(edit.getByRole('button', { name: /Allure/ })).toHaveAttribute('aria-expanded', 'true')
  const patch = page.waitForRequest((r) => r.url().includes('/api/todos') && r.method() === 'PATCH')
  await edit.getByRole('button', { name: 'Comme le sujet' }).click()
  expect((await patch).postDataJSON()).toMatchObject({ id: 'l-own', icon: '🐶', color: null })
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
  await app.boot({ route: '/chore/new', wait: '.operator__chore-form' })
  const chores: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/api/chores') && r.method() === 'POST') chores.push(r.url())
  })
  await page.locator('.operator__chore-form').getByPlaceholder(/tâche/i).first().fill('Tondre')
  await page.locator('.operator__chore-form select').first().selectOption({ label: 'Une chose à moi…' })
  const dialog = page.getByRole('dialog', { name: 'Une chose à moi' })
  await dialog.getByLabel('Nom', { exact: true }).fill('La pelouse')
  const post = page.waitForRequest((r) => r.url().includes('/api/carnets') && r.method() === 'POST')
  await dialog.locator('button[type="submit"]').click()
  await post
  await expect(dialog).toHaveCount(0)
  expect(chores).toEqual([])
})
