import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { BASE } from './mocks'

// BUTTONS ON THE THINGS (C, 2026-09-29). The guest links that never landed — the box,
// the details form, the sitter's link — could only be made from one form buried in
// Réglages ▸ Système ▸ Appareils & accès, while every sharing door that IS used sits on
// the thing it shares. So each got a door where Marc placed it, and every door opens the
// ONE form with the choice already made (?kind=, and for the box aimed at a person,
// ?target=). The management side became one list, « Ce que j'ai partagé ».

// The form's kind picker — the one <select> offering the box.
const kindPicker = (page: Page) => page.locator('select').filter({ has: page.locator('option[value="postbox"]') })

test('the board ＋ offers « Lien pour la gardienne », and it lands on the form set to the sitter', async ({ page, app }) => {
  await app.boot({ viewport: { width: 390, height: 844 }, clock: 'BASE', route: '/board' })
  await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })
  await page.locator('.add-fab').click()
  await page.locator('.cat-pick[data-mode="sitter-link"]').click()
  await expect(page).toHaveURL(/\/settings\?.*kind=sitter/)
  await expect(kindPicker(page)).toHaveValue('sitter')
})

test('the Mots card carries « Boîte aux lettres », and it lands on the form set to the box', async ({ page, app }) => {
  await app.boot({ viewport: { width: 390, height: 844 }, clock: 'BASE', route: '/board' })
  await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })
  await page.locator('.notes').getByRole('link', { name: 'Boîte aux lettres' }).click()
  await expect(page).toHaveURL(/\/settings\?.*kind=postbox/)
  await expect(kindPicker(page)).toHaveValue('postbox')
})

test('a contact’s peek asks them to fill in their fiche — the box, aimed at THEM', async ({ page, app }) => {
  await app.boot({ viewport: { width: 390, height: 844 }, clock: 'BASE', route: '/maison?section=family' })
  // Rose Tremblay, « Mamie » in the family card.
  const person = page.getByRole('button', { name: /^R Mamie/ }).first()
  await expect(person).toBeVisible({ timeout: 15_000 })
  await person.click()
  const sheet = page.locator('.detail-sheet, .sheet.show').first()
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'Plus d’actions' }).click()
  // The ⋯ panel portals to <body> (ActionMenu) — scope to the page, not the sheet.
  await page.getByRole('menuitem', { name: 'Lui demander de compléter' }).click()
  await expect(page).toHaveURL(/\/settings\?.*kind=postbox.*target=/)
  await expect(kindPicker(page)).toHaveValue('postbox')
  // The person is named in the form once the circle has loaded (by the name the circle
  // uses for her — the nickname).
  await expect(page.getByRole('combobox', { name: /lien ouvert/ })).toHaveValue('Mamie')
})

test('what was handed out reads as ONE list — links and shared copies together', async ({ page, app }) => {
  await app.boot({ viewport: { width: 390, height: 844 }, clock: 'BASE' })
  await page.route('**/api/guest-links**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            links: [{ id: 'g1', kind: 'sitter', target_key: null, standing: 0, label: null, created_at: BASE, expires_at: BASE + 3600 }],
          }),
        })
      : route.fallback(),
  )
  await page.route('**/api/share**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ shares: [{ id: 's1', kind: 'recipe', label: 'Pâté chinois', expiresAt: null }] }),
        })
      : route.fallback(),
  )
  await page.goto('/settings?tab=settings&focus=guestLinks')
  const list = page.locator('.operator__guest-links', { hasText: 'Ce que j’ai partagé' })
  await expect(list).toBeVisible({ timeout: 15_000 })
  await expect(list).toContainText('Pâté chinois')
  // One verb now: a link and a shared copy both say « Révoquer » (solidify 4.5).
  await expect(list.getByRole('button', { name: /Révoquer/ })).toHaveCount(2)
  // One list, not two stacked: the old headings are gone.
  await expect(page.getByText('Liens actifs')).toHaveCount(0)
  await expect(page.getByText('Mes partages')).toHaveCount(0)
})
