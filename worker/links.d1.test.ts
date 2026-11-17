import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { anon, freshIp, household, login, okJson, type Session } from '../functions/test/d1'

// P0 #7 (review 2026-11-17): links and sessions that outlived what their owner meant.

const as = (token: string, path: string) => anon(path, { headers: { 'X-Device-Token': token } })

describe('a showcase link reads no mots', () => {
  it('neither the notes door nor the board poll carries the household’s fridge papers', async () => {
    const s = await household('showcase-mots', undefined, { empty: true })
    await okJson(s.fetch('/api/notes', { method: 'POST', body: { text: 'le code du cadenas est 4721' } }))
    const { guestToken } = await okJson<{ guestToken: string; guestId: string }>(s.fetch('/api/guest/start', { method: 'POST', body: { kind: 'showcase' } }))
    expect(await okJson(as(guestToken, '/api/notes'))).toMatchObject({ notes: [] })
    const board = await (await as(guestToken, '/api/board')).text()
    expect(board).not.toContain('4721')
    // The household itself still reads its own.
    expect(JSON.stringify(await okJson(s.fetch('/api/notes')))).toContain('4721')
  })

  it('every minted link has its row, so it can be listed and revoked', async () => {
    const s = await household('guest-row', undefined, { empty: true })
    const { guestId } = await okJson<{ guestId: string }>(s.fetch('/api/guest/start', { method: 'POST', body: { kind: 'showcase' } }))
    expect(await env.DB.prepare('SELECT id FROM guests WHERE id = ?').bind(guestId).first()).not.toBeNull()
  })
})

describe('an operator invite is single-use', () => {
  const invite = async (s: Session) => new URL((await okJson<{ url: string }>(s.fetch('/api/operator-invite', { method: 'POST' }))).url).searchParams.get('j')!
  const join = (token: string, email: string) => anon('/api/operator-join', { method: 'POST', body: { token, email, password: 'un mot de passe' }, headers: freshIp() })

  it('the first redemption joins; the forwarded link does not; the next link does', async () => {
    const s = await household('invite-once', undefined, { empty: true })
    const token = await invite(s)
    expect((await join(token, `first-${Date.now()}@d1.test`)).status).toBe(201)
    expect((await join(token, `second-${Date.now()}@d1.test`)).status).toBe(403)
    expect((await join(await invite(s), `third-${Date.now()}@d1.test`)).status).toBe(201)
  })
})

describe('« Se déconnecter » ends the session on the server', () => {
  it('a copy of the signed-out cookie is refused; another device stays signed in', async () => {
    const s = await household('logout-server', undefined, { empty: true })
    const other = await login(s.email, s.password)
    expect((await s.fetch('/api/board')).status).toBe(200)
    expect((await s.fetch('/api/auth/logout', { method: 'POST' })).status).toBe(200)
    // The same cookie, replayed — what a copied cookie would do.
    expect((await s.fetch('/api/board')).status).toBe(401)
    expect((await other.fetch('/api/board')).status).toBe(200)
  })
})
