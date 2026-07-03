import { test, expect, type Page, type Request } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Behavioural coverage for the « Le cercle » create flows. The ＋ FAB chooser
// deep-links to /cercle?add=<mode> — the page reads the param and opens the matching
// modal (group / business / carnet), page-level so it works from any cercle subtab.
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
  await page.goto('/cercle?add=group')
  const dialog = page.locator('.kit-modal')
  await expect(dialog).toBeVisible()
  await dialog.getByPlaceholder('Nom du groupe').fill('Voisins')
  // The submit carries the create label (t.cercle.addGroup); Annuler sits beside it.
  await expectApi(page, 'POST', 'cercle-groups', () =>
    dialog.getByRole('button', { name: 'Nouveau groupe' }).click(),
  )
})

test('creating a business posts to businesses', async ({ page }) => {
  await page.goto('/cercle?add=business')
  const dialog = page.locator('.kit-modal')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Nom', { exact: true }).fill('Garage Roy')
  await expectApi(page, 'POST', 'businesses', () =>
    dialog.getByRole('button', { name: 'Ajouter un business' }).click(),
  )
})

test('creating a carnet posts to carnets', async ({ page }) => {
  await page.goto('/cercle?add=carnet')
  const dialog = page.locator('.kit-modal')
  await expect(dialog).toBeVisible()
  // defaultKind="home" → just a name is required to submit.
  await dialog.getByLabel('Nom', { exact: true }).fill('Notre maison')
  await expectApi(page, 'POST', 'carnets', () =>
    dialog.getByRole('button', { name: 'Ajouter un carnet' }).click(),
  )
})
