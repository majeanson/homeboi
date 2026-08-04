import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Share a Google Maps place link → a pre-filled business card (Marc, Aug 2026:
// "j'ai partagé un lien pour ajouter un business, ça ne marche pas"). Two halves:
//   • /share (the PWA share-target) offers « Ajouter un business » when the shared
//     text carries a Maps link — before, the only path was the capture spine, which
//     has no business type (the link became a note with a naked URL).
//   • the button lands on /cercle with the BusinessForm open and the import ALREADY
//     run (?add=business&import=<url> → place-import → name + address filled).
// The server-side /sorry block recovery is unit-tested in placeImport.test.ts.

const MAPS_URL = 'https://maps.app.goo.gl/hCpMvxRRDUhwLCPi9?g_st=ic'
const PLACE = {
  name: 'Clinique Vétérinaire Animalia',
  address: '273 Bd Sir-Wilfrid-Laurier, Mont-Saint-Hilaire, QC J3H 0J1',
  category: 'Vétérinaire',
  photoKey: null,
  lat: null,
  lng: null,
  mapUrl: MAPS_URL,
  empty: false,
}

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr' })
  await page.route('**/api/place-import**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLACE) })
  })
})

test('sharing a Maps link offers « Ajouter un business » → the form opens pre-filled', async ({ page }) => {
  // The query-param fallback path (no service worker in the e2e harness).
  await page.goto(`/share?text=${encodeURIComponent(MAPS_URL)}`)
  const bizBtn = page.getByRole('button', { name: 'Ajouter un business' })
  await expect(bizBtn).toBeVisible()

  // The import runs on open — the POST carries the shared link.
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/api/place-import') && r.method() === 'POST'),
    bizBtn.click(),
  ])
  expect(JSON.parse(req.postData() || '{}').url).toBe(MAPS_URL)

  // The BusinessForm modal is open with name + address filled for review.
  const form = page.locator('.kit-modal .operator__inline-form')
  await expect(form).toBeVisible()
  await expect(form.getByRole('textbox', { name: 'Nom' })).toHaveValue(PLACE.name)
  await expect(form.getByRole('textbox', { name: 'Adresse' })).toHaveValue(PLACE.address)
  // The ?add/?import params were stripped (a reload must not re-open the modal).
  await expect
    .poll(async () => new URL(page.url()).search, { message: 'params stripped' })
    .not.toContain('add=')
})

test('a shared non-Maps text gets no business button — capture stays the one path', async ({ page }) => {
  await page.goto(`/share?text=${encodeURIComponent('acheter du lait demain')}`)
  await expect(page.getByRole('button', { name: 'Ajouter' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ajouter un business' })).toHaveCount(0)
})
