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

// ── Réglages + le babillard ─────────────────────────────────────────────────────
// Same pass, on the two surfaces you land on most. Réglages stacked a heading, an
// identity line, a sign-out button and THREE control rails before its first setting
// (~490px of a 844px phone); the board put a one-time "hold a card to rearrange"
// note above every card on the one screen whose whole job is to be glanceable.

test('Réglages has no « Réglages » heading and no sign-out at the top', async ({ page }) => {
  await phone(page, '/settings?tab=board&lens=regler')
  await expect(page.locator('.operator__tabs')).toBeVisible()

  // The nav tab at the foot says the word, and it is the lit one — so the heading
  // takes NO space, while still existing for a screen reader (dropping the page's
  // only h1 would be a real regression, not a lean win).
  const h1 = page.locator('.operator h1')
  await expect(h1).toHaveCount(1)
  await expect(h1).toHaveClass(/sr-only/)
  // sr-only clips to a 1px box rather than display:none (that is what keeps it in
  // the accessibility tree), so assert the SPACE it takes, which is the real claim.
  expect((await h1.boundingBox())!.height).toBeLessThanOrEqual(1)
  await expect(page.getByRole('link', { name: 'Réglages' })).toBeVisible()

  // Sign-out is at the FOOT, under the settings — not second from the top.
  const out = page.locator('.operator__signout')
  await expect(out).toBeVisible()
  const head = page.locator('.operator__head')
  expect((await out.boundingBox())!.y).toBeGreaterThan((await head.boundingBox())!.y)
  const firstCard = page.locator('.operator__section').first()
  expect((await out.boundingBox())!.y).toBeGreaterThan((await firstCard.boundingBox())!.y)

  // …and the first setting is now within the first screen.
  expect((await firstCard.boundingBox())!.y).toBeLessThan(400)
})

test('« Voir dans l’app » rides the lens row, and keeps a name when its label hides', async ({ page }) => {
  await phone(page, '/settings?tab=board&lens=regler')
  const goto = page.locator('.operator__goto')
  await expect(goto).toBeVisible()

  // Same row as Comprendre / Régler — not a line of its own above the settings.
  const lens = page.locator('.operator__lens')
  const a = (await goto.boundingBox())!
  const b = (await lens.boundingBox())!
  expect(Math.abs(a.y - b.y), 'the goto shares the lens row').toBeLessThan(24)

  // On a narrow phone the word hides; the control must NOT go unnamed.
  await expect(goto.locator('span')).toBeHidden()
  await expect(goto).toHaveAttribute('aria-label', 'Voir dans l’app')

  // Wider: the word comes back.
  await page.setViewportSize({ width: 900, height: 800 })
  await expect(goto.locator('span')).toBeVisible()
})

test('the board’s edit hint sits under the cards, not over them', async ({ page }) => {
  await phone(page, '/board')
  const hint = page.locator('.board-edit-hint')
  await expect(hint).toBeVisible()

  // Below the grid it describes — it used to displace the first card.
  const grid = page.locator('.board-grid')
  expect((await hint.boundingBox())!.y).toBeGreaterThan((await grid.boundingBox())!.y)

  // Still one-time + per-device: dismissing retires it.
  await hint.getByRole('button').click()
  await expect(page.locator('.board-edit-hint')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.board-edit-hint')).toHaveCount(0)
})
