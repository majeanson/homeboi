import { test, expect } from '@playwright/test'
import { mockApi, seedState, BASE } from './mocks'

// #30 — global search (/search). The pure fold() matcher is unit-tested elsewhere; this
// proves the SCENE end-to-end: a typed query surfaces rows across sections, the newly
// indexed sections (care-log / home-pins / drawings — §808) appear, and a business /
// family-note hit DEEP-LINKS to the item, not just the section list (§892).
test.use({ hasTouch: true })

// A home carnet + one service-history entry + one « en cas de pépin » pin + one business
// + one family note, injected as route overrides so the global mock baselines (which keep
// these empty on purpose, for calm board/screenshot defaults) stay untouched.
const CARNET = { id: 'k1', parentId: null, kind: 'home', name: 'Maison', mediaKey: null, color: '#88a36f', facts: null, installedAt: null, lifespanMonths: null, linkId: null, notes: null, sort: 0 }
const CARE = { id: 'cl1', carnetId: 'k1', at: BASE, kind: 'install', title: 'Chauffe-eau installé', note: 'Facture Plomberie Untel', costCents: 120000, businessId: null, mediaKeys: [] }
const PIN = { id: 'hp1', carnetId: 'k1', kind: 'where', label: 'Valve d’eau principale', detail: 'sous l’évier de la cuisine', mediaKey: null, sort: 0 }
const BIZ = { id: 'b1', name: 'Clinique Vétérinaire du Coin', category: 'Vétérinaire', phone: '450-555-0100', email: null, address: null, website: null, notes: null, photoKey: null, colour: '#5891AC' }
const NOTE = { id: 'n1', member_id: null, author_member_id: 'm1', title: 'Recette de tourtière', text: 'Pâte brisée, porc haché, épices du Lac', media_kind: null, media_key: null, scene_key: null, created_at: BASE, updated_at: BASE }

async function overrideJson(page: import('@playwright/test').Page, path: string, body: unknown) {
  await page.route(`**/api/${path}**`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 })
  await mockApi(page)
  await overrideJson(page, 'carnets', { carnets: [CARNET], soon: [] })
  await overrideJson(page, 'care-log', { entries: [CARE] })
  await overrideJson(page, 'home-pins', { pins: [PIN] })
  await overrideJson(page, 'businesses', { businesses: [BIZ] })
  await overrideJson(page, 'family-notes', { notes: [NOTE] })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
})

test('a query surfaces rows across sections, including the drawings gallery', async ({ page }) => {
  await page.goto('/search')
  await page.locator('.search__input').fill('Léa')

  // An event (« Fête de Léa », from the board fixture) AND a drawing (dg1, drawn by Léa —
  // matched on its AUTHOR since a drawing carries no text) both surface.
  await expect(page.getByRole('heading', { name: 'Événements' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Mes dessins' })).toBeVisible()
  // The drawing hit links to the gallery.
  await expect(page.locator('.search__row[href="/drawings"]').first()).toBeVisible()
})

test('the newly indexed carnet sections (care-log + home-pins) surface and link to the carnet', async ({ page }) => {
  await page.goto('/search')

  // « En cas de pépin » pin — matched on its label, links to the carnet's « Le carnet » tab.
  await page.locator('.search__input').fill('valve')
  await expect(page.getByRole('heading', { name: 'Repères de la maison' })).toBeVisible()
  await expect(page.locator('.search__row[href="/cercle/carnet/k1?seg=carnet"]').first()).toBeVisible()

  // Service-history entry — matched on its free-text note.
  await page.locator('.search__input').fill('plomberie')
  await expect(page.getByRole('heading', { name: 'Historique d’entretien' })).toBeVisible()
  await expect(page.getByText('Chauffe-eau installé')).toBeVisible()
})

test('a business hit deep-links to the item (opens its peek), not just the section', async ({ page }) => {
  await page.goto('/search')
  await page.locator('.search__input').fill('vété')

  const hit = page.locator('.search__row[href="/cercle?section=business&item=b1"]')
  await expect(hit).toBeVisible()
  await hit.click()

  // Landed on the Business tab with the item consumed (?item stripped from the URL) …
  await expect(page).toHaveURL(/section=business/)
  await expect(page).not.toHaveURL(/item=/)
  // … and the business is surfaced (its peek/row), with the one-time focus highlight.
  await expect(page.getByText('Clinique Vétérinaire du Coin').first()).toBeVisible()
  await expect(page.locator('.cercle-row.is-focus')).toBeVisible()
})

test('a family-note hit deep-links to the note and expands it', async ({ page }) => {
  await page.goto('/search')
  await page.locator('.search__input').fill('tourtière')

  const hit = page.locator('.search__row[href="/cercle?section=notes&item=n1"]')
  await expect(hit).toBeVisible()
  await hit.click()

  await expect(page).toHaveURL(/section=notes/)
  await expect(page).not.toHaveURL(/item=/)
  // Highlighted on arrival (transient — assert first), then expanded in place (persists).
  await expect(page.locator('.cnote.is-focus')).toBeVisible()
  await expect(page.locator('.cnote.cnote--expanded')).toBeVisible()
  await expect(page.getByText('porc haché')).toBeVisible()
})
