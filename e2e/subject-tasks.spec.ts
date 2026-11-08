import { test, expect } from './fixtures'
import { ROUTES, boardTask } from './mocks'

// A SUBJECT'S TASKS: one component on a carnet, a person and a pet. What is on this thing now, a
// one-field add that files itself here, and a history of names and dates. Never a number.

const home = { id: 'k1', parentId: null, kind: 'home', name: 'Notre maison', mediaKey: null, color: '#88a36f', facts: null, installedAt: null, lifespanMonths: null, linkId: null, notes: null, sort: 0 }
const carnets = { carnets: [home], soon: [] }
const onCarnet = boardTask({ source: 'todo', id: 'c-t', title: 'Vérifier le toit', subject: { kind: 'carnet', id: 'k1' } })
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
