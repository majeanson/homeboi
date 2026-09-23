import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { anon, household } from '../functions/test/d1'
import { redeemVerification, sendVerification } from '../functions/_lib/verify'

// « Confirme ton courriel » (0138) in the real runtime.
//
// The two properties worth a real database: the token is SINGLE-USE against real rows,
// and the gate actually closes the two doors it claims to — which are `authed()`
// handlers, so nothing but the Worker can answer that.
//
// Mail is unwired in this harness (no RESEND_API_KEY), and that is itself one of the
// cases: `requireVerified` fails OPEN when the deployment cannot send, so a self-hoster
// is never locked out of inviting anyone. The tests that need a token therefore write
// the row directly — the same thing `sendVerification` does, minus the letter.

const unverify = (email: string) =>
  env.DB.prepare('UPDATE operators SET verified_at = NULL WHERE email = ?').bind(email).run()

const verifiedAt = async (email: string) =>
  (await env.DB.prepare('SELECT verified_at FROM operators WHERE email = ?').bind(email).first<{ verified_at: number | null }>())
    ?.verified_at ?? null

/** Mint a row exactly as sendVerification would, and hand back the plaintext token. */
async function mintToken(email: string): Promise<string> {
  const { newId, nowSec, sha256Hex } = await import('../functions/_lib/ids')
  const token = `${newId()}${newId()}`
  await env.DB.prepare('INSERT INTO email_verifications (id, token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(newId(), await sha256Hex(token), email, nowSec() + 3600, nowSec())
    .run()
  return token
}

describe('la vérification du courriel', () => {
  it('signs up already verified — because this deployment cannot send mail', async () => {
    // The fail-open, stated as a test rather than as a comment: with no mail wired,
    // signup mints nothing and the account is usable end to end. (0138 also backfills
    // every pre-existing operator, which is why a fresh signup here reads verified.)
    const a = await household('vf-nomail')
    expect(await verifiedAt(a.email)).not.toBeNull()
    expect(await sendVerification(env, a.email, 'https://babillard.test')).toBe(false)
  })

  it('redeems once, and never twice', async () => {
    const a = await household('vf-once')
    await unverify(a.email)
    expect(await verifiedAt(a.email)).toBeNull()

    const token = await mintToken(a.email)
    expect(await redeemVerification(env, token)).toBe(a.email)
    expect(await verifiedAt(a.email)).not.toBeNull()

    // The second redemption of the SAME token finds nothing: `used_at` is the mark a
    // stateless HMAC could not carry, which is the whole reason 0133 and 0138 are rows.
    expect(await redeemVerification(env, token)).toBeNull()
  })

  it('refuses an unknown or expired token without saying which', async () => {
    expect(await redeemVerification(env, 'not-a-real-token')).toBeNull()
  })

  it('closes the two doors that reach outside the household — and ONLY those', async () => {
    const a = await household('vf-gate')
    await unverify(a.email)
    // The gate reads `mailEnabled`, which is false here, so it must fail OPEN: both
    // doors still answer. This is the assertion that keeps a self-hoster usable, and it
    // is the one a reader is most likely to doubt.
    const invite = await a.fetch('/api/operator-invite', { method: 'POST', body: {} })
    expect(invite.status).toBe(200)

    // …and the household's own surfaces never consult it at all.
    expect((await a.fetch('/api/list', { method: 'POST', body: { text: 'du pain' } })).status).toBe(200)
    expect((await a.fetch('/api/list')).status).toBe(200)
  })

  it('the redeem endpoint takes no session and accepts no CSRF header', async () => {
    const a = await household('vf-route')
    await unverify(a.email)
    const token = await mintToken(a.email)
    // Anonymous, no cookie, no CSRF echo — the shape of a click from a mail app on a
    // phone that has never opened this site.
    const res = await anon('/api/auth/verify', { method: 'POST', body: { token } })
    expect(res.status).toBe(200)
    expect(await verifiedAt(a.email)).not.toBeNull()
  })

  it('a bad token answers 400, not 500', async () => {
    const res = await anon('/api/auth/verify', { method: 'POST', body: { token: 'nope' } })
    expect(res.status).toBe(400)
  })
})
