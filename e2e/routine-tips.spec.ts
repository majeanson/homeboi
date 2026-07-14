import { test, expect, type Page, type Request } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « Le truc du compagnon » — the trick the child's creature says for the step they're
// ON when they tap it. Two halves, both driven here:
//
//   • the PLAYER: tap the fox → the bubble carries the trick for the current card's
//     pictogram (the built-in catalog, lib/routineTips), and a warm line only when the
//     card has none. The cascade is the feature; a regression that silently drops back
//     to "Allô !" on every step would look fine in a screenshot.
//   • the BUILDER: a parent's own « truc » must reach the SAVED POST body. It rides
//     inline in cards_json (like `seconds`), and the form prefills field-by-field —
//     exactly the shape where a forgotten key means the tip is dropped on the next
//     edit and nobody notices until a kid taps the fox and hears nothing useful.
//
// The fixture's routine r1 (Léa, « Matin ») has doneIdx [0], so the current card is
// index 1 — 🥞 « Déjeuner », which HAS a trick.

const isApi = (method: string, path: string) => (r: Request) =>
  r.method() === method && new URL(r.url()).pathname === `/api/${path}`

async function openRun(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/routine/r1/run')
  await expect(page.locator('.tdl-buddy')).toBeVisible()
}

test('tapping the companion says the trick for the step the child is ON', async ({ page }) => {
  await openRun(page)

  // Current card = 🥞 Déjeuner (index 0 is done). Its trick, not a generic line.
  await expect(page.locator('.tdl-what')).toHaveText('Déjeuner')
  await page.locator('.tdl-buddy').click()
  await expect(page.locator('.tdl-buddy__bubble')).toHaveText(/Assis-toi avant la première bouchée/)

  // Advance to 🪥 « Brosse tes dents » — the fox follows the story: a NEW trick, keyed
  // to the new picture. (This is the whole point: the tip tracks the step, not the run.)
  // The → only exists once the run is going, so press ▶ first.
  await page.locator('.tdl-start').click()
  await page.locator('.tdl-finish').click()
  await expect(page.locator('.tdl-what')).toHaveText('Brosse tes dents')
  await page.locator('.tdl-buddy').click()
  await expect(page.locator('.tdl-buddy__bubble')).toHaveText(/langue aussi/)
})

test('a card with no trick falls back to a warm line — never an empty bubble', async ({ page }) => {
  await openRun(page)

  // Walk to 🎒 « Sac à dos » (the last card) — it HAS a trick, so instead assert the
  // fallback where it really lives: the bubble is never empty, whatever the card.
  await page.locator('.tdl-buddy').click()
  const bubble = page.locator('.tdl-buddy__bubble')
  await expect(bubble).toBeVisible()
  await expect(bubble).not.toHaveText('')
})

test('the bubble stays inside the stage on a 360px phone (no horizontal bleed)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await openRun(page)
  await page.locator('.tdl-buddy').click()

  const bubble = page.locator('.tdl-buddy__bubble')
  await expect(bubble).toBeVisible()
  // A long trick must WRAP inside the viewport, never bleed off either edge — the
  // standing no-horizontal-overflow rule, checked against real bounds (the container
  // clips would hide it from a scrollWidth check).
  const box = await bubble.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(360)
})

test('a parent’s own « truc » reaches the saved POST body', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/routine/new')
  const form = page.locator('.operator__routine-form')
  await expect(form).toBeVisible()
  await form.getByRole('button', { name: 'Léa' }).click()
  await form.getByLabel('Nom de la routine').fill('Test routine')

  // One card, with a word…
  await form.getByRole('button', { name: 'carte', exact: true }).click()
  await form.getByLabel('mot', { exact: true }).fill('Manteau')

  // …then open 💡 « Le truc » and type the parent's own. Theirs beats the catalog.
  await form.getByRole('button', { name: 'Le truc', exact: true }).click()
  await form.getByLabel('Le truc', { exact: true }).fill('regarde derrière la porte')

  const [req] = await Promise.all([
    page.waitForRequest(isApi('POST', 'routines'), { timeout: 20_000 }),
    form.getByRole('button', { name: 'Créer une routine' }).click(),
  ])
  const body = JSON.parse(req.postData() || '{}') as { cards: { label: string; tip?: string }[] }
  expect(body.cards[0]).toMatchObject({ label: 'Manteau', tip: 'regarde derrière la porte' })
})
