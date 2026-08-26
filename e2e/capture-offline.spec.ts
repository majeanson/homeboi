import { test, expect, type Request } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// A-2 (bmad/10) — « La capture tient parole ». Capture used to be the ONE add-path
// with no outbox: offline (or any transport failure) flipped an error line and left
// the dictated text sitting in the box, even though the copy already promised
// « Ton texte est gardé ». Now `AddSheet.submit()` goes through the offline-aware
// `useWrite()`: online, routing is unchanged; offline, the RAW TEXT is enqueued to
// the SAME /api/capture endpoint and replayed on reconnect (routing + parseWhen stay
// server-side, they just run later). This drives a real capture across an
// offline→online transition and proves the promise now holds: nothing is sent while
// offline, a calm confirmation replaces the error, and the eventual replay carries
// the idempotency key B-9 hardened.

const isCapturePost = (r: Request) =>
  r.method() === 'POST' && new URL(r.url()).pathname === '/api/capture'

test('an offline capture queues (queued confirmation, input cleared, pending count 1, nothing sent), then replays on reconnect with an Idempotency-Key', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
  await page.goto('/board')

  // Count every POST /api/capture so we can prove it does NOT fire while offline.
  const capturePosts: Request[] = []
  page.on('request', (r) => {
    if (isCapturePost(r)) capturePosts.push(r)
  })

  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  // The capture spine lives on the header mic now (« Parle à la maison » ▸ Classer).
  await page.locator('.app-head__ask').click()
  await expect(page.locator('.kit-modal.ask-sheet')).toBeVisible()
  await page.locator('.ask-sheet__modes button', { hasText: 'Classer' }).click()
  await page.locator('.capture-form input.edit-field__input').fill('Acheter du lait')

  // Go offline — the offline bar appearing confirms navigator.onLine now reads
  // false, exactly the signal writeWith checks to queue instead of send.
  await page.context().setOffline(true)
  await expect(page.locator('.offline-bar')).toBeVisible()

  await page.locator('.capture-form .edit-field__submit').click()

  // Queued to the outbox: a calm info line (not the error one), the input cleared
  // like a successful capture, and the offline bar's pending count at 1 — and
  // nothing was sent over the wire.
  await expect(page.locator('.status-msg--info', { hasText: 'Hors ligne' })).toBeVisible()
  await expect(page.locator('.status-msg--error')).toHaveCount(0)
  await expect(page.locator('.capture-form input.edit-field__input')).toHaveValue('')
  await expect(page.locator('.offline-bar__stamp', { hasText: '1 en attente' })).toBeVisible()
  expect(capturePosts.length).toBe(0)

  // Reconnect → the 'online' event triggers startOutbox's replay → the held POST
  // fires now, carrying its idempotency key. It never fired before this moment.
  await Promise.all([
    page.waitForRequest(isCapturePost, { timeout: 20_000 }),
    page.context().setOffline(false),
  ])
  expect(capturePosts.length).toBe(1)
  expect(capturePosts[0].headers()['idempotency-key']).toBeTruthy()

  // The replayed body is the raw text — routing stayed server-side, just deferred.
  const body = JSON.parse(capturePosts[0].postData() || '{}')
  expect(body.text).toBe('Acheter du lait')

  // And the outbox drains — the pending stamp clears once the write lands.
  await expect(page.locator('.offline-bar__stamp', { hasText: 'en attente' })).toHaveCount(0)
})

test('the mic stays offline-disabled — only the typed capture path is queueable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
  await page.goto('/board')

  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('.app-head__ask').click()
  await expect(page.locator('.kit-modal.ask-sheet')).toBeVisible()
  await page.locator('.ask-sheet__modes button', { hasText: 'Classer' }).click()

  await page.context().setOffline(true)
  await expect(page.locator('.offline-bar')).toBeVisible()

  // VoiceButton (Web Speech needs a live connection) is still disabled offline —
  // A-2 only unblocked the typed path.
  await expect(page.locator('.capture-form .capture__voice')).toBeDisabled()

  await page.context().setOffline(false)
})
