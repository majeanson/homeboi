import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « Rejoindre une maisonnée » — the second adult's front door (migration 0128,
// functions/api/operator-join.ts, src/pages/JoinHouseholdPage.tsx).
//
// The bug this feature fixes is a SILENT one, which is why it needs a spec: a partner
// who signed up the obvious way got `ensureHouseholdForEmail`, i.e. a brand-new
// household seeded with the sample family. They did not see an empty app they would
// report — they saw a plausible board with somebody else's fake kids on it. Every
// assertion below is about making sure this page can never be mistaken for that one.

const TOKEN = 'tok-abc'
const JOIN = `/rejoindre?j=${TOKEN}`

/** Route the two operator-join calls. `preview` drives GET, `post` drives POST. */
async function routeJoin(
  page: Page,
  opts: {
    preview?: { status: number; body: unknown }
    post?: { status: number; body: unknown }
    onPost?: (body: unknown) => void
  },
) {
  await page.route('**/api/operator-join**', async (route) => {
    const req = route.request()
    if (req.method() === 'POST') {
      opts.onPost?.(req.postDataJSON())
      const r = opts.post ?? { status: 201, body: { ok: true, email: 'b@x.com', householdName: 'Chez Tremblay' } }
      return route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.body) })
    }
    const r = opts.preview ?? { status: 200, body: { householdName: 'Chez Tremblay' } }
    return route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.body) })
  })
}

test('the page names the household before asking for a password', async ({ page }) => {
  await mockApi(page, { signedIn: false })
  await routeJoin(page, {})
  await seedState(page, { theme: 'day', lang: 'fr', surface: 'mobile' })
  await page.goto(JOIN)

  // THE assertion of the whole feature. If this heading ever reads « Créer ta
  // maisonnée », the partner is one tap from the exact confusion 0128 exists to end.
  await expect(page.locator('h1')).toContainText('Chez Tremblay')
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toBeVisible()
  // No household-NAME field: you are joining one, not naming one. Two text inputs
  // would mean the join form had quietly grown back into the signup form.
  await expect(page.locator('input[type="text"]')).toHaveCount(0)
})

test('a dead link says so before the form, not after', async ({ page }) => {
  await mockApi(page, { signedIn: false })
  await routeJoin(page, { preview: { status: 403, body: { error: 'Ce lien d’invitation a été réinitialisé.' } } })
  await seedState(page, { theme: 'day', lang: 'fr', surface: 'mobile' })
  await page.goto(JOIN)

  await expect(page.locator('.status-msg')).toBeVisible()
  // Nothing to fill in — the point of asking the server FIRST is that nobody picks a
  // password for a link that was already dead.
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
})

test('no token at all explains itself instead of rendering a dead form', async ({ page }) => {
  await mockApi(page, { signedIn: false })
  await routeJoin(page, {})
  await seedState(page, { theme: 'day', lang: 'fr', surface: 'mobile' })
  await page.goto('/rejoindre')

  await expect(page.locator('.status-msg')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
})

test('joining posts the token and lands on the board', async ({ page }) => {
  await mockApi(page, { signedIn: false })
  let posted: unknown = null
  await routeJoin(page, { onPost: (b) => (posted = b) })
  await seedState(page, { theme: 'day', lang: 'fr', surface: 'mobile' })
  await page.goto(JOIN)

  await page.locator('input[type="email"]').fill('b@x.com')
  await page.locator('input[type="password"]').fill('motdepasse1')
  await page.locator('button[type="submit"]').click()

  await expect.poll(() => posted).not.toBeNull()
  // The token rides the BODY, not just the URL — it is the credential, and the
  // endpoint re-checks it against the household's live nonce.
  expect(posted).toMatchObject({ token: TOKEN, email: 'b@x.com' })
  await expect(page).toHaveURL(/\/board/)
})

test('the two 409s say different things — by code, not by matching French', async ({ page }) => {
  // This is the case that made ApiError carry a `code`. Both outcomes are honestly
  // conflicts, so they share a status; telling them apart by reading words out of the
  // message broke in English and would break again on any copy edit.
  await mockApi(page, { signedIn: false })
  await routeJoin(page, {
    post: { status: 409, body: { error: 'Ce courriel gère déjà une autre maisonnée.', code: 'other-household' } },
  })
  await seedState(page, { theme: 'day', lang: 'fr', surface: 'mobile' })
  await page.goto(JOIN)

  await page.locator('input[type="email"]').fill('b@x.com')
  await page.locator('input[type="password"]').fill('motdepasse1')
  await page.locator('button[type="submit"]').click()

  // « un compte, une maisonnée » — the dead-end sentence, which must NOT be the
  // reassuring "you already have access, just sign in" one.
  await expect(page.locator('.status-msg')).toContainText('une autre maisonnée')
  await expect(page.locator('.status-msg')).not.toContainText('a déjà accès')
  // …and it stays on the page: the fix is a different address, not a sign-in.
  await expect(page).toHaveURL(/rejoindre/)
})

test('the already-a-member 409 offers the sign-in door instead', async ({ page }) => {
  await mockApi(page, { signedIn: false })
  await routeJoin(page, {
    post: { status: 409, body: { error: 'Ce courriel a déjà accès à cette maisonnée.', code: 'already-member' } },
  })
  await seedState(page, { theme: 'day', lang: 'fr', surface: 'mobile' })
  await page.goto(JOIN)

  await page.locator('input[type="email"]').fill('b@x.com')
  await page.locator('input[type="password"]').fill('motdepasse1')
  await page.locator('button[type="submit"]').click()

  await expect(page.locator('.status-msg')).toContainText('a déjà accès')
  await expect(page.locator('.status-msg a[href="/login"]')).toBeVisible()
})
