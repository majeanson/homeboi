import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « Transformer » (PLAN-mots A6, accepted 2026-09-25): a peek action on a TEXT mot that
// routes its words through the capture spine — « dentiste mardi 15h » becomes a
// rendez-vous — with the ＋ sheet's own form, so the routed line and « Non, plutôt… » are
// the ones people already know. The mot stays until it is retired by hand; retiring it
// rides the same undo toast as a delete. Never automatic; hidden when AI is unset, and
// absent on a mot without words (a voice memo's transcript is a guess, not a line to file).

const MOT = {
  id: 'mo1', member_id: null, author_member_id: 'm2', text: 'Dentiste mardi 15h',
  media_kind: null, media_key: null, scene_key: null, created_at: 1_749_369_600,
  updated_at: null, opened_at: null, saved_at: null, surface_at: null, reply_to: null,
}
const VOICE = { ...MOT, id: 'mo2', text: '', media_kind: 'audio', media_key: 'k1', transcript: 'acheter du lait' }

async function boot(page: Page, mots: object[], aiAvailable = true) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await page.route('**/api/mots**', (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mots }) })
  })
  await page.route('**/api/health**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ai: aiAvailable, aiAvailable, rateLimit: true, alerts: true }) }),
  )
  await page.route('**/api/capture', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}')
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ type: 'event', degraded: false, routed: { kind: 'event', label: body.text, cleanup: [{ table: 'events', id: 'ev_e2e' }] } }),
    })
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
    } catch {
      /* noop */
    }
  })
  await page.goto('/board')
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
}

// A mot row is a peek-only Act: the whole row IS the button (no inner hit target).
const motRow = (page: Page, text: string) => page.locator('.wg-slot[data-card="mots"] button.act', { hasText: text })

test('a text mot is routed through the capture spine, then retired by hand — with the undo toast', async ({ page }) => {
  await boot(page, [MOT])
  await motRow(page, 'Dentiste').click()
  const peek = page.locator('.detail-sheet')
  await expect(peek).toBeVisible()
  await peek.getByRole('button', { name: 'Transformer' }).click()

  // The modal holds the ＋ sheet's own capture form, seeded with the mot's words.
  const modal = page.locator('.kit-modal.cnote-memo')
  await expect(modal).toBeVisible()
  const field = modal.locator('.capture-form input.edit-field__input')
  await expect(field).toHaveValue('Dentiste mardi 15h')
  // Nothing is written until the tap: the retire/keep question is not asked yet.
  await expect(modal.getByRole('button', { name: 'Retirer le mot' })).toHaveCount(0)

  const posted = page.waitForRequest((r) => r.url().includes('/api/capture') && r.method() === 'POST')
  await modal.getByRole('button', { name: 'Ajouter' }).click()
  expect(JSON.parse((await posted).postData() || '{}').text).toBe('Dentiste mardi 15h')
  await expect(modal.locator('.capture__routed')).toContainText('Ajouté : Dentiste mardi 15h')
  // The route landed → now the mot's fate is asked, and « Non, plutôt… » is still offered.
  await expect(modal.locator('.capture__correct')).toBeVisible()
  await modal.getByRole('button', { name: 'Retirer le mot' }).click()
  await expect(modal).toBeHidden()
  // Retired the calm way: the row is gone and the undo toast offers it back.
  await expect(motRow(page, 'Dentiste')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Annuler' }).first()).toBeVisible()
})

test('« Garder le mot » leaves the mot in place after the route', async ({ page }) => {
  await boot(page, [MOT])
  await motRow(page, 'Dentiste').click()
  await page.locator('.detail-sheet').getByRole('button', { name: 'Transformer' }).click()
  const modal = page.locator('.kit-modal.cnote-memo')
  await modal.getByRole('button', { name: 'Ajouter' }).click()
  await expect(modal.locator('.capture__routed')).toBeVisible()
  await modal.getByRole('button', { name: 'Garder le mot' }).click()
  await expect(modal).toBeHidden()
  await expect(motRow(page, 'Dentiste')).toHaveCount(1)
})

test('no « Transformer » on a mot without words, nor when AI is unavailable', async ({ page }) => {
  await boot(page, [MOT, VOICE], false)
  await motRow(page, 'Dentiste').click()
  const peek = page.locator('.detail-sheet')
  await expect(peek).toBeVisible()
  await expect(peek.getByRole('button', { name: 'Répondre' })).toBeVisible()
  await expect(peek.getByRole('button', { name: 'Transformer' })).toHaveCount(0)
})

test('a voice mot has no « Transformer » even with AI on — its words are a transcript, not a line to file', async ({ page }) => {
  await boot(page, [VOICE])
  await motRow(page, 'acheter du lait').click()
  const peek = page.locator('.detail-sheet')
  await expect(peek).toBeVisible()
  await expect(peek.getByRole('button', { name: 'Transformer' })).toHaveCount(0)
})
