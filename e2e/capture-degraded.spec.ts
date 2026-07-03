import { test, expect, type Page, type Request } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Behavioural coverage for the capture AI-off DEGRADE + RE-ROUTE flow — the last
// blind capture path. When AI is off/unavailable the server files the text as a
// plain note and returns { degraded: true }; AddSheet then shows the 7 type tiles
// DIRECTLY (picking a type is required work, not the optional "Corriger" tweak).
// Tapping a tile re-POSTs /api/capture with forceType AND undo = the note's rows,
// so the correction MOVES the capture instead of duplicating it.
//
// The shared mock falls every POST through to {ok:true}, which the client reads as a
// non-degraded happy-path route — so this stubs POST /api/capture per-test to return
// the degraded shape first, then a real route on the forced re-file (writes hand back
// {ok:true} so we assert the request body, not a refetched outcome).

const NOTE_CLEANUP = [{ table: 'notes', id: 'n_e2e' }]

// First capture (no forceType) → AI-off note + degraded:true, carrying the note row
// as cleanup. The forced re-file → a real route (degraded:false).
async function stubCapture(page: Page) {
  await page.route('**/api/capture', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}')
    if (body.forceType) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: body.forceType,
          degraded: false,
          routed: { kind: body.forceType, label: body.text, cleanup: [{ table: 'meals', id: 'm_e2e' }] },
        }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type: 'note',
        degraded: true,
        routed: { kind: 'note', label: body.text, cleanup: NOTE_CLEANUP },
      }),
    })
  })
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr' })
})

async function openCapture(page: Page, text: string) {
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('.add-fab').click()
  await expect(page.locator('.sheet.show')).toBeVisible()
  await page.locator('.sheet__field input').fill(text)
}

test('an AI-off capture degrades to the type picker (tiles shown directly, not behind « Corriger »)', async ({ page }) => {
  await stubCapture(page)
  await page.goto('/board')
  await openCapture(page, 'souper spaghetti jeudi')

  await Promise.all([
    page.waitForRequest(
      (r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/capture',
      { timeout: 20_000 },
    ),
    page.locator('.sheet form button[type="submit"]').first().click(),
  ])

  // Degraded confirmation line + the re-file tiles are shown OUTRIGHT — the "Corriger"
  // disclosure is absent (picking a type is required work here, not the optional tweak).
  // Scope the tiles to the capture form: the board ＋ sheet's mode chooser reuses
  // .cat-pick (with the same labels) outside the form.
  await expect(page.locator('.capture__routed')).toHaveText('IA hors ligne : choisis le type.')
  await expect(page.locator('.capture__correct')).toHaveCount(0)
  await expect(page.locator('.sheet form .cat-pick', { hasText: 'Souper' })).toBeVisible()
  await expect(page.locator('.sheet form .cat-pick', { hasText: 'Rendez-vous' })).toBeVisible()
  // The typed text is KEPT on a degraded route (still needs re-filing).
  await expect(page.locator('.sheet__field input')).toHaveValue('souper spaghetti jeudi')
})

test('picking a type re-routes with forceType and hands the note rows back as undo (moves, not duplicates)', async ({ page }) => {
  await stubCapture(page)
  await page.goto('/board')
  await openCapture(page, 'souper spaghetti jeudi')

  await page.locator('.sheet form button[type="submit"]').first().click()
  await expect(page.locator('.sheet form .cat-pick', { hasText: 'Souper' })).toBeVisible()

  // Tapping « Souper » re-POSTs capture with forceType:'meal' AND undo carrying the
  // degraded note's row — so the server drops the note as it files the meal.
  const isReroute = (r: Request) =>
    r.method() === 'POST' &&
    new URL(r.url()).pathname === '/api/capture' &&
    (() => {
      try {
        const b = JSON.parse(r.postData() || '{}')
        return b.forceType === 'meal' && b.undo?.[0]?.id === 'n_e2e'
      } catch {
        return false
      }
    })()
  await Promise.all([
    page.waitForRequest(isReroute, { timeout: 20_000 }),
    page.locator('.sheet form .cat-pick', { hasText: 'Souper' }).click(),
  ])

  // The re-file cleared the box and the degraded picker is gone (real route now).
  await expect(page.locator('.sheet__field input')).toHaveValue('')
  await expect(page.locator('.capture__routed')).toHaveText('Ajouté : souper spaghetti jeudi')
})
