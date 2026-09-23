import { test, expect, type Request } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « Confirme ton courriel » (0138) — the page the emailed link lands on, and the nudge.
//
// The page's whole job is to REDEEM ON ARRIVAL and report, so what is worth pinning is
// that it posts without being asked, that it says the right thing in each of the three
// outcomes, and — the one a reader would doubt — that StrictMode's double mount does not
// spend the single-use token twice and turn a success into « déjà servi ».

const isApi = (method: string, path: string) => (r: Request) =>
  r.method() === method && new URL(r.url()).pathname === `/api/${path}`

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('the link redeems on arrival and says so', async ({ page }) => {
  await mockApi(page, { signedIn: false })
  await seedState(page, { theme: 'day', lang: 'fr' })
  await page.route('**/api/auth/verify**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
  )

  const post = page.waitForRequest(isApi('POST', 'auth/verify'))
  await page.goto('/verifier?t=abc123')
  const body = (await (await post).postDataJSON()) as { token: string }
  expect(body.token).toBe('abc123')
  await expect(page.locator('main')).toContainText('confirmé')
})

test('it redeems ONCE — the double mount must not spend the token twice', async ({ page }) => {
  await mockApi(page, { signedIn: false })
  await seedState(page, { theme: 'day', lang: 'fr' })
  let calls = 0
  await page.route('**/api/auth/verify**', (route) => {
    calls++
    // A single-use token: the SECOND redemption of the same one fails, exactly as the
    // server behaves. Without the latch in VerifyPage the page would report failure
    // over a verification that had just succeeded.
    return route.fulfill(
      calls === 1
        ? { status: 200, contentType: 'application/json', body: '{"ok":true}' }
        : { status: 400, contentType: 'application/json', body: '{"error":"spent"}' },
    )
  })

  await page.goto('/verifier?t=once')
  await expect(page.locator('main')).toContainText('confirmé')
  await page.waitForTimeout(400)
  expect(calls, 'the token was redeemed more than once').toBe(1)
})

test('a spent or missing link is one calm sentence and a way on', async ({ page }) => {
  await mockApi(page, { signedIn: false })
  await seedState(page, { theme: 'day', lang: 'fr' })
  await page.route('**/api/auth/verify**', (route) =>
    route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"spent"}' }),
  )
  await page.goto('/verifier?t=spent')
  await expect(page.locator('main')).toContainText('déjà servi')
  await expect(page.getByRole('link', { name: 'Ouvrir Réglages' })).toBeVisible()

  // …and no token at all takes the same path, without asking the server anything.
  await page.goto('/verifier')
  await expect(page.locator('main')).toContainText('déjà servi')
})

test('an unverified account is told why the two doors are closed, and can resend', async ({ page }) => {
  // `verified: false` on auth/me is the only difference from an ordinary operator —
  // routed directly rather than through `overrides`, because the harness serves auth/me
  // from a fixed constant (mocks.ts) and an override of it is silently ignored.
  await mockApi(page)
  await page.route('**/api/auth/me**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        signedIn: true,
        email: 'famille@exemple.ca',
        household: { id: 'h1', name: 'Maison Tremblay', tier: 'free' },
        verified: false,
      }),
    }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/settings?tab=settings&lens=regler&sub=tablets')
  const panel = page.locator('#operator-panel')
  // TWO of them, and that is the design rather than a duplicate: the account section
  // explains the state and carries the resend, and « L'autre parent » explains why its
  // own button is disabled where the person is looking at it.
  await expect(panel.getByText(/pas encore confirmé/)).toHaveCount(2)
  await expect(panel.getByText(/pas encore confirmé/).first()).toBeVisible()

  const post = page.waitForRequest(isApi('POST', 'auth/verify'))
  await panel.getByRole('button', { name: 'Renvoyer le lien' }).click()
  expect(new URL((await post).url()).search).toContain('resend')
  await expect(panel.getByText(/C’est parti/)).toBeVisible()
})
