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

  const hit = page.locator('.search__row[href="/maison?section=business&item=b1"]')
  await expect(hit).toBeVisible()
  await hit.click()

  // Landed on the Business tab with the item consumed (?item stripped from the URL) …
  await expect(page).toHaveURL(/section=business/)
  await expect(page).not.toHaveURL(/item=/)
  // … and the business is surfaced (its peek/row), with the one-time focus highlight.
  await expect(page.getByText('Clinique Vétérinaire du Coin').first()).toBeVisible()
  await expect(page.locator('.cercle-row.is-focus')).toBeVisible()
})

// Wave S (PARITY) — six kinds that were dark to Recherche now have a SEARCH_INDEX
// entry + a section. Four (habit / free-text meal / free-text idea / group) match
// baseline fixtures; mots + trips are empty by default, so seed one of each.
const MOT = { id: 'mo1', member_id: null, author_member_id: 'm1', text: 'Réunion de famille dimanche', media_kind: null, media_key: null, scene_key: null, created_at: BASE, updated_at: BASE, opened_at: null, saved_at: null, surface_at: null, reply_to: null }
const TRIP = { id: 'tr1', title: 'Voyage en Gaspésie', destination: 'Percé', notes: 'Apporter les bottes', start_at: BASE, end_at: BASE, members: [], colour: '#2a8f85', media_kind: null, media_key: null, position: 0, created_at: BASE, updated_at: BASE }

test('Wave S — the six newly-indexed kinds each surface a section (habit/mot/meal/idea/group/trip)', async ({ page }) => {
  await overrideJson(page, 'mots', { mots: [MOT] })
  await overrideJson(page, 'trips', { trips: [TRIP] })
  await page.goto('/search')

  // A habit — matched on its title, links to the daily check-in scene.
  await page.locator('.search__input').fill('Marcher dehors')
  await expect(page.getByRole('heading', { name: 'Mes habitudes' })).toBeVisible()
  await expect(page.locator('.search__row[href="/board/habitudes"]').first()).toBeVisible()

  // A « mot » — no name, matched on its body text (secondary), links to the board.
  await page.locator('.search__input').fill('Réunion de famille')
  await expect(page.getByRole('heading', { name: 'Les mots' })).toBeVisible()

  // A FREE-TEXT supper — « Salade César » (no recipe_id). The recipe-linked
  // « Spaghetti maison » deliberately does NOT show here (it's a recipe hit).
  await page.locator('.search__input').fill('Salade César')
  await expect(page.getByRole('heading', { name: 'Plan des repas' })).toBeVisible()

  // A free-text meal idea.
  await page.locator('.search__input').fill('Soupe poulet')
  await expect(page.getByRole('heading', { name: 'Idées de repas' })).toBeVisible()

  // A named group — « Le hockey » (friends kind → Maison's social list).
  await page.locator('.search__input').fill('hockey')
  await expect(page.getByRole('heading', { name: 'Les groupes' })).toBeVisible()
  await expect(page.locator('.search__row[href="/maison?section=social"]').first()).toBeVisible()

  // A trip — matched on its title, links to the trip notebook /voyage/:id.
  await page.locator('.search__input').fill('Gaspésie')
  await expect(page.getByRole('heading', { name: 'Voyages' })).toBeVisible()
  await expect(page.locator('.search__row[href="/voyage/tr1"]').first()).toBeVisible()
})

test('a family-note hit deep-links to the note and pulses its row', async ({ page }) => {
  // « Les notes » is its own hub tab now (split out of Le cercle) — the hit links
  // straight to /notes?item=<id>.
  await page.goto('/search')
  await page.locator('.search__input').fill('tourtière')

  const hit = page.locator('.search__row[href="/notes?item=n1"]')
  await expect(hit).toBeVisible()
  await hit.click()

  await expect(page).toHaveURL(/\/notes/)
  await expect(page).not.toHaveURL(/item=/)
  // Highlighted on arrival, scrolled into view — but NOT auto-opened: the row
  // doesn't expand in place any more (2026-09-04, `openOnTap`), and a search hit
  // landing you straight in the full-screen editor unasked would be a surprise.
  await expect(page.locator('.cnote.is-focus')).toBeVisible()
  await expect(page.locator('.cnote.cnote--expanded')).toHaveCount(0)
  await expect(page.locator('.note-editor')).toHaveCount(0)
  await expect(page.getByText('Recette de tourtière')).toBeVisible()
})
