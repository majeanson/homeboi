import { test, expect, type Page, type Request } from '@playwright/test'
import { worstRightBleed } from './overflow'
import { mockApi, seedState } from './mocks'

// Behavioural coverage for the capture AI-off DEGRADE + RE-ROUTE flow — the last
// blind capture path. When AI is off/unavailable the server files the text as a
// plain note and returns { degraded: true }; CaptureForm then shows the 7 type tiles
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

// The capture spine moved off the ＋ sheet and onto the header mic
// (« Parle à la maison » ▸ Classer), so the ＋ sheet's note tile can be a plain note.
async function openCapture(page: Page, text: string) {
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('.app-head__ask').click()
  await expect(page.locator('.kit-modal.ask-sheet')).toBeVisible()
  await page.locator('.ask-sheet__modes button', { hasText: 'Classer' }).click()
  await page.locator('.capture-form input.edit-field__input').fill(text)
}

const submitCapture = (page: Page) => page.locator('.capture-form .edit-field__submit').click()

test('an AI-off capture degrades to the type picker (tiles shown directly, not behind « Corriger »)', async ({ page }) => {
  await stubCapture(page)
  await page.goto('/board')
  await openCapture(page, 'souper spaghetti jeudi')

  await Promise.all([
    page.waitForRequest(
      (r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/capture',
      { timeout: 20_000 },
    ),
    submitCapture(page),
  ])

  // Degraded confirmation line + the re-file tiles are shown OUTRIGHT — the "Corriger"
  // disclosure is absent (picking a type is required work here, not the optional tweak).
  // Scope the tiles to the capture form — .cat-pick is also the ＋ sheet mode chooser.
  await expect(page.locator('.capture__routed')).toHaveText('L’IA ne répond pas — choisis le type toi-même.')
  await expect(page.locator('.capture__correct')).toHaveCount(0)
  await expect(page.locator('.capture-form .cat-pick', { hasText: 'Souper' })).toBeVisible()
  await expect(page.locator('.capture-form .cat-pick', { hasText: 'Rendez-vous' })).toBeVisible()
  // The typed text is KEPT on a degraded route (still needs re-filing).
  await expect(page.locator('.capture-form input.edit-field__input')).toHaveValue('souper spaghetti jeudi')
})

test('picking a type re-routes with forceType and hands the note rows back as undo (moves, not duplicates)', async ({ page }) => {
  await stubCapture(page)
  await page.goto('/board')
  await openCapture(page, 'souper spaghetti jeudi')

  await submitCapture(page)
  await expect(page.locator('.capture-form .cat-pick', { hasText: 'Souper' })).toBeVisible()

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
    page.locator('.capture-form .cat-pick', { hasText: 'Souper' }).click(),
  ])

  // The re-file cleared the box and the degraded picker is gone (real route now).
  await expect(page.locator('.capture-form input.edit-field__input')).toHaveValue('')
  await expect(page.locator('.capture__routed')).toHaveText('Ajouté : souper spaghetti jeudi')
})

// The re-file grid is SEVEN tiles wide-ish and had never been measured at 320px — the
// narrowest phone the suite covers, and the width at which every other overflow bug in
// this app has surfaced (REVIEW-PASS « small consistency nits »). It matters more here
// than in most places: this grid appears exactly when the AI could not route the note,
// so the person is already doing unplanned work, and a tile bleeding past the right
// edge would be invisible — `.sheet` and the capture card both clip overflow-x, which
// is why a `scrollWidth` check cannot see it. `assertClean` measures each visible
// descendant's right edge against the container's, which sees through the clip.
test('the degraded re-file grid never bleeds past the right edge @320', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await stubCapture(page)
  await page.goto('/board')
  await openCapture(page, 'souper spaghetti jeudi')
  await submitCapture(page)

  // All seven tiles are on screen (the degraded path shows them outright).
  const tiles = page.locator('.capture-form .cat-pick')
  await expect(tiles.first()).toBeVisible({ timeout: 20_000 })
  expect(await tiles.count(), 'the full re-file grid is shown').toBeGreaterThanOrEqual(6)

  // worstRightBleed, not assertClean: the latter also asserts the container itself
  // clips overflow-x, which .capture-form deliberately does not (it is an in-page card,
  // not a sheet). What matters here is the same measurement — no visible descendant may
  // extend past the card's right edge — read through whatever clipping is above it.
  const { bleed, culprit } = await worstRightBleed(page, '.capture-form')
  expect(bleed, `"${culprit}" bleeds off the right edge at 320px`).toBeLessThanOrEqual(1)
})
