import { test, expect, type Request } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// The offline write OUTBOX end-to-end (REVIEW-PASS §931). A write made while offline
// must QUEUE (never hit the network, never be lost) and REPLAY automatically when the
// connection returns: useWrite → writeWith enqueues when navigator.onLine is false, and
// startOutbox (wired at boot in main.tsx) replays on the 'online' event. This drives a
// real /liste add across an offline→online transition and proves the POST fires ONLY
// after reconnect — the core promise of NFR-OFFLINE-1 that unit tests can't observe.

const isListPost = (r: Request) =>
  r.method() === 'POST' && new URL(r.url()).pathname === '/api/list'

test('a list write made offline queues in the outbox, then replays on reconnect', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/liste')

  // Count every POST /api/list so we can prove it does NOT fire while offline.
  let listPosts = 0
  page.on('request', (r) => {
    if (isListPost(r)) listPosts++
  })

  const add = page.locator('.edit-field .input').first()
  await expect(add).toBeVisible()

  // Go offline — the offline bar appearing confirms useOnline()/navigator.onLine now
  // reads false, exactly the signal writeWith checks to queue instead of send.
  await page.context().setOffline(true)
  await expect(page.locator('.offline-bar')).toBeVisible()

  await add.fill('Piles AA')
  await page.locator('.edit-field button[type="submit"]').first().click()

  // Queued to the outbox: the offline bar shows a pending count (useOutboxCount), and
  // nothing was sent over the wire.
  await expect(page.locator('.offline-bar__stamp', { hasText: 'en attente' })).toBeVisible()
  expect(listPosts).toBe(0)

  // Reconnect → the 'online' event triggers startOutbox's replay → the held POST fires
  // now (with its idempotency key). It never fired before this moment.
  await Promise.all([
    page.waitForRequest(isListPost, { timeout: 20_000 }),
    page.context().setOffline(false),
  ])
  expect(listPosts).toBe(1)

  // And the outbox drains — the pending stamp clears once the write lands.
  await expect(page.locator('.offline-bar__stamp', { hasText: 'en attente' })).toHaveCount(0)
})

// B-9 (bmad/10): before the fix, only a REPLAY carried an Idempotency-Key (a fresh
// one minted at enqueue) — a normal online write sent none. So a "response lost
// after the server already applied it" transport failure would queue the retry
// under a DIFFERENT key than the (never-sent) online attempt, and a genuinely
// double-tapped write could double-apply. This drives a real transport failure
// (not a full offline transition) while nominally online, then forces a replay,
// and asserts both POSTs — the failed attempt and its replay — carry the exact
// same Idempotency-Key header (the hoisted key in writeWith).
test('a write that fails in transit and its outbox replay carry the SAME Idempotency-Key', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })

  // Fail exactly the FIRST POST /api/list (simulating a dropped response), then
  // let every subsequent one (the replay) through via mockApi's normal handling.
  const idemKeys: (string | undefined)[] = []
  let failedOnce = false
  await page.route('**/api/list', async (route) => {
    const req = route.request()
    if (req.method() !== 'POST') return route.fallback()
    idemKeys.push(req.headers()['idempotency-key'])
    if (!failedOnce) {
      failedOnce = true
      await route.abort('failed')
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'newitem', text: 'Piles AAA' }),
    })
  })

  await page.goto('/liste')
  const add = page.locator('.edit-field .input').first()
  await expect(add).toBeVisible()
  await add.fill('Piles AAA')
  await page.locator('.edit-field button[type="submit"]').first().click()

  // The transport failure queues the write to the outbox (writeWith's catch).
  await expect.poll(() => idemKeys.length, { timeout: 10_000 }).toBe(1)
  expect(idemKeys[0]).toBeTruthy()

  // Force a reconnect cycle so startOutbox's 'online' listener replays the queue
  // (we were never truly offline — this only re-fires the trigger).
  await page.context().setOffline(true)
  await page.context().setOffline(false)

  await expect.poll(() => idemKeys.length, { timeout: 20_000 }).toBe(2)
  expect(idemKeys[1]).toBe(idemKeys[0])
})
