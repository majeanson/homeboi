import { test, expect, type Page, type Request } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « À apporter » on a rendez-vous — the half of the unified event form that the
// existing coverage stops just short of. screenshots.spec asserts the sections
// RENDER and that a typed item becomes a chip; what nobody exercised is the round
// trip that actually matters: pressing « Créer la liste » must POST a real
// todo_templates list AND select it, so the event saves carrying
// `bringTemplateId`. If the selection step breaks, everything still LOOKS right —
// the chips are there, the button is there — and the list silently doesn't ride
// along on the event. That's the shape of bug this file exists for.
//
// The second half: « Prend l'auto ». There is no separate « Trajet » noun (one
// engagement model — taking the car is a plain yes/no on the rendez-vous), so
// what's asserted is that the answer reaches the POST body as `carId`, since
// /api/car resolves the household's car from this very row.

const isApi = (method: string, path: string) => (r: Request) =>
  r.method() === method && new URL(r.url()).pathname === `/api/${path}`

const NEW_LIST_ID = 'tt-new'

async function newEvent(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 430, height: 1200 })
  await mockApi(page)
  // The shared harness answers every write with a bare `{ok:true}`. This one create
  // is different in kind: `createBringList` needs the new list's id SYNCHRONOUSLY to
  // attach it to the event (which is also why it's the one `api()` call in the form
  // rather than a queueable `useWrite`). Registered after mockApi so it wins.
  await page.route('**/api/todo-templates', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: NEW_LIST_ID }),
    })
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/event/new')
  await page.locator('form').first().waitFor({ timeout: 15_000 })
}

/** Fill the two fields the save button gates on (title + date). Addressed by
 *  accessible name, not `input[type=text]`: EditField's box carries no `type`
 *  ATTRIBUTE (the DOM property still reads "text", so a property probe lies). */
async function fillMinimum(page: Page, title: string) {
  await page.getByLabel(/^Quoi \?/).fill(title)
  const date = page.getByLabel('Date', { exact: true })
  if (!(await date.inputValue())) await date.fill('2026-09-15')
}

test('« Créer la liste » posts the typed items and SELECTS the new list on the event', async ({ page }) => {
  await newEvent(page)
  await page.getByText('À apporter', { exact: true }).click()

  const item = page.getByPlaceholder(/Ajoute un article/)
  await item.fill('souliers')
  await item.press('Enter')
  await item.fill('gourde')
  await item.press('Enter')
  await expect(page.getByRole('button', { name: /souliers/ })).toBeVisible()

  await fillMinimum(page, 'Soccer')

  // The list is created against todo-templates, titled from the event, carrying both
  // typed items in order.
  const [created] = await Promise.all([
    page.waitForRequest(isApi('POST', 'todo-templates')),
    page.getByRole('button', { name: /Créer la liste/ }).click(),
  ])
  expect(created.postDataJSON()).toMatchObject({ title: 'Soccer', items: ['souliers', 'gourde'] })

  // …and it is now SELECTED: the inline builder retires (picking a list IS the
  // list), and the new list shows as the active choice.
  await expect(page.getByPlaceholder(/Ajoute un article/)).toHaveCount(0)

  // The event then saves WITH it attached — the assertion the old coverage stopped
  // short of. The mock answers a create with {id:'new-id'}, so that's what rides.
  const [saved] = await Promise.all([
    page.waitForRequest(isApi('POST', 'events')),
    page.getByRole('button', { name: /Ajouter|Enregistrer/ }).click(),
  ])
  const body = saved.postDataJSON() as { title: string; bringTemplateId: string | null }
  expect(body.title).toBe('Soccer')
  expect(body.bringTemplateId).toBe(NEW_LIST_ID)
})

test('an event saved with the draft still typed creates the list first, then attaches it', async ({ page }) => {
  // The trap this closes: typing items and hitting Save WITHOUT pressing « Créer la
  // liste » used to drop the draft on the floor. Submit now creates it on the way out.
  await newEvent(page)
  await page.getByText('À apporter', { exact: true }).click()
  const item = page.getByPlaceholder(/Ajoute un article/)
  await item.fill('serviette')
  await item.press('Enter')
  await fillMinimum(page, 'Piscine')

  const created = page.waitForRequest(isApi('POST', 'todo-templates'))
  const saved = page.waitForRequest(isApi('POST', 'events'))
  await page.getByRole('button', { name: /Ajouter|Enregistrer/ }).click()

  expect((await created).postDataJSON()).toMatchObject({ items: ['serviette'] })
  expect((await saved).postDataJSON()).toMatchObject({ title: 'Piscine' })
  expect(((await saved).postDataJSON() as { bringTemplateId: string | null }).bringTemplateId).toBe(NEW_LIST_ID)
})

test('an item chip can be removed before the list is created', async ({ page }) => {
  await newEvent(page)
  await page.getByText('À apporter', { exact: true }).click()
  const item = page.getByPlaceholder(/Ajoute un article/)
  await item.fill('souliers')
  await item.press('Enter')
  await item.fill('gourde')
  await item.press('Enter')

  await page.getByRole('button', { name: 'souliers — Supprimer' }).click()
  await expect(page.getByRole('button', { name: /souliers/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /gourde/ })).toBeVisible()

  await fillMinimum(page, 'Soccer')
  const [created] = await Promise.all([
    page.waitForRequest(isApi('POST', 'todo-templates')),
    page.getByRole('button', { name: /Créer la liste/ }).click(),
  ])
  expect(created.postDataJSON()).toMatchObject({ items: ['gourde'] })
})

test('« Prend l’auto » is a plain yes/no on the rendez-vous — the car reaches the POST', async ({ page }) => {
  // One engagement model: there is no « Trajet » entity, so this must arrive as a
  // field on the event. /api/car resolves the household's car from this row, which
  // is why the save also has to invalidate the car cache.
  await newEvent(page)
  await page.getByText('Prend l’auto', { exact: true }).click()

  // The household's cars appear as togglable chips inside the disclosure. Located
  // structurally rather than by name: with a single car the chip IS the yes/no and
  // wears a generic label, so pinning a fixture name would be pinning the wrong thing.
  const carChip = page.locator('.event-transport .cluster button').first()
  await expect(carChip).toBeVisible()
  await expect(carChip).toHaveAttribute('aria-pressed', 'false') // opt-in, not default
  await carChip.click()
  await expect(carChip).toHaveAttribute('aria-pressed', 'true')

  await fillMinimum(page, 'Rendez-vous dentiste')
  const [saved] = await Promise.all([
    page.waitForRequest(isApi('POST', 'events')),
    page.getByRole('button', { name: /Ajouter|Enregistrer/ }).click(),
  ])
  expect((saved.postDataJSON() as { carId: string | null }).carId).toBeTruthy()
})
