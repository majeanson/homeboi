import { test, expect, type Route } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « Partager » (wave 2) — the PUBLIC /partage/<id> page. A signed-OUT visitor sees the
// shared recipe + a « Rejoindre Babillard » CTA (the acquisition funnel); a signed-IN
// visitor sees the same render + « Ajouter à mon livre » (POST /api/recipes). An expired
// /dead link shows a calm "n'existe plus" + the join CTA. Reads hit only public endpoints
// (share-public), so an anonymous session never trips onAuthLost.

const RECIPE_SHARE = {
  kind: 'recipe',
  label: 'Spaghetti maison',
  sourceName: 'Maison Tremblay',
  expiresAt: null,
  payload: {
    title: 'Spaghetti maison',
    ingredients: ['400 g de pâtes', '1 pot de sauce tomate'],
    steps: ['Faire bouillir les pâtes.', 'Ajouter la sauce.'],
    servings: 4,
    servingsUnit: null,
    prepMin: 15,
    cookMin: 30,
    totalMin: null,
    notes: 'Parmesan au service.',
    source: null,
    image: null,
    stepImages: ['', ''],
    tags: ['rapide'],
    lang: 'fr',
  },
}

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
const notFound = { status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Ce partage n’existe plus.' }) }

test('signed-out: the shared recipe renders with a « Rejoindre Babillard » CTA', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, { signedIn: false })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.route('**/api/share-public**', (route: Route) => route.fulfill(json(RECIPE_SHARE)))

  await page.goto('/partage/shX')

  // The recipe render (title + an ingredient + a step) and the sender attribution.
  await expect(page.locator('.shared-recipe__title')).toHaveText('Spaghetti maison')
  await expect(page.getByText('400 g de pâtes')).toBeVisible()
  await expect(page.getByText('Faire bouillir les pâtes.')).toBeVisible()
  await expect(page.getByText('Maison Tremblay')).toBeVisible()

  // The join funnel — a primary link to /signup, and the "already have an account" door.
  const cta = page.getByRole('link', { name: 'Découvrir Babillard' })
  await expect(cta).toBeVisible()
  await expect(cta).toHaveAttribute('href', '/signup')
  await expect(page.getByRole('link', { name: 'J’ai déjà un compte' })).toBeVisible()
  // No import button for a signed-out visitor.
  await expect(page.getByRole('button', { name: 'Ajouter à mon livre' })).toHaveCount(0)
})

test('a dead/expired link shows a calm "n’existe plus" + the join CTA', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, { signedIn: false })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.route('**/api/share-public**', (route: Route) => route.fulfill(notFound))

  await page.goto('/partage/gone')
  await expect(page.getByText('Ce partage n’existe plus ou a expiré.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Découvrir Babillard' })).toBeVisible()
})

test('signed-in: « Ajouter à mon livre » copies the recipe (POST /api/recipes) then opens it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.routeWebSocket(/\/api\/live/, () => {})
  await mockApi(page) // signedIn defaults true
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.route('**/api/share-public**', (route: Route) => route.fulfill(json(RECIPE_SHARE)))
  // The import POSTs a new recipe; return a fresh id to navigate to.
  await page.route('**/api/recipes', (route: Route) =>
    route.fulfill(route.request().method() === 'POST' ? json({ id: 'newR' }) : json({ recipes: [] })),
  )

  await page.goto('/partage/shX')

  const [req] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/recipes', { timeout: 20_000 }),
    page.waitForURL(/\/kitchen\/recipe\/newR/),
    page.getByRole('button', { name: 'Ajouter à mon livre' }).click(),
  ])
  expect(req.postDataJSON()).toMatchObject({ title: 'Spaghetti maison', tags: ['rapide'] })
})
