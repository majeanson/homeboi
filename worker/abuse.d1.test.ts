import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { anon, household } from '../functions/test/d1'
import { IP_DAILY_CAP } from '../functions/_lib/rateLimit'
import { localDayStart, nowSec, sha256Hex } from '../functions/_lib/ids'
import { DEFAULT_TZ, runWithRequest } from '../functions/_lib/tz'
import { charge } from '../functions/_lib/usage'

// P0 #6 (review 2026-11-17): the budgets could be multiplied. Three ways, three bounds.

// The counter at its cap for one address, through the same salted hash the door computes.
async function atCap(ip: string, event: 'account' | 'demo') {
  const hash = await sha256Hex(`${ip}|${env.SESSION_SECRET ?? ''}`)
  const day = localDayStart(new Date(nowSec() * 1000), DEFAULT_TZ)
  await env.DB.prepare('INSERT OR REPLACE INTO ip_daily (ip_hash, day, event, n, updated_at) VALUES (?, ?, ?, ?, ?)').bind(hash, day, event, IP_DAILY_CAP[event], nowSec()).run()
}
const ip = () => `10.88.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`

describe('one address, one day', () => {
  it('past its accounts for the day, an address cannot open another; a neighbour still can', async () => {
    const busy = ip()
    await atCap(busy, 'account')
    const signup = (from: string) =>
      anon('/api/auth/signup', { method: 'POST', body: { email: `cap-${from}-${Date.now()}@d1.test`, password: 'correct horse battery', householdName: 'x' }, headers: { 'CF-Connecting-IP': from } })
    expect((await signup(busy)).status).toBe(429)
    expect((await signup(ip())).status).toBe(201)
  })

  it('a typo does not count: a refused signup leaves the counter where it was', async () => {
    const from = ip()
    for (let i = 0; i < IP_DAILY_CAP.account + 2; i++)
      await anon('/api/auth/signup', { method: 'POST', body: { email: 'not an email', password: 'x' }, headers: { 'CF-Connecting-IP': from } })
    const ok = await anon('/api/auth/signup', { method: 'POST', body: { email: `typo-${Date.now()}@d1.test`, password: 'correct horse battery', householdName: 'x' }, headers: { 'CF-Connecting-IP': from } })
    expect(ok.status).toBe(201)
  })

  it('past its demos for the day, an address gets the read-only look', async () => {
    const busy = ip()
    await atCap(busy, 'demo')
    const res = await anon('/api/demo', { method: 'POST', headers: { 'CF-Connecting-IP': busy } })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { sandbox?: boolean }).sandbox).not.toBe(true)
  })
})

describe('pairing codes', () => {
  it('guessing codes is bounded per household', async () => {
    const s = await household('pair-guess', undefined, { empty: true })
    const statuses: number[] = []
    for (let i = 0; i < 12; i++) {
      const r = await s.fetch('/api/pair/claim', { method: 'POST', body: { code: String(100000 + i) }, headers: { 'CF-Connecting-IP': ip() } })
      statuses.push(r.status)
    }
    expect(statuses).toContain(429)
    expect(statuses.slice(0, 3).every((x) => x === 404)).toBe(true)
  })
})

describe('the daily budget', () => {
  it('turns over at one midnight for everyone: changing zones does not open a new day', async () => {
    const s = await household('budget-zone', undefined, { empty: true })
    const east = await runWithRequest({ householdId: s.householdId, tz: 'Pacific/Kiritimati' }, () => charge(env, 'ai'))
    const west = await runWithRequest({ householdId: s.householdId, tz: 'Pacific/Pago_Pago' }, () => charge(env, 'ai'))
    expect(east.used).toBe(1)
    expect(west.used).toBe(2)
  })
})
