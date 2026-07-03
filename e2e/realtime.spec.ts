import { test, expect, type WebSocketRoute } from '@playwright/test'
import { mockApi, seedState, BOARD } from './mocks'

// The realtime PUSH channel end-to-end (REVIEW-PASS §931). When another device
// writes, the RealtimeHub Durable Object fans out an `{type:'invalidate', keys}`
// frame over the /api/live WebSocket; the client (src/lib/realtime.ts) invalidates
// those TanStack Query keys so open screens refetch IMMEDIATELY instead of waiting
// for the next poll. Unit tests can't observe the socket→invalidate→refetch loop,
// so we mock the DO with Playwright's routeWebSocket (no wrangler/D1/secrets) and
// drive it the way a cross-device write would.
//
// WHY THE SIGNAL IS UNAMBIGUOUS: once the socket is OPEN, isRealtimeConnected() is
// true, so the board poll drops to its slow safety heartbeat (60s, RT_ACTIVE_POLL_MS
// in lib/query.ts). A change that shows up within a couple of seconds therefore
// arrived via the push, not a poll tick.

// La liste reads the board (BOARD_KEY) and renders board.list. We serve it from a
// mutable holder so the test can add a row — the "other device's write" — before it
// pushes the matching invalidate.
async function serveBoard(page: import('@playwright/test').Page, extra: () => unknown[]) {
  // Registered AFTER mockApi so this handler wins for the board read (Playwright
  // matches the most recently added route first); every other /api/* still falls
  // through to the shared mock.
  await page.route(/\/api\/board(\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...BOARD, list: [...BOARD.list, ...extra()] }),
    })
  })
}

test('a realtime invalidate refetches the board so another device\'s write lands without waiting for the poll', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })

  // Mock the RealtimeHub DO: accept the /api/live handshake WITHOUT connecting to any
  // real server (no connectToServer() → we ARE the server), so the client's socket
  // opens and isRealtimeConnected() flips true. Registered before navigation because
  // connectRealtime opens the socket at boot.
  let serverWs: WebSocketRoute | null = null
  await page.routeWebSocket(/\/api\/live/, (ws) => {
    serverWs = ws
  })

  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })

  let extra: unknown[] = []
  await serveBoard(page, () => extra)

  await page.goto('/liste')
  await expect(page.getByText('Lait', { exact: true })).toBeVisible()
  await expect(page.getByText('Bananes E2E', { exact: true })).toHaveCount(0)

  // The socket is open once our mock server captured it — push now owns freshness and
  // the poll is a 60s heartbeat, so the change below can ONLY reach the screen via WS.
  await expect.poll(() => serverWs !== null, { timeout: 10_000 }).toBe(true)

  // Another device adds a row: the server board now includes it, and the DO fans out
  // an invalidate for the board key.
  extra = [{ id: 'lRT', text: 'Bananes E2E', source: 'manual' }]
  serverWs!.send(JSON.stringify({ type: 'invalidate', keys: [['board']] }))

  // It lands promptly — far inside the 60s realtime heartbeat, proving the WS drove
  // the refetch rather than a poll tick.
  await expect(page.getByText('Bananes E2E', { exact: true })).toBeVisible({ timeout: 8_000 })
})

test('a malformed realtime frame is ignored without breaking the socket (polling-grade robustness)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })

  let serverWs: WebSocketRoute | null = null
  await page.routeWebSocket(/\/api\/live/, (ws) => {
    serverWs = ws
  })

  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })

  let extra: unknown[] = []
  await serveBoard(page, () => extra)

  await page.goto('/liste')
  await expect(page.getByText('Lait', { exact: true })).toBeVisible()
  await expect.poll(() => serverWs !== null, { timeout: 10_000 }).toBe(true)

  // Garbage + a non-invalidate message must both be swallowed (the client JSON.parses
  // in a try/catch and type-guards `invalidate`) and leave the socket usable.
  serverWs!.send('not json {')
  serverWs!.send(JSON.stringify({ type: 'noise', hello: 'world' }))

  // A real invalidate right after still works — the bad frames didn't wedge the
  // channel or crash the page.
  extra = [{ id: 'lRT2', text: 'Bananes E2E', source: 'manual' }]
  serverWs!.send(JSON.stringify({ type: 'invalidate', keys: [['board']] }))
  await expect(page.getByText('Bananes E2E', { exact: true })).toBeVisible({ timeout: 8_000 })
})
