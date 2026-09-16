import { test, expect, type Page, type Route } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « Mes connexions » — Réglages ▸ Système ▸ Appareils & accès (STATE.md §4-L L12).
// Two doors an account never had: change the password while signed in, and end every
// OTHER device's session (migration 0134). Both password-gated. Operator-only: a kiosk,
// a guest and a sandbox never see the card.

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })
const URL_ = '/settings?tab=settings&focus=sessions&lens=regler'

async function boot(page: Page, opts: { signedIn?: boolean; paired?: boolean; guest?: boolean } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page, { signedIn: opts.signedIn ?? true })
  await seedState(page, { theme: 'day', lang: 'fr', surface: 'mobile' })
  if (opts.paired) await page.addInitScript(() => localStorage.setItem('babillard-device-token', 'e2e-device-token'))
  if (opts.guest) {
    await page.route('**/api/guest/whoami**', (route: Route) => route.fulfill(json({ kind: 'showcase' })))
    await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
  }
}

test('the operator sees the card, with both doors', async ({ page }) => {
  await boot(page)
  await page.goto(URL_)
  const card = page.locator('#op-sessions')
  await expect(card).toBeVisible()
  await expect(card.getByRole('button', { name: 'Déconnecter partout ailleurs' })).toBeVisible()
  await expect(card.getByText('Changer mon mot de passe')).toBeVisible()
})

test('« Changer mon mot de passe » posts current + next, and refuses a mismatch without leaving the page', async ({ page }) => {
  await boot(page)
  const posted: unknown[] = []
  await page.route('**/api/auth/password', (route: Route) => {
    posted.push(route.request().postDataJSON())
    return route.fulfill(json({ ok: true }))
  })
  await page.goto(URL_)
  const card = page.locator('#op-sessions')
  await card.getByText('Changer mon mot de passe').click()
  await card.getByLabel('Mot de passe actuel').fill('old password 1')
  await card.getByLabel(/Nouveau mot de passe/).fill('new password 12')
  await card.getByLabel('Encore une fois').fill('different one 12')
  await card.getByRole('button', { name: 'Changer le mot de passe' }).click()
  await expect(card.getByText('Les deux nouveaux mots de passe ne sont pas pareils.')).toBeVisible()
  expect(posted).toHaveLength(0)

  await card.getByLabel('Encore une fois').fill('new password 12')
  await card.getByRole('button', { name: 'Changer le mot de passe' }).click()
  await expect.poll(() => posted.length).toBe(1)
  expect(posted[0]).toEqual({ current: 'old password 1', next: 'new password 12' })
  await expect(card.getByText(/Mot de passe changé/)).toBeVisible()
})

test('« Déconnecter partout ailleurs » asks for the password in the confirm, then posts it', async ({ page }) => {
  await boot(page)
  const posted: unknown[] = []
  await page.route('**/api/auth/sessions/revoke', (route: Route) => {
    posted.push(route.request().postDataJSON())
    return route.fulfill(json({ ok: true }))
  })
  await page.goto(URL_)
  await page.locator('#op-sessions').getByRole('button', { name: 'Déconnecter partout ailleurs' }).click()
  const dialog = page.locator('.confirm')
  await expect(dialog).toContainText('Celui-ci reste ouvert')
  // Nothing typed → the confirm button waits.
  const go = dialog.getByRole('button', { name: 'Déconnecter partout ailleurs' })
  await expect(go).toBeDisabled()
  await dialog.locator('input[type=password]').fill('correct horse')
  await go.click()
  await expect.poll(() => posted.length).toBe(1)
  expect(posted[0]).toEqual({ password: 'correct horse' })
  await expect(page.locator('#op-sessions').getByText(/les autres appareils sont déconnectés/)).toBeVisible()
})

test('a wrong password is one calm sentence, not a crash', async ({ page }) => {
  await boot(page)
  await page.route('**/api/auth/sessions/revoke', (route: Route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Mot de passe invalide.' }) }))
  await page.goto(URL_)
  await page.locator('#op-sessions').getByRole('button', { name: 'Déconnecter partout ailleurs' }).click()
  const dialog = page.locator('.confirm')
  await dialog.locator('input[type=password]').fill('nope')
  await dialog.getByRole('button', { name: 'Déconnecter partout ailleurs' }).click()
  await expect(page.locator('#op-sessions').getByText('Mot de passe invalide.')).toBeVisible()
})

test('a paired kiosk and a link guest never see the card', async ({ page }) => {
  await boot(page, { signedIn: false, paired: true })
  await page.goto(URL_)
  await page.locator('.operator').waitFor({ state: 'visible', timeout: 15_000 })
  await expect(page.locator('#op-sessions')).toHaveCount(0)

  await boot(page, { signedIn: false, guest: true })
  await page.goto(URL_)
  await page.locator('.operator').waitFor({ state: 'visible', timeout: 15_000 })
  await expect(page.locator('#op-sessions')).toHaveCount(0)
})
