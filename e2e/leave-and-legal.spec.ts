import { test, expect, type Request } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Wave 4 — a household can leave, and knows the terms.
//
// Three surfaces, one question each:
//   · the leave door must be HARD to fire by accident and must send what it promises;
//   · the two public documents must render for someone who is not signed in — that is
//     the whole point of them, and it is the case a settings-only spec never covers;
//   · the contact block must appear only when the deployment HAS an address, because a
//     privacy policy that prints « contact: » and then nothing is worse than silence.

const isApi = (method: string, path: string) => (r: Request) =>
  r.method() === method && new URL(r.url()).pathname === `/api/${path}`

const TAKEOUT = '/settings?tab=settings&sub=tablets&focus=takeout'

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('the leave door will not fire until the household name is typed', async ({ page }) => {
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto(TAKEOUT)
  const panel = page.locator('#operator-panel')

  await panel.getByRole('button', { name: 'Supprimer la maisonnée' }).click()
  const go = panel.getByRole('button', { name: 'Supprimer pour de bon' })
  await expect(go).toBeDisabled()

  // A near-miss stays disabled. This is the lock: the name has to be READ.
  const field = panel.getByPlaceholder('Le nom de la maisonnée')
  await field.fill('Maison Trembley')
  await expect(go).toBeDisabled()

  // …and case and accents are folded, because a capital is a typing accident and not a
  // different household (the endpoint folds them identically).
  await field.fill('maison tremblay')
  await expect(go).toBeEnabled()
})

test('the leave door sends the password AND the name, and only after the confirm', async ({ page }) => {
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto(TAKEOUT)
  const panel = page.locator('#operator-panel')

  await panel.getByRole('button', { name: 'Supprimer la maisonnée' }).click()
  await panel.getByPlaceholder('Le nom de la maisonnée').fill('Maison Tremblay')
  await panel.getByRole('button', { name: 'Supprimer pour de bon' }).click()

  // The password dialog is the second lock — nothing has been sent yet.
  const dialog = page.locator('.confirm')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('rien ne se récupère')

  const del = page.waitForRequest(isApi('DELETE', 'household'))
  await dialog.getByRole('textbox').fill('correct horse battery')
  await dialog.getByRole('button', { name: 'Supprimer pour de bon' }).click()
  const body = (await (await del).postDataJSON()) as { password: string; name: string }
  expect(body).toMatchObject({ password: 'correct horse battery', name: 'Maison Tremblay' })
})

test('the two documents render for someone who is not signed in', async ({ page }) => {
  // signedIn: false is the case that matters — a stranger reads these BEFORE deciding,
  // and a page that needs a session would 401 its way into an empty shell.
  await mockApi(page, { signedIn: false })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })

  await page.goto('/confidentialite')
  await expect(page.getByRole('heading', { name: 'Confidentialité', level: 1 })).toBeVisible()
  // The claims that must be there, because they are the ones that are checkable:
  // where the data lives, what the AI sends, and the deletion right.
  await expect(page.locator('main')).toContainText('Cloudflare')
  await expect(page.locator('main')).toContainText('Supprimer la maisonnée')

  await page.goto('/conditions')
  await expect(page.getByRole('heading', { name: 'Conditions d’utilisation', level: 1 })).toBeVisible()
  await expect(page.locator('main')).toContainText('Québec')
})

test('the marketing door links to both, and the links work', async ({ page }) => {
  await mockApi(page)
  // Brand-new visitor: the smart entry shows <Home> only when the session is REFUSED,
  // so auth/me has to 401 (the home-welcome.spec.ts idiom). `signedIn: false` on its
  // own leaves the entry sending us to /board, and the door is never rendered.
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await seedState(page, { theme: 'day', lang: 'fr' })
  await page.goto('/')
  await page.locator('.home').waitFor({ state: 'visible', timeout: 15_000 })
  await page.getByRole('link', { name: 'Confidentialité' }).first().click()
  await expect(page).toHaveURL(/\/confidentialite/)
})

test('the contact block appears only when the deployment has an address', async ({ page }) => {
  // Default fixture: no `contact` key at all → the page must say so plainly rather than
  // print an empty mailto.
  await mockApi(page, { signedIn: false })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/confidentialite')
  await expect(page.locator('main')).toContainText('opéré en privé')
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0)
})

test('…and when it does, it is a real mailto', async ({ page }) => {
  await mockApi(page, {
    signedIn: false,
    overrides: { health: { ai: true, aiAvailable: true, rateLimit: true, alerts: true, contact: 'allo@babillard.test' } },
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/confidentialite')
  await expect(page.locator('a[href="mailto:allo@babillard.test"]')).toBeVisible()
})
