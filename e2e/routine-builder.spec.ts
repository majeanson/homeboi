import { test, expect, type Page, type Request } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Behavioural coverage for the routine card-deck editor (CardDeckEditor inside
// RoutineForm, /routine/new). The step editor was screenshot-only; this drives the
// real add / remove / reorder card operations and — the crux — asserts the SAVED
// POST body carries the deck in exactly the edited order. CardDeckEditor keeps the
// cards array + its parallel clip/photo arrays in lockstep on every mutation; a
// drift there silently mis-attaches a clip/photo to the wrong card, which only a
// POST-alignment assertion catches. Closes the §303 gap.

const isApi = (method: string, path: string) => (r: Request) =>
  r.method() === method && new URL(r.url()).pathname === `/api/${path}`

async function openBuilder(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/routine/new')
  const form = page.locator('.operator__routine-form')
  await expect(form).toBeVisible()
  // Creating a routine requires a child (memberIds) + a name to enable submit.
  await form.getByRole('button', { name: 'Léa' }).click()
  await form.getByLabel('Nom de la routine').fill('Test routine')
  return form
}

// Add N blank cards and type a word into each (in order).
async function addCards(form: import('@playwright/test').Locator, words: string[]) {
  const addBtn = form.getByRole('button', { name: 'carte', exact: true })
  for (let i = 0; i < words.length; i++) {
    await addBtn.click()
    await expect(form.getByLabel('mot', { exact: true })).toHaveCount(i + 1)
  }
  const inputs = form.getByLabel('mot', { exact: true })
  for (let i = 0; i < words.length; i++) await inputs.nth(i).fill(words[i])
}

// Submit and return the parsed POST /routines body.
async function submitAndCapture(page: Page, form: import('@playwright/test').Locator) {
  const [req] = await Promise.all([
    page.waitForRequest(isApi('POST', 'routines'), { timeout: 20_000 }),
    form.getByRole('button', { name: 'Créer une routine' }).click(),
  ])
  return JSON.parse(req.postData() || '{}') as { cards: { label: string }[] }
}

test('removing the middle card keeps the deck aligned in the POST', async ({ page }) => {
  const form = await openBuilder(page)
  await addCards(form, ['Un', 'Deux', 'Trois'])

  // Remove the middle card ("Deux") via its ✕ (deleteLabel = "Retirer la carte").
  await form.getByRole('button', { name: 'Retirer la carte' }).nth(1).click()
  await expect(form.getByLabel('mot', { exact: true })).toHaveCount(2)

  const body = await submitAndCapture(page, form)
  expect(body.cards.map((c) => c.label)).toEqual(['Un', 'Trois'])
})

test('reordering a card up is reflected in the POST order', async ({ page }) => {
  const form = await openBuilder(page)
  await addCards(form, ['Alpha', 'Bravo'])

  // Move the SECOND card up (first card's ↑ is disabled) → order becomes Bravo, Alpha.
  await form.getByRole('button', { name: 'Monter' }).nth(1).click()

  const body = await submitAndCapture(page, form)
  expect(body.cards.map((c) => c.label)).toEqual(['Bravo', 'Alpha'])
})

test('the edit scene can delete a routine (confirm → DELETE → back to the tab)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })

  // Deep-link straight into edit mode for the mocked routine 'r1' (Matin).
  await page.goto('/routine/r1')
  const form = page.locator('.operator__routine-form')
  await expect(form).toBeVisible()

  // The delete affordance lives in the scene now (no trip to Réglages ▸ Corvées);
  // tapping it opens the weighty confirm dialog rather than deleting outright.
  await form.getByRole('button', { name: 'Supprimer la routine' }).click()
  await expect(page.locator('.confirm')).toBeVisible()

  // Confirming fires the DELETE and navigates back to Maison (Routines' hub tab
  // now — the scene's close() fallback, since a direct goto leaves no history to
  // pop back into).
  const [req] = await Promise.all([
    page.waitForRequest(isApi('DELETE', 'routines'), { timeout: 20_000 }),
    page.locator('.confirm .btn--danger').click(),
  ])
  expect(JSON.parse(req.postData() || '{}')).toMatchObject({ id: 'r1' })
  await expect(page).toHaveURL(/\/maison$/)
})
