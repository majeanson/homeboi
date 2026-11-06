import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { anon, freshIp, household, login, okJson, type Session } from '../functions/test/d1'
import { nowSec, sha256Hex } from '../functions/_lib/ids'

// LES PORTES SANS SESSION against a real D1: how a tablet joins a household, how a person
// leaves one device, how a forgotten password comes back. Each has its own one-time rule,
// and each of those rules is a line of SQL.

const start = () => okJson<{ pairingId: string; code: string; expiresInSec: number }>(anon('/api/pair/start', { method: 'POST', headers: freshIp() }))
const poll = (pairingId: string) => okJson<{ status: string; deviceToken?: string; householdId?: string }>(anon(`/api/pair/poll?pairingId=${pairingId}`))
const claim = (s: Session, code: string, label?: string) => s.fetch('/api/pair/claim', { method: 'POST', body: { code, label } })
const devices = async (s: Session) => (await okJson<{ devices: { id: string; label: string; kind: string; revoked_at: number | null }[] }>(s.fetch('/api/pair/devices'))).devices
const pair = async (s: Session, label?: string) => {
  const { pairingId, code } = await start()
  const claimed = await okJson<{ deviceId: string }>(claim(s, code, label))
  const { deviceToken } = await poll(pairingId)
  return { deviceId: claimed.deviceId, token: deviceToken! }
}

describe('jumeler une tablette', () => {
  it('a code is shown, an operator claims it, the tablet collects its token exactly once', async () => {
    const s = await household('pair-flow', undefined, { empty: true })
    const { pairingId, code, expiresInSec } = await start()
    expect(code).toMatch(/^\d{6}$/)
    expect(expiresInSec).toBeGreaterThan(0)
    expect((await poll(pairingId)).status, 'nothing until an operator approves').toBe('pending')

    const { deviceId } = await okJson<{ deviceId: string; label: string }>(claim(s, code, '  Cuisine  '))
    const collected = await poll(pairingId)
    expect(collected).toMatchObject({ status: 'approved', householdId: s.householdId })
    expect(collected.deviceToken).toBeTruthy()

    const replay = await poll(pairingId)
    expect(replay.status).toBe('approved')
    expect(replay.deviceToken, 'a replayed poll cannot re-leak the token').toBeUndefined()

    expect((await devices(s)).find((d) => d.id === deviceId)).toMatchObject({ label: 'Cuisine', revoked_at: null })
    const board = await anon('/api/board', { headers: { 'X-Device-Token': collected.deviceToken! } })
    expect(board.status, 'the token opens the board').toBe(200)
  })

  it('a code is good once, must be six digits, and dies with its window', async () => {
    const s = await household('pair-once', undefined, { empty: true })
    const other = await household('pair-once-b', undefined, { empty: true })
    expect((await claim(s, '12ab')).status).toBe(400)
    const { code } = await start()
    await okJson(claim(s, code))
    expect((await claim(other, code)).status, 'already spent').toBe(404)

    const late = await start()
    await env.DB.prepare('UPDATE pairing_codes SET expires_at = ? WHERE id = ?').bind(nowSec() - 1, late.pairingId).run()
    expect((await poll(late.pairingId)).status).toBe('expired')
    expect((await claim(s, late.code)).status).toBe(409)
    expect((await poll('pas-un-code')).status, 'unknown reads as expired').toBe('expired')
    expect((await anon('/api/pair/poll')).status).toBe(400)
  })

  it('a device is renamed, and revoking it locks that tablet out at once', async () => {
    const s = await household('pair-revoke', undefined, { empty: true })
    const { deviceId, token } = await pair(s, 'Salon')
    await okJson(s.fetch('/api/pair/devices', { method: 'PATCH', body: { id: deviceId, label: '  Tablette du salon  ' } }))
    expect((await devices(s))[0].label).toBe('Tablette du salon')

    await okJson(s.fetch('/api/pair/devices', { method: 'POST', body: { revokeId: deviceId } }))
    expect((await devices(s))[0].revoked_at).toBeGreaterThan(0)
    expect((await anon('/api/board', { headers: { 'X-Device-Token': token } })).status).toBe(401)
  })

  it('a kiosk may write, but cannot pair another kiosk or touch the devices', async () => {
    const s = await household('pair-kiosk', undefined, { empty: true })
    const { token } = await pair(s)
    const kiosk = { 'X-Device-Token': token }
    expect((await anon('/api/list', { method: 'POST', body: { text: 'Lait' }, headers: kiosk })).status).toBe(200)
    const { code } = await start()
    expect((await anon('/api/pair/claim', { method: 'POST', body: { code }, headers: kiosk })).status).toBe(403)
    expect((await anon('/api/pair/devices', { headers: kiosk })).status).toBe(403)
  })

  it('a stranger cannot rename or revoke my tablet', async () => {
    const s = await household('pair-a', undefined, { empty: true })
    const other = await household('pair-b', undefined, { empty: true })
    const { deviceId, token } = await pair(s, 'Salon')
    await okJson(other.fetch('/api/pair/devices', { method: 'PATCH', body: { id: deviceId, label: 'Volée' } }))
    await okJson(other.fetch('/api/pair/devices', { method: 'POST', body: { revokeId: deviceId } }))
    expect((await devices(s))[0]).toMatchObject({ label: 'Salon', revoked_at: null })
    expect((await anon('/api/board', { headers: { 'X-Device-Token': token } })).status).toBe(200)
  })
})

describe('se déconnecter', () => {
  it('clears both cookies on this device and leaves the session valid elsewhere', async () => {
    const s = await household('logout', undefined, { empty: true })
    const res = await s.fetch('/api/auth/logout', { method: 'POST' })
    expect(res.status).toBe(200)
    const set = (res.headers as unknown as { getSetCookie(): string[] }).getSetCookie().join(' | ')
    expect(set).toMatch(/bb_session=;/)
    expect(set).toMatch(/bb_csrf=;/)
    expect(set).toMatch(/Max-Age=0/i)
  })
})

describe('un mot de passe oublié', () => {
  const issue = async (email: string, opts: { expires?: number } = {}) => {
    const token = `jeton-${Math.random().toString(36).slice(2)}`
    const now = nowSec()
    await env.DB.prepare('INSERT INTO password_resets (id, email, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(`r-${token}`, email, await sha256Hex(token), now, opts.expires ?? now + 3600)
      .run()
    return token
  }
  const reset = (token: string, password: string) => anon('/api/auth/reset', { method: 'POST', body: { token, password }, headers: freshIp() })

  it('a good link replaces the password, signs this device in, and ends every other session', async () => {
    const s = await household('reset-flow', undefined, { empty: true })
    const token = await issue(s.email)
    const res = await reset(token, 'un tout nouveau mot')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, email: s.email })
    const set = (res.headers as unknown as { getSetCookie(): string[] }).getSetCookie().join(' | ')
    expect(set, 'the next screen is the board, not a login form').toContain('bb_session=')

    expect((await s.fetch('/api/board')).status, 'half a reset would leave the old phone in').toBe(401)
    expect((await anon('/api/auth/login', { method: 'POST', body: { email: s.email, password: s.password }, headers: freshIp() })).status).toBe(401)
    await login(s.email, 'un tout nouveau mot')
  })

  it('a link works once; a spent, expired or invented one is the same refusal', async () => {
    const s = await household('reset-once', undefined, { empty: true })
    const used = await issue(s.email)
    await okJson(reset(used, 'un tout nouveau mot'))
    const spent = await reset(used, 'encore un autre mot')
    const expired = await reset(await issue(s.email, { expires: nowSec() - 1 }), 'encore un autre mot')
    const invented = await reset('pas-un-jeton', 'encore un autre mot')
    expect([spent.status, expired.status, invented.status]).toEqual([400, 400, 400])
    const [a, b, c] = await Promise.all([spent.json(), expired.json(), invented.json()])
    expect(a, 'saying which would let someone probe').toEqual(b)
    expect(b).toEqual(c)
    await login(s.email, 'un tout nouveau mot')
  })

  it('a short password is refused and does not spend the link', async () => {
    const s = await household('reset-short', undefined, { empty: true })
    const token = await issue(s.email)
    expect((await reset(token, 'court')).status).toBe(400)
    expect((await reset('', 'un tout nouveau mot')).status).toBe(400)
    await okJson(reset(token, 'un tout nouveau mot'))
  })
})

describe('l’autre parent', () => {
  const invite = async (s: Session) => new URL((await okJson<{ url: string }>(s.fetch('/api/operator-invite', { method: 'POST' }))).url).searchParams.get('j')!

  it('a link previews the household, joins it without creating one, and shares its data', async () => {
    const s = await household('join-flow', undefined, { empty: true })
    await okJson(s.fetch('/api/list', { method: 'POST', body: { text: 'Lait' } }))
    const token = await invite(s)
    expect(await okJson(anon(`/api/operator-join?j=${encodeURIComponent(token)}`))).toMatchObject({ householdName: 'Maisonnée join-flow' })

    const before = await env.DB.prepare('SELECT COUNT(*) AS n FROM households').first<{ n: number }>()
    const email = `partenaire-${Date.now()}@d1.test`
    await okJson(anon('/api/operator-join', { method: 'POST', body: { token, email, password: 'un mot de passe' }, headers: freshIp() }))
    const after = await env.DB.prepare('SELECT COUNT(*) AS n FROM households').first<{ n: number }>()
    expect(after!.n, 'the bug this door fixes: a partner got a household of their own').toBe(before!.n)

    const partner = await login(email, 'un mot de passe')
    expect(partner.householdId).toBe(s.householdId)
    expect(await (await partner.fetch('/api/list')).text()).toContain('Lait')
  })

  it('a rotated link is dead, and a taken email is not silently moved', async () => {
    const s = await household('join-rotate', undefined, { empty: true })
    const other = await household('join-rotate-b', undefined, { empty: true })
    const token = await invite(s)
    await okJson(s.fetch('/api/operator-invite', { method: 'DELETE', body: {} }))
    expect((await anon(`/api/operator-join?j=${encodeURIComponent(token)}`)).status, 'a rotated nonce kills the old link').toBe(403)
    const fresh = await invite(s)
    const taken = await anon('/api/operator-join', { method: 'POST', body: { token: fresh, email: other.email, password: 'un mot de passe' }, headers: freshIp() })
    expect(taken.status).toBe(409)
    expect((await login(other.email, other.password)).householdId).toBe(other.householdId)
  })
})
