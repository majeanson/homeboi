import { test, expect } from '@playwright/test'
import { isApi, panelsReady } from './interact'

// Réglages config panels, La liste (stores, aisle order). Each test asserts the write fires AND carries the right
// field: why a settings panel needs that is written out above `panelsReady` in interact.ts.

test.beforeEach(async ({ page }) => panelsReady(page))

// ─────────────────────────────────────────────────────────────────────────────
// Réglages ▸ La liste — « Mes magasins » and « Ordre des allées ». Both persist on
// /api/household like the kitchen panels above, and neither had a behavioural test.
// This class of panel fails SILENTLY when mis-wired: every control here flips
// optimistically, so the row looks saved whether or not the write ever left. That
// is the same shape as the two defects this repo has already shipped and caught by
// hand (NoteEditor's swallowed auto-save, the trip cover that could never be set).

test('excluding a store patches household with the remaining allowlist', async ({ page }) => {
  await page.goto('/settings?tab=liste&sub=shop&focus=storeFilter')
  const section = page.locator('#operator-panel')
  // The flyer fixture holds Super C + IGA (two IGA flyers fold to one store row),
  // sorted by merchant — so row 0 is IGA. The household has includedStores: [],
  // which the panel reads as « unconfigured = every store kept », so each row
  // starts « Inclus » and toggling one OFF is the write.
  const row = section.locator('.store-filter__row').first()
  await expect(row).toBeVisible()
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
    row.getByRole('button', { name: 'Inclus', exact: true }).click(),
  ])
  const body = JSON.parse(req.postData() || '{}') as { includedStores?: string[] }
  // The allowlist is sent WHOLE (not a delta), keyed by lowercased merchant.
  expect(body.includedStores).toEqual(['super c'])
  await expect(row.getByRole('button', { name: 'Exclu', exact: true })).toBeVisible()
})

test('the à-la-caisse flag is independent of the include allowlist', async ({ page }) => {
  // The two flags are deliberately separate fields (migration 0066): « Inclus »
  // governs whether a store reaches deal/flyer lookups at all, « À la caisse »
  // only hides its deals from the till surface — the store you shop at yourself.
  // Wiring the till toggle into includedStores would silently drop that store's
  // deals everywhere, which is exactly the mistake a screenshot cannot see.
  await page.goto('/settings?tab=liste&sub=shop&focus=storeFilter')
  const row = page.locator('#operator-panel').locator('.store-filter__row').first()
  await expect(row).toBeVisible()
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
    row.getByRole('button', { name: 'À la caisse : Oui' }).click(),
  ])
  const body = JSON.parse(req.postData() || '{}') as {
    cashierExcludedStores?: string[]
    includedStores?: string[]
  }
  expect(body.cashierExcludedStores).toEqual(['iga'])
  // The include allowlist must NOT ride along on this PATCH.
  expect(body.includedStores).toBeUndefined()
})

test('« Remettre l’ordre de départ » patches household with the full aisle order', async ({ page }) => {
  // The aisle order is otherwise reorderable only by dragging, so the reset button
  // is the one mouse/keyboard-reachable write in this panel — and the only handle
  // a test can pull without simulating a pointer drag.
  await page.goto('/settings?tab=liste&sub=shop&focus=aisleOrder')
  const section = page.locator('#operator-panel')
  // The reset now confirms first (2026-09-03 predictability audit — a one-tap
  // factory reset sharing undo's icon, with no confirm, was finding #1).
  await section.getByRole('button', { name: 'Remettre l’ordre de départ' }).click()
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
    page.locator('.confirm').getByRole('button', { name: 'Remettre l’ordre de départ', exact: true }).click(),
  ])
  const body = JSON.parse(req.postData() || '{}') as { aisleOrder?: string[] }
  expect(Array.isArray(body.aisleOrder)).toBe(true)
  // Reorder-only: the whole orderable set is sent, and 'autres' is never in it
  // (it is pinned last by aisleRanks, and the panel renders it inert).
  expect(body.aisleOrder!.length).toBeGreaterThan(1)
  expect(body.aisleOrder).not.toContain('autres')
  expect(new Set(body.aisleOrder!).size).toBe(body.aisleOrder!.length)
})
