import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « Garder ma maisonnée » — the sandbox claim flow. A demo-sandbox session is an
// ORDINARY operator whose /api/auth/me email is `demo-<id>@babillard.invalid`
// (functions/api/demo.ts); the SPA detects that pattern (lib/demo.ts) and the
// board's SampleBanner wears its claim face → /garder → POST /api/demo/claim.
// These pin the whole client leg: banner shows for a sandbox (and only one),
// the form validates + fires the POST, and non-sandbox visitors bounce.

const PHONE = { width: 390, height: 844 }
const SANDBOX_ME = {
  signedIn: true,
  email: 'demo-h1@babillard.invalid',
  household: { id: 'h1', name: 'La maisonnée démo', tier: 'free' },
}

async function bootSandbox(page: Page, path = '/board') {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  await mockApi(page)
  // Registered after mockApi so it wins: the sandbox operator identity.
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SANDBOX_ME) }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto(path)
}

test('the claim banner shows for a sandbox session and leads to /garder', async ({ page }) => {
  await bootSandbox(page)
  // The claim offer opens INSIDE the welcome card (one card, not two banners about
  // the demo — see e2e/demo-sandbox.spec.ts); the strip takes it over once that card
  // is dismissed. This test owns the strip's own face + its route to /garder.
  await page.locator('.welcome-card__dismiss').click()

  const banner = page.locator('.sample-banner')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('C’est ta maisonnée d’essai')
  // The claim face replaces the ordinary sample face — never both strips.
  await expect(page.getByRole('button', { name: 'Vider et commencer' })).toHaveCount(0)

  await banner.getByRole('link', { name: 'Garder ma maisonnée' }).click()
  await page.waitForURL('**/garder')
  await expect(page.getByRole('heading', { name: 'Garder ma maisonnée' })).toBeVisible()
})

test('the claim form fires POST /api/demo/claim with the chosen credentials', async ({ page }) => {
  await bootSandbox(page, '/garder')
  await expect(page.getByRole('heading', { name: 'Garder ma maisonnée' })).toBeVisible()

  let claimBody: Record<string, unknown> | null = null
  await page.route('**/api/demo/claim', (route) => {
    claimBody = route.request().postDataJSON() as Record<string, unknown>
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, email: 'famille@exemple.ca' }),
    })
  })

  // The two new-password inputs share their autocomplete; label text embeds the
  // inline hint, so target by input attributes (the Signup field structure).
  await page.locator('input[type="email"]').fill('famille@exemple.ca')
  await page.locator('input[autocomplete="new-password"]').first().fill('motdepasse1')
  await page.locator('input[autocomplete="new-password"]').nth(1).fill('motdepasse1')
  await page.getByRole('button', { name: 'Garder ma maisonnée' }).click()

  await page.waitForURL('**/board')
  expect(claimBody).not.toBeNull()
  expect(claimBody).toMatchObject({ email: 'famille@exemple.ca', password: 'motdepasse1' })
})

test('mismatched passwords surface an error instead of posting', async ({ page }) => {
  await bootSandbox(page, '/garder')
  let posted = false
  await page.route('**/api/demo/claim', (route) => {
    posted = true
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  await page.locator('input[type="email"]').fill('famille@exemple.ca')
  await page.locator('input[autocomplete="new-password"]').first().fill('motdepasse1')
  await page.locator('input[autocomplete="new-password"]').nth(1).fill('motdepasse2')
  await page.getByRole('button', { name: 'Garder ma maisonnée' }).click()
  await expect(page.getByRole('alert')).toContainText('ne concordent pas')
  expect(posted).toBe(false)
})

test('the sandbox welcome card lists try-this deep links (never the setup checklist)', async ({ page }) => {
  await bootSandbox(page)
  const card = page.locator('.welcome-card')
  await expect(card).toBeVisible()
  await expect(card).toContainText('Essaie sans compte')
  // The first two land ON their target once the seeded rows load (stranger review
  // 2026-10-23): a recipe, and a routine's run scene — not the bare tab.
  await expect(card.getByRole('link', { name: 'Ouvre une recette, pars le mode cuisson' })).toHaveAttribute(
    'href',
    '/kitchen/recipe/rc1',
  )
  await expect(card.getByRole('link', { name: 'Fais une routine d’enfant, étape par étape' })).toHaveAttribute(
    'href',
    new RegExp('^/routine/[^/]+/run$'),
  )
  // Deep links ride the existing URL grammar (DISCOVERY.md): ?plus= / ?edit=1.
  await expect(card.getByRole('link', { name: 'Ajoute quelque chose à la liste' })).toHaveAttribute(
    'href',
    '/liste?plus=1',
  )
  await expect(card.getByRole('link', { name: 'Déplace une carte du babillard' })).toHaveAttribute(
    'href',
    '/board?edit=1',
  )
  // The real-household setup steps stay out of the sandbox face.
  await expect(card.getByRole('link', { name: 'Jumeler une tablette (optionnel)' })).toHaveCount(0)
})

test('a regular (non-sandbox) session sees no claim banner and /garder bounces home', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  await mockApi(page) // default AUTH_ME: famille@exemple.ca — a real account
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/garder')
  await page.waitForURL('**/board')
  await expect(page.locator('.sample-banner').getByRole('link', { name: 'Garder ma maisonnée' })).toHaveCount(0)
})

test('the trial phone board is a short curated glance, with « Tout voir » for the rest', async ({ page }) => {
  await bootSandbox(page)
  const cards = page.locator('.board-band > *, .board-grid > *')
  await expect(page.getByRole('button', { name: 'Tout voir' })).toBeVisible()
  const before = await cards.count()
  expect(before).toBeLessThanOrEqual(5)
  await page.getByRole('button', { name: 'Tout voir' }).click()
  await expect(page.getByRole('button', { name: 'Voir moins' })).toBeVisible()
  expect(await cards.count()).toBeGreaterThan(before)
})
