import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { anon, household, login } from '../functions/test/d1'

// The account flows end to end, through the real Worker and a real D1 (STATE.md §4-L
// L1 + L2, proven here rather than against a one-row stub).
describe('account', () => {
  it('signs up, refuses a wrong password, accepts the right one', async () => {
    const a = await household('acct')
    expect((await anon('/api/auth/login', { method: 'POST', body: { email: a.email, password: 'wrong wrong wrong' } })).status).toBe(401)
    const again = await login(a.email, a.password)
    expect(again.householdId).toBe(a.householdId)
  })

  it('an unknown email is refused at login — login never creates a household', async () => {
    // The harness runs with the invite code unset, which is exactly the shape that made
    // the old « first login creates the household » path a passwordless signup door
    // with no invite question. Red against restoring that path (it answered 200).
    const before = await env.DB.prepare('SELECT COUNT(*) AS n FROM households').first<{ n: number }>()
    // Its own caller address (the demo.d1 precedent): the whole file shares one LIMIT_IP
    // bucket, and the rate-limit case below counts on the budget this request would take.
    const res = await anon('/api/auth/login', {
      method: 'POST',
      body: { email: `stranger-${Date.now()}@d1.test`, password: 'anything at all' },
      headers: { 'CF-Connecting-IP': '10.2.0.1' },
    })
    expect(res.status).toBe(401)
    const after = await env.DB.prepare('SELECT COUNT(*) AS n FROM households').first<{ n: number }>()
    expect(after!.n).toBe(before!.n)
  })

  it('a row without a password_hash is refused at login, and at the password door', async () => {
    // The accounts the old first-login path created had no hash of their own and signed
    // in with the shared LOGIN_PASSWORD — which the harness left unset, so in THIS suite
    // any password used to pass. Production was counted on 2026-09-25: zero such rows.
    // The branch is gone; what must hold now is the inverse — a hash-less row opens
    // nothing, the sudo door refuses it too, and nothing new is made. Red against
    // restoring the legacy branch in either file (both answered 200 / passed here).
    const a = await household('legacy', undefined, { empty: true })
    await env.DB.prepare('UPDATE operators SET password_hash = NULL WHERE email = ?').bind(a.email).run()
    const before = await env.DB.prepare('SELECT COUNT(*) AS n FROM households').first<{ n: number }>()
    const res = await anon('/api/auth/login', {
      method: 'POST',
      // Typed the way people type it — the door lowercases, and every row is stored lowercased.
      body: { email: `  ${a.email.toUpperCase()} `, password: 'the shared code' },
      headers: { 'CF-Connecting-IP': '10.2.0.2' },
    })
    expect(res.status).toBe(401)
    const after = await env.DB.prepare('SELECT COUNT(*) AS n FROM households').first<{ n: number }>()
    expect(after!.n).toBe(before!.n)
    // The session minted at signup is still valid (nothing revoked it) — and even so,
    // the password door has nothing to compare against.
    expect((await a.fetch('/api/auth/sessions/revoke', { method: 'POST', body: { password: 'the shared code' } })).status).toBe(403)
    expect((await a.fetch('/api/auth/sessions/revoke', { method: 'POST', body: { password: a.password } })).status).toBe(403)
  })

  it('« Se déconnecter partout ailleurs » ends the other device’s session and keeps this one', async () => {
    const phone = await household('revoke')
    const laptop = await login(phone.email, phone.password)
    // Both devices work.
    expect((await phone.fetch('/api/board')).status).toBe(200)
    expect((await laptop.fetch('/api/board')).status).toBe(200)

    // Wrong password: refused, nothing changes.
    expect((await laptop.fetch('/api/auth/sessions/revoke', { method: 'POST', body: { password: 'nope nope nope' } })).status).toBe(403)
    expect((await phone.fetch('/api/board')).status).toBe(200)

    // Right password from the laptop: the phone is out, the laptop's OLD cookie is out
    // too, and the laptop's re-issued cookie works.
    const res = await laptop.fetch('/api/auth/sessions/revoke', { method: 'POST', body: { password: phone.password } })
    expect(res.status).toBe(200)
    expect((await phone.fetch('/api/board')).status).toBe(401)
    expect(((await (await phone.fetch('/api/auth/me')).json()) as { signedIn: boolean }).signedIn).toBe(false)
    expect((await laptop.fetch('/api/board')).status).toBe(401)
    const fresh = (res.headers as unknown as { getSetCookie(): string[] }).getSetCookie().map((c: string) => c.split(';')[0])
    const cookie = fresh.join('; ')
    const csrf = fresh.find((c: string) => c.startsWith('bb_csrf='))!.slice('bb_csrf='.length)
    expect((await anon('/api/board', { headers: { Cookie: cookie, 'X-CSRF-Token': csrf } })).status).toBe(200)
  })

  it('« Changer mon mot de passe » replaces it, signs the other devices out, and needs the current one', async () => {
    const a = await household('pw')
    const other = await login(a.email, a.password)
    expect((await a.fetch('/api/auth/password', { method: 'POST', body: { current: 'wrong wrong wrong', next: 'new password here' } })).status).toBe(403)
    expect((await a.fetch('/api/auth/password', { method: 'POST', body: { current: a.password, next: 'short' } })).status).toBe(400)
    expect((await a.fetch('/api/auth/password', { method: 'POST', body: { current: a.password, next: 'new password here' } })).status).toBe(200)
    expect((await other.fetch('/api/board')).status).toBe(401)
    expect((await anon('/api/auth/login', { method: 'POST', body: { email: a.email, password: a.password } })).status).toBe(401)
    expect((await login(a.email, 'new password here')).householdId).toBe(a.householdId)
  })

  it('the password doors are operator-only and CSRF-gated', async () => {
    const a = await household('csrf')
    // No CSRF echo → the Worker's gate refuses before any handler.
    const res = await anon('/api/auth/sessions/revoke', { method: 'POST', body: { password: a.password }, headers: { Cookie: a.cookie } })
    expect(res.status).toBe(403)
    expect((await a.fetch('/api/board')).status).toBe(200)
  })

  it('« Mot de passe oublié » answers 503 while mail is not wired, never a hint about the address', async () => {
    const a = await household('forgot')
    expect((await anon('/api/auth/forgot', { method: 'POST', body: { email: a.email } })).status).toBe(503)
    expect((await anon('/api/auth/forgot', { method: 'POST', body: { email: 'nobody@d1.test' } })).status).toBe(503)
  })

  it('the rate limit refuses the seventh guess at one email inside a minute (LIMIT_KEY 6/60s)', async () => {
    const a = await household('limit')
    // Its own caller address, so what this case measures is LIMIT_KEY (per email) alone —
    // on the shared harness address, every earlier login in the file eats LIMIT_IP first.
    const ip = { 'CF-Connecting-IP': '10.2.0.9' }
    const statuses: number[] = []
    for (let i = 0; i < 8; i++) {
      statuses.push((await anon('/api/auth/login', { method: 'POST', body: { email: a.email, password: `guess ${i} guess` }, headers: ip })).status)
    }
    expect(statuses.slice(0, 6)).toEqual([401, 401, 401, 401, 401, 401])
    expect(statuses[7], `statuses: ${statuses.join(',')}`).toBe(429)
    // …and the right password is refused too while the bucket is full: a bound, not a hint.
    expect((await anon('/api/auth/login', { method: 'POST', body: { email: a.email, password: a.password }, headers: ip })).status).toBe(429)
  })
})
