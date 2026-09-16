import { test, expect } from '@playwright/test'
import { mockApi } from './mocks'

// « Mot de passe oublié » (STATE.md §4-K wave 3): /login → /oubli → the email's link →
// /reinitialiser?t= → the board. The server is stubbed; what this pins is the SHAPE the
// stranger meets: one door on /login (hidden when the deployment has no mail), the same
// success sentence whatever the address, a calm 503 face, a spent link's one sentence
// with the way back, and a reset that lands on the board signed in.

test('/login offers the door only when the deployment can send mail', async ({ page }) => {
  await mockApi(page, { signedIn: false, overrides: { health: { ok: true, ai: false, photos: false, realtime: false, mail: true } } })
  await page.goto('/login')
  await expect(page.getByRole('link', { name: 'Mot de passe oublié ?' })).toBeVisible()
})

test('…and hides it when it cannot — a door that leads nowhere is worse than none', async ({ page }) => {
  await mockApi(page, { signedIn: false, overrides: { health: { ok: true, ai: false, photos: false, realtime: false, mail: false } } })
  await page.goto('/login')
  await expect(page.locator('form.auth__card')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Mot de passe oublié ?' })).toHaveCount(0)
})

test('/oubli answers the same sentence whatever the address — nothing to enumerate', async ({ page }) => {
  await mockApi(page, { signedIn: false })
  await page.goto('/oubli')
  await page.getByLabel('Courriel').fill('personne@exemple.ca')
  await page.getByRole('button', { name: 'Envoyer le lien' }).click()
  await expect(page.locator('[data-state="sent"]')).toBeVisible()
  await expect(page.locator('[data-state="sent"]')).toContainText('Si un compte existe')
  await expect(page.getByRole('link', { name: 'Retour à la connexion' })).toBeVisible()
})

test('/oubli on a deployment without mail says so, calmly, and keeps the form', async ({ page }) => {
  await mockApi(page, { signedIn: false })
  await page.route('**/api/auth/forgot', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'no mail' }) }),
  )
  await page.goto('/oubli')
  await page.getByLabel('Courriel').fill('personne@exemple.ca')
  await page.getByRole('button', { name: 'Envoyer le lien' }).click()
  await expect(page.locator('form.auth__card')).toContainText('pas encore branché')
})

test('/reinitialiser without a token explains and offers a new link', async ({ page }) => {
  await mockApi(page, { signedIn: false })
  await page.goto('/reinitialiser')
  await expect(page.locator('[data-state="no-token"]')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Demander un nouveau lien' })).toBeVisible()
})

test('a spent or expired link is ONE sentence and the way back', async ({ page }) => {
  await mockApi(page, { signedIn: false })
  await page.route('**/api/auth/reset', (route) =>
    route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Ce lien ne fonctionne plus.' }) }),
  )
  await page.goto('/reinitialiser?t=abc')
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('motdepasse1')
  await page.getByLabel('Confirme le mot de passe').fill('motdepasse1')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.locator('form.auth__card')).toContainText('ne fonctionne plus')
  await expect(page.getByRole('link', { name: 'Demander un nouveau lien' })).toBeVisible()
})

test('two different passwords never leave the page', async ({ page }) => {
  await mockApi(page, { signedIn: false })
  let posted = false
  await page.route('**/api/auth/reset', (route) => {
    posted = true
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  await page.goto('/reinitialiser?t=abc')
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('motdepasse1')
  await page.getByLabel('Confirme le mot de passe').fill('motdepasse2')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.locator('form.auth__card')).toContainText('pas pareils')
  expect(posted).toBe(false)
})

test('a good link sets the password and lands on the board, signed in', async ({ page }) => {
  // The stub signs the visitor in on the reset POST: auth/me flips to a session.
  let reset = false
  await mockApi(page, { signedIn: false })
  await page.route('**/api/auth/reset', (route) => {
    reset = true
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, email: 'famille@exemple.ca' }) })
  })
  await page.route('**/api/auth/me', (route) =>
    reset
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedIn: true, email: 'famille@exemple.ca', household: { id: 'h1', name: 'Maison Tremblay' } }) })
      : route.fallback(),
  )
  await page.goto('/reinitialiser?t=abc')
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('motdepasse1')
  await page.getByLabel('Confirme le mot de passe').fill('motdepasse1')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page).toHaveURL(/\/board/)
})
