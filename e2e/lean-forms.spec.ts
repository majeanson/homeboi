import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// The "heavy form" pass: four surfaces where the chrome outweighed the content, all
// fixed the same way — what you MUST answer leads, what you rarely touch waits behind
// a Disclosure that opens itself the moment it holds a real answer.
//
// The one rule that makes the fold safe: **a fold never hides a filled field.** Every
// case below therefore has a twin — blank form → collapsed; existing record with data
// → already open. Without that, editing a contact would silently bury their phone
// number, which is worse than the wall of empty boxes we started from.

const phone = async (page: Page, path: string) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', calm: true })
  await page.goto(path)
}

// ── « Nouvelle personne » ───────────────────────────────────────────────────────
test('a new person leads with the name and the birthday; the rest waits', async ({ page }) => {
  await phone(page, '/cercle/person/new')
  await expect(page.getByText('Prénom')).toBeVisible()

  // The three that identify someone stay put…
  await expect(page.getByText('Prénom')).toBeVisible()
  await expect(page.getByText('Nom', { exact: true })).toBeVisible()
  await expect(page.getByText('Anniversaire')).toBeVisible()

  // …the six that mostly stay empty are not even in the DOM yet.
  for (const label of ['Surnom', 'Genre', 'Téléphone', 'Courriel', 'Adresse']) {
    await expect(page.getByText(label, { exact: true })).toHaveCount(0)
  }

  // The whole form now fits one phone screen: « Liens » (the last block) is reachable
  // without the two scrolls the ten stacked fields used to cost.
  const fold = page.getByRole('button', { name: 'Coordonnées et détails' })
  await expect(fold).toHaveAttribute('aria-expanded', 'false')
  await fold.click()
  for (const label of ['Surnom', 'Genre', 'Téléphone', 'Courriel', 'Adresse']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible()
  }
})

test('editing a person who HAS a phone opens the fold — it never hides what is filled', async ({ page }) => {
  // c1 = Rose « Mamie » Tremblay: a nickname AND a phone number in the fixture.
  await phone(page, '/cercle/person/c1')
  await expect(page.locator('.cf')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Coordonnées et détails' })).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('input[type="tel"]')).toHaveValue('450-555-0201')
})

// ── « Ajouter un rendez-vous » ──────────────────────────────────────────────────
test('the event form folds « Répéter » + « Afficher dès » away', async ({ page }) => {
  await phone(page, '/event/new')
  await expect(page.getByPlaceholder('Quoi ? (ex. dentiste)')).toBeVisible()

  await expect(page.locator('.recur')).toHaveCount(0)
  const fold = page.getByRole('button', { name: 'Répétition et rappel' })
  await expect(fold).toHaveAttribute('aria-expanded', 'false')
  await fold.click()
  await expect(page.locator('.recur')).toBeVisible()

  // Three optional sections, in one consistent shape.
  for (const label of ['Répétition et rappel', 'Prend l’auto', 'À apporter']) {
    await expect(page.getByRole('button', { name: label })).toBeVisible()
  }
})

test('a rendez-vous that already repeats opens the fold', async ({ page }) => {
  await phone(page, '/event/new?ride=1')
  // ?ride=1 pre-answers « Prend l'auto » — the same defaultOpen contract on the
  // sibling section, proving the pattern is the one the form already used.
  await expect(page.getByRole('button', { name: 'Prend l’auto' })).toHaveAttribute('aria-expanded', 'true')
})

// ── « Nouvelle recette » ────────────────────────────────────────────────────────
test('the recipe builder leads with the recipe’s NAME', async ({ page }) => {
  await phone(page, '/kitchen/recipe/new')
  const body = page.locator('.recipe-modal__body')
  await expect(body).toBeVisible()

  // The name is the first control in the body — it used to be the third, under the
  // photo button and a « Remplir vite » block three controls + an explainer tall.
  const firstField = body.locator('input, button, label').first()
  await expect(firstField).toHaveClass(/recipe-title-input/)

  // The fast-fill helpers (and their three-line explainer) wait behind their label.
  await expect(page.locator('.recipe-helpers')).toHaveCount(0)
  await expect(page.locator('.recipe-fill-hint')).toHaveCount(0)
  const fold = page.getByRole('button', { name: 'Remplir vite' })
  await expect(fold).toHaveAttribute('aria-expanded', 'false')
  await fold.click()
  await expect(page.locator('.recipe-helpers')).toBeVisible()
  await expect(page.locator('.recipe-fill-hint')).toBeVisible()
})

// ── Maison ▸ Famille ────────────────────────────────────────────────────────────
test('« Compléter les familles » sits under the directory, not over it', async ({ page }) => {
  await phone(page, '/maison?section=family')
  const complete = page.locator('.cercle-complete')
  await expect(complete).toBeVisible()

  // Below the last person, not between the face chip and the first one.
  const firstRow = page.locator('.cercle-row').first()
  const rowY = (await firstRow.boundingBox())!.y
  const btnY = (await complete.boundingBox())!.y
  expect(btnY, 'the housekeeping action comes after the people').toBeGreaterThan(rowY)

  // …and it is a chip, not a full-width bar (a flex column stretches its children).
  const w = (await complete.boundingBox())!.width
  expect(w).toBeLessThan(300)

  // Same for the face chip above — it wore the full width too.
  const chip = page.locator('.cercle-focus .profile-chip')
  const chipW = (await chip.boundingBox())!.width
  expect(chipW).toBeLessThan(300)
})

// ── The fold only exists when it has coordonnées to hold ────────────────────────
test('the intake’s per-person card keeps Surnom + Genre inline — no empty-labelled fold', async ({ page }) => {
  // IntakeForm's added-family cards pass showContact={false} showAddress={false}. A
  // « Coordonnées et détails » fold holding nothing but a nickname and three gender
  // chips would be a lying label, so ContactFields renders those two inline there.
  await phone(page, '/intake')
  await page.getByRole('button', { name: 'Ajouter une personne' }).first().click()

  // The self card (full field set) folds; the added person's card does not — so the
  // page carries exactly ONE fold, and the added card shows its two fields inline.
  await expect(page.getByRole('button', { name: 'Coordonnées et détails' })).toHaveCount(1)
  await expect(page.getByText('Surnom', { exact: true })).toBeVisible()
  await expect(page.getByText('Genre', { exact: true })).toBeVisible()
})
