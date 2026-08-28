import { test, expect, type Page, type Request } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Behavioural coverage for the « Le cercle » create flows, now hosted on Maison
// (the nav restructure merged Le cercle + Routines into one /maison tab). The ＋
// FAB chooser deep-links to /maison?add=<mode> — the page reads the param and opens
// the matching modal (group / business / carnet), page-level so it works from any
// Maison subtab.
// Each test fills the form and asserts the CORRECT write fires (method + path), the
// same discipline interactions.spec.ts uses (every mock write returns { ok:true }, so
// we assert the request, not a refetched outcome). Closes the §424 gap: group /
// business / carnet CRUD had zero behavioural coverage (screenshots only).

const isApi = (method: string, path: string) => (r: Request) =>
  r.method() === method && new URL(r.url()).pathname === `/api/${path}`

// Arm the request waiter BEFORE the action so a fast POST can't slip through.
async function expectApi(page: Page, method: string, path: string, action: () => Promise<void>) {
  await Promise.all([page.waitForRequest(isApi(method, path), { timeout: 20_000 }), action()])
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
})

test('creating a named group posts to cercle-groups', async ({ page }) => {
  await page.goto('/maison?add=group')
  const dialog = page.locator('.kit-modal')
  await expect(dialog).toBeVisible()
  await dialog.getByPlaceholder('Nom du groupe').fill('Voisins')
  // The submit carries the create label (t.cercle.addGroup); Annuler sits beside it.
  await expectApi(page, 'POST', 'cercle-groups', () =>
    dialog.getByRole('button', { name: 'Nouveau groupe' }).click(),
  )
})

test('creating a business posts to businesses', async ({ page }) => {
  await page.goto('/maison?add=business')
  const dialog = page.locator('.kit-modal')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Nom', { exact: true }).fill('Garage Roy')
  await expectApi(page, 'POST', 'businesses', () =>
    dialog.getByRole('button', { name: 'Ajouter un business' }).click(),
  )
})

test('creating a carnet posts to carnets', async ({ page }) => {
  await page.goto('/maison?add=carnet')
  const dialog = page.locator('.kit-modal')
  await expect(dialog).toBeVisible()
  // defaultKind="home" → just a name is required to submit.
  await dialog.getByLabel('Nom', { exact: true }).fill('Notre maison')
  await expectApi(page, 'POST', 'carnets', () =>
    dialog.getByRole('button', { name: 'Ajouter un carnet' }).click(),
  )
})

// F23 Animaux (PARITY Wave E, entry 10) — /cercle/pet/new was layout-smoke-rendered
// only; unlike group/business/carnet above it had no create-and-POST spec. A pet needs
// just a name to submit (species/owner are optional).
test('creating a pet posts to pets', async ({ page }) => {
  await page.goto('/cercle/pet/new')
  await page.getByLabel('Nom', { exact: true }).fill('Rex')
  await expectApi(page, 'POST', 'pets', () =>
    page.getByRole('button', { name: 'Ajouter un animal' }).click(),
  )
})

// The weight log is one reading PER DATE. Re-entering a date you already logged
// REPLACES it — two rows for one day is never what someone means (they re-weighed, or
// mistyped the first number), and it quietly corrupts the trend the log exists to show.
// It is also the only edit door: a weight row is a date and a number, so re-entering it
// IS the edit; the row itself carries only a ✕. (REVIEW-PASS « frm ».)
test('a second weight on the same date corrects the first instead of duplicating it', async ({ page }) => {
  await page.goto('/cercle/pet/new')
  await page.getByLabel('Nom', { exact: true }).fill('Rex')

  // The weight log lives inside the « Détails / santé » disclosure.
  await page.getByRole('button', { name: 'Détails / santé' }).click()
  const weights = page.locator('.pet-form__weight-add')
  const date = weights.getByLabel('Date')
  const kg = weights.getByLabel('Poids (kg)')
  const add = weights.getByRole('button', { name: 'Ajouter' })
  const rows = page.locator('.pet-form__weight')

  await date.fill('2026-08-01')
  await kg.fill('12')
  await add.click()
  await expect(rows).toHaveCount(1)

  // Same day, corrected number.
  await date.fill('2026-08-01')
  await kg.fill('12.4')
  await add.click()
  await expect(rows, 'one reading per date').toHaveCount(1)
  await expect(rows.first()).toContainText('12.4')

  // A DIFFERENT day is a new reading, and the log stays sorted by date.
  await date.fill('2026-07-01')
  await kg.fill('11')
  await add.click()
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('2026-07-01')
})
