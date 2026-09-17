import { test, expect, type Page, type Route } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « Restaurer une copie » — Réglages ▸ Système ▸ Appareils & accès (STATE.md §4-L L8).
// The nightly copies had been written to R2 for months with nothing able to read one
// back. Two doors now, both behind the password confirm, and the confirm names what is
// lost AND what is not.

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })
const URL_ = '/settings?tab=settings&focus=takeout&lens=regler'
const BACKUPS = { backups: [{ date: '2026-09-15', bytes: 41_000 }, { date: '2026-09-14', bytes: 40_100 }] }

async function boot(page: Page, opts: { signedIn?: boolean; paired?: boolean; backups?: unknown } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page, { signedIn: opts.signedIn ?? true })
  await page.route('**/api/takeout/backups', (route: Route) => route.fulfill(json(opts.backups ?? BACKUPS)))
  await seedState(page, { theme: 'day', lang: 'fr', surface: 'mobile' })
  if (opts.paired) await page.addInitScript(() => localStorage.setItem('babillard-device-token', 'e2e-device-token'))
  await page.goto(URL_)
  await page.locator('#op-takeout').waitFor({ state: 'visible', timeout: 15_000 })
  return page.locator('#op-takeout')
}

test('the nightly copies are listed, newest first, behind « Restaurer une copie »', async ({ page }) => {
  const card = await boot(page)
  // The export button is still the first thing — the restore folds under it.
  await expect(card.getByRole('link', { name: /Télécharger mes données/ })).toBeVisible()
  await card.getByText('Restaurer une copie').click()
  const rows = card.locator('.listrow')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('15')
  await expect(card.getByRole('button', { name: 'Depuis un fichier…' })).toBeVisible()
})

test('restoring a nightly copy confirms with the password, names what is lost, then POSTs', async ({ page }) => {
  const card = await boot(page)
  const posted: unknown[] = []
  await page.route('**/api/takeout/restore', (route: Route) => {
    posted.push(route.request().postDataJSON())
    return route.fulfill(json({ ok: true, rows: 412, remapped: false, skippedTables: [] }))
  })
  await card.getByText('Restaurer une copie').click()
  await card.locator('.listrow').first().getByRole('button', { name: 'Restaurer' }).click()

  const dialog = page.locator('.confirm')
  await expect(dialog).toContainText('Ce qui a été ajouté depuis disparaît')
  await expect(dialog).toContainText('les comptes restent')
  const go = dialog.getByRole('button', { name: 'Restaurer' })
  await expect(go).toBeDisabled() // nothing typed yet
  await dialog.locator('input[type=password]').fill('correct horse')
  await go.click()

  await expect.poll(() => posted.length).toBe(1)
  expect(posted[0]).toEqual({ source: 'backup', date: '2026-09-15', password: 'correct horse' })
  await expect(card.getByText(/412 lignes restaurées/)).toBeVisible()
})

test('cancelling the confirm posts nothing', async ({ page }) => {
  const card = await boot(page)
  const posted: unknown[] = []
  await page.route('**/api/takeout/restore', (route: Route) => {
    posted.push(1)
    return route.fulfill(json({ ok: true, rows: 1 }))
  })
  await card.getByText('Restaurer une copie').click()
  await card.locator('.listrow').first().getByRole('button', { name: 'Restaurer' }).click()
  await page.locator('.confirm').getByRole('button', { name: 'Annuler' }).click()
  await expect(page.locator('.confirm')).toHaveCount(0)
  expect(posted).toHaveLength(0)
})

test('a wrong password is one sentence, not a crash', async ({ page }) => {
  const card = await boot(page)
  await page.route('**/api/takeout/restore', (route: Route) =>
    route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Mot de passe invalide.' }) }),
  )
  await card.getByText('Restaurer une copie').click()
  await card.locator('.listrow').first().getByRole('button', { name: 'Restaurer' }).click()
  await page.locator('.confirm input[type=password]').fill('nope')
  await page.locator('.confirm').getByRole('button', { name: 'Restaurer' }).click()
  await expect(card.getByText('Mot de passe invalide.')).toBeVisible()
})

test('no nightly copy yet says so instead of showing an empty list', async ({ page }) => {
  const card = await boot(page, { backups: { backups: [] } })
  await card.getByText('Restaurer une copie').click()
  await expect(card.getByText(/Aucune copie de nuit/)).toBeVisible()
  await expect(card.locator('.listrow')).toHaveCount(0)
  // The file door is still there — a household's own export always restores.
  await expect(card.getByRole('button', { name: 'Depuis un fichier…' })).toBeVisible()
})

test('a paired kiosk sees no takeout card at all', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, { signedIn: false })
  await seedState(page, { theme: 'day', lang: 'fr', surface: 'mobile' })
  await page.addInitScript(() => localStorage.setItem('babillard-device-token', 'e2e-device-token'))
  await page.goto(URL_)
  await page.locator('.operator').waitFor({ state: 'visible', timeout: 15_000 })
  await expect(page.locator('#op-takeout')).toHaveCount(0)
})
