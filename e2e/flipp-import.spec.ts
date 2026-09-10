import { test, expect, type Request } from '@playwright/test'
import { mockApi, seedState } from './mocks'
import { encodeFlippExport, type FlippExport } from '../src/lib/flippList'

// THE WAY BACK — Flipp → Babillard (lib/flippImport). The bookmark's second answer
// opens `/liste#flipp=<base64url>`; the list page shows what would change, asks,
// then writes through the picks seam. Read from the WRITES, not the screen: what
// matters is which line got which PATCH/POST, and that NOTHING is written before
// « Rapporter » is confirmed.
//
// Mock list: Lait (l1, staged deal 101), Pain (l2), Pommes (l3), Couches (l4).
// The export brings: a clipping for « Lait » with a NEW flyer item (555) → the deal
// swaps onto l1; a checked clipping for « Pain » with no id → only the check; a
// typed « Crème à café » (not on the list) → a new line; a typed « Pommes »
// checked → l3 checked; a typed « Couches » unchecked, already there → nothing.
const EXPORT: FlippExport = {
  v: 1,
  from: 'flipp',
  clippings: [
    { flyerItemId: 555, name: 'Lait 1% 2L', flyerId: 5002, price: '2.99', merchantId: 7, merchantName: 'IGA', merchantLogoUrl: null, thumbnailUrl: null, validTo: '2099-01-01', checked: false },
  ],
  items: [
    { term: 'Crème à café', checked: false },
    { term: 'Pommes', checked: true },
    { term: 'Couches', checked: false },
  ],
}

const listWrite = (r: Request) => (r.method() === 'POST' || r.method() === 'PATCH') && new URL(r.url()).pathname === '/api/list'

async function openWithExport(page: Parameters<typeof mockApi>[0]) {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/liste#flipp=' + encodeFlippExport(EXPORT))
  await page.locator('.list-row').first().waitFor({ state: 'visible', timeout: 15_000 })
}

test('shows what would change, and writes NOTHING until « Rapporter » is confirmed', async ({ page }) => {
  const writes: string[] = []
  page.on('request', (r) => {
    if (listWrite(r)) writes.push(`${r.method()} ${r.postData()}`)
  })
  await openWithExport(page)
  const dialog = page.locator('.confirm')
  await expect(dialog).toBeVisible()
  // 1 deal attached (Lait → 555), 1 line added (Crème), 1 checked (Pommes) — and the consequence.
  await expect(dialog).toContainText(/1 rabais accroché, 1 article ajouté, 1 coché — rien n’est retiré/)
  expect(writes, 'nothing written before the answer').toEqual([])
  // The hash is consumed even before the answer: a refresh must not ask twice.
  expect(new URL(page.url()).hash).toBe('')
  await dialog.getByRole('button', { name: /Annuler/ }).click()
  await page.waitForTimeout(500)
  expect(writes, 'nothing written after « Annuler »').toEqual([])
})

test('confirmed: the deal swaps onto its line, the new line is added, the checked one is checked', async ({ page }) => {
  const writes: { method: string; body: Record<string, unknown> }[] = []
  page.on('request', (r) => {
    if (listWrite(r)) writes.push({ method: r.method(), body: JSON.parse(r.postData() ?? '{}') as Record<string, unknown> })
  })
  await openWithExport(page)
  const dialog = page.locator('.confirm')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /^Rapporter$/ }).click()
  await expect.poll(() => writes.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(3)
  const patchDeal = writes.find((w) => w.method === 'PATCH' && w.body.id === 'l1' && w.body.deal)
  expect(patchDeal, 'the Flipp clipping became the deal on « Lait »').toBeTruthy()
  expect((patchDeal!.body.deal as { id: number; merchant: string; price: number }).id).toBe(555)
  expect((patchDeal!.body.deal as { id: number; merchant: string; price: number }).merchant).toBe('IGA')
  expect((patchDeal!.body.deal as { id: number; merchant: string; price: number }).price).toBe(2.99)
  const post = writes.find((w) => w.method === 'POST' && w.body.text === 'Crème à café')
  expect(post, 'the typed item became a new line').toBeTruthy()
  const check = writes.find((w) => w.method === 'PATCH' && w.body.id === 'l3' && w.body.checked === true)
  expect(check, '« Pommes », checked in Flipp, is checked here').toBeTruthy()
  // « Couches » was already there and unchecked in both — untouched.
  expect(writes.some((w) => w.body.id === 'l4' || w.body.text === 'Couches')).toBe(false)
  await expect(page.getByText(/Rapporté de Flipp/)).toBeVisible()
})

test('a guest is read-only: the hash is dropped, nothing is asked, nothing is written', async ({ page }) => {
  const writes: string[] = []
  page.on('request', (r) => {
    if (listWrite(r)) writes.push(r.method())
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.addInitScript(() => localStorage.setItem('babillard-guest-preview', '1'))
  await page.goto('/liste#flipp=' + encodeFlippExport(EXPORT))
  await page.locator('.list-row').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(800)
  await expect(page.locator('.confirm')).toHaveCount(0)
  expect(writes).toEqual([])
  expect(new URL(page.url()).hash).toBe('')
})
