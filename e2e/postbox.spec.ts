import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « La boîte aux lettres » (/courrier) — a relative's postbox share link: say who you
// are, leave a message (text and/or ONE memo: voice / drawing / photo), staged to R2
// then sent in one submit. Locks the guest submit flow (text-only + photo-staged)
// as the regression net for the useMemoAttach staging model (REVIEW-PASS theme 6).

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

async function stubPostbox(page: import('@playwright/test').Page) {
  await page.route('**/api/guest/window**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'postbox', householdName: 'Maison Tremblay' }) }),
  )
  await page.route('**/api/guest/postbox-media**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: 'pm_e2e' }) }),
  )
  const submits: Record<string, unknown>[] = []
  await page.route('**/api/guest/postbox-submit**', (r) => {
    try {
      submits.push(JSON.parse(r.request().postData() || '{}'))
    } catch {
      /* no body */
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  return submits
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1100 })
})

test('a text-only message sends with the sender name', async ({ page }) => {
  await mockApi(page)
  const submits = await stubPostbox(page)
  await seedState(page, { theme: 'day', lang: 'fr' })
  await page.goto('/courrier')

  await page.getByPlaceholder('Papi, Mamie, Tante Lou…').fill('Papi')
  await page.getByPlaceholder('Écris un petit mot…').fill('Bonne fête !')
  await page.getByRole('button', { name: 'Envoyer' }).click()

  await expect(page.getByText('Merci !')).toBeVisible()
  expect(submits).toHaveLength(1)
  expect(submits[0]).toMatchObject({ senderName: 'Papi', text: 'Bonne fête !' })
})

test('a photo is staged then sent with the message', async ({ page }) => {
  await mockApi(page)
  const submits = await stubPostbox(page)
  await seedState(page, { theme: 'day', lang: 'fr' })
  await page.goto('/courrier')

  await page.getByPlaceholder('Papi, Mamie, Tante Lou…').fill('Mamie')
  // The Record / Draw / Photo trio lives behind the message field's 📎 now
  // (useMemoAttach), so open it before the hidden file input exists.
  await page.locator('.memo-attach__btn').click()
  const staged = page.waitForResponse((r) => r.url().includes('/api/guest/postbox-media') && r.request().method() === 'POST')
  await page.locator('.scene.intake input[type="file"]').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: PNG })
  await staged
  await expect(page.locator('.memo-attach__chip')).toBeVisible() // the staged memo preview

  await page.getByRole('button', { name: 'Envoyer' }).click()
  await expect(page.getByText('Merci !')).toBeVisible()
  expect(submits[0]).toMatchObject({ senderName: 'Mamie', media_kind: 'image', media_key: 'pm_e2e' })
})

// D-18 reçu-✓ (bmad/10) — a returning sender (a durable/standing link, e.g. « Mamie »)
// sees a quiet confirmation line the NEXT time she opens the same link, once her prior
// message was accepted. Rides the same greeting fetch — no new poll, no unread state.
test('a returning sender sees a quiet reçu-✓ line for their last accepted message', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/guest/window**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kind: 'postbox',
        householdName: 'Maison Tremblay',
        receipt: { lastAcceptedAt: 1_720_000_000, snippet: 'Bonne fête' },
      }),
    }),
  )
  await seedState(page, { theme: 'day', lang: 'fr' })
  await page.goto('/courrier')

  await expect(page.getByText('Reçu ✓', { exact: false })).toBeVisible()
  await expect(page.getByText('Bonne fête', { exact: false })).toBeVisible()
})

// The missing case (D-18): a revoked STANDING durable link must read as "this link
// no longer works", not a stuck/broken form — the same GuestExpired every other guest
// scene (HandoffPage/WelcomePage/FamilyWindowPage) already shows on a 401/403.
test('a revoked link shows the expired state, not the form', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/guest/window**', (r) =>
    r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Forbidden.' }) }),
  )
  await seedState(page, { theme: 'day', lang: 'fr' })
  await page.goto('/courrier')

  await expect(page.locator('.guest-expired')).toBeVisible()
  await expect(page.getByPlaceholder('Papi, Mamie, Tante Lou…')).toHaveCount(0)
})

// A double-send must not create a second quarantine row (bmad/11 tier-2 #2).
//
// The two ordinary things a relative does — double-tapping « Envoyer » on a slow
// phone, and resending when the response is lost — each used to land a SECOND
// pending row in the operator's review queue, indistinguishable from a genuine
// second message. The server has deduped keyed writes for a long while
// (functions/_lib/idempotency.ts, applied centrally in authed()); this form just
// never sent a key, because a guest writes through raw api() rather than the
// outbox's useWrite.
//
// What this guards is the CLIENT half: that a key is sent at all, and that it is
// the SAME key across retries of one composed message — which is exactly what
// makes the server's ledger able to recognise the retry.
test('a resend carries the SAME Idempotency-Key, so the server can dedup it', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/guest/window**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'postbox', householdName: 'Maison Tremblay' }) }),
  )
  const keys: string[] = []
  let failFirst = true
  await page.route('**/api/guest/postbox-submit**', (r) => {
    keys.push(r.request().headers()['idempotency-key'] ?? '')
    // The first attempt fails, so the relative taps « Envoyer » again — the case.
    if (failFirst) {
      failFirst = false
      return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) })
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  await seedState(page, { theme: 'day', lang: 'fr' })
  await page.goto('/courrier')

  await page.getByPlaceholder('Papi, Mamie, Tante Lou…').fill('Papi')
  await page.getByPlaceholder('Écris un petit mot…').fill('Bonne fête !')
  const send = page.getByRole('button', { name: 'Envoyer' })
  await send.click()
  await expect.poll(() => keys.length).toBe(1)
  await send.click()
  await expect.poll(() => keys.length).toBe(2)

  expect(keys[0]).toBeTruthy()
  expect(keys[1]).toBe(keys[0])
})
