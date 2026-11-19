import { test, expect, type Request, type Page, type Route } from '@playwright/test'
import { mockApi, seedState } from './mocks'
import { boxOf } from './measure'
import { test as test4 } from './fixtures'

// JOURNEY — ACCOUNT (review #43; was password-reset.spec.ts + verify-email.spec.ts + operator-join.spec.ts + sessions.spec.ts + leave-and-legal.spec.ts).
//
// « Mot de passe oublié » (STATE.md §4-K wave 3): /login → /oubli → the email's link →
// /reinitialiser?t= → the board. The server is stubbed; what this pins is the SHAPE the
// stranger meets: one door on /login (hidden when the deployment has no mail), the same
// success sentence whatever the address, a calm 503 face, a spent link's one sentence
// with the way back, and a reset that lands on the board signed in.

test.describe('password-reset', () => {
  test('/login offers the door only when the deployment can send mail', async ({ page }) => {
    await mockApi(page, { signedIn: false, overrides: { health: { ok: true, ai: false, photos: false, realtime: false, mail: true } } })
    await page.goto('/login')
    await expect(page.getByRole('link', { name: 'Mot de passe oublié ?' })).toBeVisible()
  })

  test('…and hides it when it cannot — a door that leads nowhere is worse than none', async ({ page }) => {
    await mockApi(page, { signedIn: false, overrides: { health: { ok: true, ai: false, photos: false, realtime: false, mail: false } } })
    await page.goto('/login')
    await expect(page.locator('form.auth__card')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Mot de passe oublié ?' })).toHaveCount(0)
  })

  test('/oubli answers the same sentence whatever the address — nothing to enumerate', async ({ page }) => {
    await mockApi(page, { signedIn: false })
    await page.goto('/oubli')
    await page.getByLabel('Courriel').fill('personne@exemple.ca')
    await page.getByRole('button', { name: 'Envoyer le lien' }).click()
    await expect(page.locator('[data-state="sent"]')).toBeVisible()
    await expect(page.locator('[data-state="sent"]')).toContainText('Si un compte existe')
    await expect(page.getByRole('link', { name: 'Retour à la connexion' })).toBeVisible()
  })

  test('/oubli on a deployment without mail says so, calmly, and keeps the form', async ({ page }) => {
    await mockApi(page, { signedIn: false })
    await page.route('**/api/auth/forgot', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'no mail' }) }),
    )
    await page.goto('/oubli')
    await page.getByLabel('Courriel').fill('personne@exemple.ca')
    await page.getByRole('button', { name: 'Envoyer le lien' }).click()
    await expect(page.locator('form.auth__card')).toContainText('pas encore branché')
  })

  test('/reinitialiser without a token explains and offers a new link', async ({ page }) => {
    await mockApi(page, { signedIn: false })
    await page.goto('/reinitialiser')
    await expect(page.locator('[data-state="no-token"]')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Demander un nouveau lien' })).toBeVisible()
  })

  test('a spent or expired link is ONE sentence and the way back', async ({ page }) => {
    await mockApi(page, { signedIn: false })
    await page.route('**/api/auth/reset', (route) =>
      route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Ce lien ne fonctionne plus.' }) }),
    )
    await page.goto('/reinitialiser?t=abc')
    await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('motdepasse1')
    await page.getByLabel('Confirme le mot de passe').fill('motdepasse1')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.locator('form.auth__card')).toContainText('ne fonctionne plus')
    await expect(page.getByRole('link', { name: 'Demander un nouveau lien' })).toBeVisible()
  })

  test('two different passwords never leave the page', async ({ page }) => {
    await mockApi(page, { signedIn: false })
    let posted = false
    await page.route('**/api/auth/reset', (route) => {
      posted = true
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    })
    await page.goto('/reinitialiser?t=abc')
    await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('motdepasse1')
    await page.getByLabel('Confirme le mot de passe').fill('motdepasse2')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.locator('form.auth__card')).toContainText('pas pareils')
    expect(posted).toBe(false)
  })

  test('a good link sets the password and lands on the board, signed in', async ({ page }) => {
    // The stub signs the visitor in on the reset POST: auth/me flips to a session.
    let reset = false
    await mockApi(page, { signedIn: false })
    await page.route('**/api/auth/reset', (route) => {
      reset = true
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, email: 'famille@exemple.ca' }) })
    })
    await page.route('**/api/auth/me', (route) =>
      reset
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedIn: true, email: 'famille@exemple.ca', household: { id: 'h1', name: 'Maison Tremblay' } }) })
        : route.fallback(),
    )
    await page.goto('/reinitialiser?t=abc')
    await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('motdepasse1')
    await page.getByLabel('Confirme le mot de passe').fill('motdepasse1')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page).toHaveURL(/\/board/)
  })

  // The press blurs the field. If that moves the button, press and release land on different
  // things and the click is lost: the first try on every auth form did nothing on a desktop.
  for (const route of ['/oubli', '/login', '/signup', '/reinitialiser?t=abc']) {
    test(`${route}: pressing submit does not move it`, async ({ page }) => {
      await mockApi(page, { signedIn: false })
      await page.goto(route)
      const submit = page.locator('form.auth__card button[type="submit"]')
      await page.locator('form.auth__card input').first().fill('Motdepasse123!')
      const before = await boxOf(submit)
      await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
      await page.mouse.down()
      await expect.poll(async () => (await boxOf(submit)).y).toBe(before.y)
      await page.mouse.up()
    })
  }
})

// ── folded from verify-email.spec.ts ──────────────────────────────────────────────
test.describe('verify-email', () => {
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
    // Proving the token was not redeemed twice: nothing marks an absence, so give it the time it would have taken.
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
})


// ── folded from operator-join.spec.ts ──────────────────────────────────────────────
test.describe('operator-join', () => {
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

  test('a co-operator can be removed — and never yourself from that row', async ({ page }) => {
    // The PARITY D1 gap: minting and rotating shipped, and once someone had REDEEMED a
    // link there was no way out. « Réinitialiser » kills the outstanding links, not the
    // access already granted — which is exactly the case that matters when an invite
    // goes to the wrong address.
    await mockApi(page)
    const deleted: unknown[] = []
    await page.route('**/api/operator-invite**', async (route) => {
      const req = route.request()
      if (req.method() === 'DELETE') {
        deleted.push(req.postDataJSON())
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      }
      if (req.method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            operators: [
              { email: 'a@x.com', createdAt: 1, isSelf: true },
              { email: 'b@x.com', createdAt: 2, isSelf: false },
            ],
          }),
        })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })
    await seedState(page, { theme: 'day', lang: 'fr', surface: 'mobile' })
    await page.goto('/settings?tab=settings&focus=coop&lens=regler')

    const card = page.locator('#op-coop')
    await expect(card).toBeVisible()
    const rows = card.locator('.operator__list-row')
    await expect(rows).toHaveCount(2)

    // Your OWN row offers no delete: removing it logs you out of a household you may be
    // the only operator of, from a button whose label says nothing about that.
    await expect(rows.nth(0).locator('.row-actions')).toHaveCount(0)
    await expect(rows.nth(1).locator('.row-actions')).toHaveCount(1)

    await rows.nth(1).locator('.row-actions button').last().click()
    // The confirm names what is lost AND what is not — nothing they wrote goes with
    // them, because attribution is a soft member ref and never an operator FK.
    const dialog = page.locator('.confirm')
    await expect(dialog).toContainText('rien ne se perd')
    // …and it asks for YOUR password (2026-09-16, STATE §4-L L5): the cookie proves
    // someone in the house, not the account's owner. Empty → the button waits.
    const go = dialog.getByRole('button', { name: 'Retirer l’accès' })
    await expect(go).toBeDisabled()
    await dialog.locator('input[type=password]').fill('correct horse')
    await go.click()

    await expect.poll(() => deleted.length).toBe(1)
    expect(deleted[0]).toMatchObject({ email: 'b@x.com', password: 'correct horse' })
  })
})


// ── folded from sessions.spec.ts ──────────────────────────────────────────────
test4.describe('sessions', () => {
  // « Mes connexions » — Réglages ▸ Système ▸ Appareils & accès (STATE.md §4-L L12).
  // Two doors an account never had: change the password while signed in, and end every
  // OTHER device's session (migration 0134). Both password-gated. Operator-only: a kiosk,
  // a guest and a sandbox never see the card.

  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })
  const URL_ = '/settings?tab=settings&focus=sessions&lens=regler'

  test4('the operator sees the card, with both doors', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 } })
    await page.goto(URL_)
    const card = page.locator('#op-sessions')
    await expect(card).toBeVisible()
    await expect(card.getByRole('button', { name: 'Déconnecter partout ailleurs' })).toBeVisible()
    await expect(card.getByText('Changer mon mot de passe')).toBeVisible()
  })

  test4('« Changer mon mot de passe » posts current + next, and refuses a mismatch without leaving the page', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 } })
    const posted: unknown[] = []
    await page.route('**/api/auth/password', (route: Route) => {
      posted.push(route.request().postDataJSON())
      return route.fulfill(json({ ok: true }))
    })
    await page.goto(URL_)
    const card = page.locator('#op-sessions')
    await card.getByText('Changer mon mot de passe').click()
    await card.getByLabel('Mot de passe actuel').fill('old password 1')
    await card.getByLabel(/Nouveau mot de passe/).fill('new password 12')
    await card.getByLabel('Encore une fois').fill('different one 12')
    await card.getByRole('button', { name: 'Changer le mot de passe' }).click()
    await expect(card.getByText('Les deux nouveaux mots de passe ne sont pas pareils.')).toBeVisible()
    expect(posted).toHaveLength(0)

    await card.getByLabel('Encore une fois').fill('new password 12')
    await card.getByRole('button', { name: 'Changer le mot de passe' }).click()
    await expect.poll(() => posted.length).toBe(1)
    expect(posted[0]).toEqual({ current: 'old password 1', next: 'new password 12' })
    await expect(card.getByText(/Mot de passe changé/)).toBeVisible()
  })

  test4('« Déconnecter partout ailleurs » asks for the password in the confirm, then posts it', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 } })
    const posted: unknown[] = []
    await page.route('**/api/auth/sessions/revoke', (route: Route) => {
      posted.push(route.request().postDataJSON())
      return route.fulfill(json({ ok: true }))
    })
    await page.goto(URL_)
    await page.locator('#op-sessions').getByRole('button', { name: 'Déconnecter partout ailleurs' }).click()
    const dialog = page.locator('.confirm')
    await expect(dialog).toContainText('Celui-ci reste ouvert')
    // Nothing typed → the confirm button waits.
    const go = dialog.getByRole('button', { name: 'Déconnecter partout ailleurs' })
    await expect(go).toBeDisabled()
    await dialog.locator('input[type=password]').fill('correct horse')
    await go.click()
    await expect.poll(() => posted.length).toBe(1)
    expect(posted[0]).toEqual({ password: 'correct horse' })
    await expect(page.locator('#op-sessions').getByText(/les autres appareils sont déconnectés/)).toBeVisible()
  })

  test4('a wrong password is one calm sentence, not a crash', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 } })
    await page.route('**/api/auth/sessions/revoke', (route: Route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Mot de passe invalide.' }) }))
    await page.goto(URL_)
    await page.locator('#op-sessions').getByRole('button', { name: 'Déconnecter partout ailleurs' }).click()
    const dialog = page.locator('.confirm')
    await dialog.locator('input[type=password]').fill('nope')
    await dialog.getByRole('button', { name: 'Déconnecter partout ailleurs' }).click()
    await expect(page.locator('#op-sessions').getByText('Mot de passe invalide.')).toBeVisible()
  })

  test4('a paired kiosk and a link guest never see the card', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 }, api: { signedIn: false } })
    await page.addInitScript(() => localStorage.setItem('babillard-device-token', 'e2e-device-token'))
    await page.goto(URL_)
    await page.locator('.operator').waitFor({ state: 'visible', timeout: 15_000 })
    await expect(page.locator('#op-sessions')).toHaveCount(0)

    await app.boot({ viewport: { width: 390, height: 844 }, api: { signedIn: false } })
    await page.route('**/api/guest/whoami**', (route: Route) => route.fulfill(json({ kind: 'showcase' })))
    await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
    await page.goto(URL_)
    await page.locator('.operator').waitFor({ state: 'visible', timeout: 15_000 })
    await expect(page.locator('#op-sessions')).toHaveCount(0)
  })
})


// ── folded from leave-and-legal.spec.ts ──────────────────────────────────────────────
test.describe('leave-and-legal', () => {
  // Wave 4 — a household can leave, and knows the terms.
  //
  // Three surfaces, one question each:
  //   · the leave door must be HARD to fire by accident and must send what it promises;
  //   · the two public documents must render for someone who is not signed in — that is
  //     the whole point of them, and it is the case a settings-only spec never covers;
  //   · the contact block must appear only when the deployment HAS an address, because a
  //     privacy policy that prints « contact: » and then nothing is worse than silence.

  const isApi = (method: string, path: string) => (r: Request) =>
    r.method() === method && new URL(r.url()).pathname === `/api/${path}`

  const TAKEOUT = '/settings?tab=settings&sub=tablets&focus=takeout'

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  test('the leave door will not fire until the household name is typed', async ({ page }) => {
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto(TAKEOUT)
    const panel = page.locator('#operator-panel')

    await panel.getByRole('button', { name: 'Supprimer la maisonnée' }).click()
    const go = panel.getByRole('button', { name: 'Supprimer pour de bon' })
    await expect(go).toBeDisabled()

    // A near-miss stays disabled. This is the lock: the name has to be READ.
    const field = panel.getByPlaceholder('Le nom de la maisonnée')
    await field.fill('Maison Trembley')
    await expect(go).toBeDisabled()

    // …and case and accents are folded, because a capital is a typing accident and not a
    // different household (the endpoint folds them identically).
    await field.fill('maison tremblay')
    await expect(go).toBeEnabled()
  })

  test('the leave door sends the password AND the name, and only after the confirm', async ({ page }) => {
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto(TAKEOUT)
    const panel = page.locator('#operator-panel')

    await panel.getByRole('button', { name: 'Supprimer la maisonnée' }).click()
    await panel.getByPlaceholder('Le nom de la maisonnée').fill('Maison Tremblay')
    await panel.getByRole('button', { name: 'Supprimer pour de bon' }).click()

    // The password dialog is the second lock — nothing has been sent yet.
    const dialog = page.locator('.confirm')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('rien ne se récupère')

    const del = page.waitForRequest(isApi('DELETE', 'household'))
    await dialog.getByRole('textbox').fill('correct horse battery')
    await dialog.getByRole('button', { name: 'Supprimer pour de bon' }).click()
    const body = (await (await del).postDataJSON()) as { password: string; name: string }
    expect(body).toMatchObject({ password: 'correct horse battery', name: 'Maison Tremblay' })
  })

  // « Repartir à neuf » (2026-09-23) — the little sibling: the same two deliberate acts
  // (the name, then the password), a POST instead of the DELETE, and the session SURVIVES,
  // so the page stays and says it is done instead of leaving for the marketing door.
  test('the start-over door locks like leaving, POSTs the reset, and stays signed in', async ({ page }) => {
    await mockApi(page)
    await page.route('**/api/household/reset', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    )
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto(TAKEOUT)
    const panel = page.locator('#operator-panel')

    await panel.getByRole('button', { name: 'Repartir à neuf' }).click()
    const go = panel.getByRole('button', { name: 'Tout vider' })
    await expect(go).toBeDisabled()
    await panel.getByPlaceholder('Le nom de la maisonnée').fill('maison tremblay')
    await expect(go).toBeEnabled()
    await go.click()

    const dialog = page.locator('.confirm')
    await expect(dialog).toContainText('le compte, les appareils et les réglages restent')
    const post = page.waitForRequest(isApi('POST', 'household/reset'))
    await dialog.getByRole('textbox').fill('correct horse battery')
    await dialog.getByRole('button', { name: 'Tout vider' }).click()
    const body = (await (await post).postDataJSON()) as { password: string; name: string }
    expect(body).toMatchObject({ password: 'correct horse battery', name: 'maison tremblay' })

    await expect(panel).toContainText('C’est vidé')
    await expect(page).toHaveURL(/\/settings/)
  })

  test('the two documents render for someone who is not signed in', async ({ page }) => {
    // signedIn: false is the case that matters — a stranger reads these BEFORE deciding,
    // and a page that needs a session would 401 its way into an empty shell.
    await mockApi(page, { signedIn: false })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })

    await page.goto('/confidentialite')
    await expect(page.getByRole('heading', { name: 'Confidentialité', level: 1 })).toBeVisible()
    // The claims that must be there, because they are the ones that are checkable:
    // where the data lives, what the AI sends, and the deletion right.
    await expect(page.locator('main')).toContainText('Cloudflare')
    await expect(page.locator('main')).toContainText('Supprimer la maisonnée')

    await page.goto('/conditions')
    await expect(page.getByRole('heading', { name: 'Conditions d’utilisation', level: 1 })).toBeVisible()
    await expect(page.locator('main')).toContainText('Québec')
  })

  test('the marketing door links to both, and the links work', async ({ page }) => {
    await mockApi(page)
    // Brand-new visitor: the smart entry shows <Home> only when the session is REFUSED,
    // so auth/me has to 401 (the journey-first-visit.spec.ts idiom). `signedIn: false` on its
    // own leaves the entry sending us to /board, and the door is never rendered.
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
    await seedState(page, { theme: 'day', lang: 'fr' })
    await page.goto('/')
    await page.locator('.home').waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByRole('link', { name: 'Confidentialité' }).first().click()
    await expect(page).toHaveURL(/\/confidentialite/)
  })

  test('the contact block appears only when the deployment has an address', async ({ page }) => {
    // Default fixture: no `contact` key at all → the page must say so plainly rather than
    // print an empty mailto.
    await mockApi(page, { signedIn: false })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/confidentialite')
    await expect(page.locator('main')).toContainText('opéré en privé')
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0)
  })

  test('…and when it does, it is a real mailto', async ({ page }) => {
    await mockApi(page, {
      signedIn: false,
      overrides: { health: { ai: true, aiAvailable: true, rateLimit: true, alerts: true, contact: 'allo@babillard.test' } },
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/confidentialite')
    await expect(page.locator('a[href="mailto:allo@babillard.test"]')).toBeVisible()
  })
})
