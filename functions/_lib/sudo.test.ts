import { describe, it, expect } from 'vitest'
import { requirePassword } from './sudo'
import { hashPassword } from './password'
import type { Env } from './env'
import type { Actor } from './household'

// The password door (STATE.md §4-L, L5). Verification mirrors login: a row with a
// hash checks it; a row without one is refused (the shared-LOGIN_PASSWORD fallback is
// gone, 2026-09-25). Only an operator may pass — a kiosk or a guest is refused before
// any lookup.

const stubDb = (firstRow: unknown): D1Database =>
  ({ prepare: () => ({ bind: () => ({ first: async () => firstRow }) }) }) as unknown as D1Database
const envWith = (firstRow: unknown, extra: Partial<Env> = {}): Env => ({ DB: stubDb(firstRow), ...extra }) as Env
const operator: Actor = { householdId: 'hh1', scope: 'operator', email: 'a@b.com' }

describe('requirePassword', () => {
  it('passes the right password against the row’s hash', async () => {
    const env = envWith({ password_hash: await hashPassword('correct horse') })
    expect(await requirePassword(env, operator, 'correct horse')).toBeNull()
  })

  it('refuses the wrong password (403) and a missing one (400)', async () => {
    const env = envWith({ password_hash: await hashPassword('correct horse') })
    expect((await requirePassword(env, operator, 'battery staple'))!.status).toBe(403)
    expect((await requirePassword(env, operator, ''))!.status).toBe(400)
    expect((await requirePassword(env, operator, undefined))!.status).toBe(400)
    expect((await requirePassword(env, operator, 42))!.status).toBe(400)
  })

  it('a row without a hash is refused — nothing to compare, and no shared fallback', async () => {
    // Red against restoring the legacy branch: with the secret unset it PASSED anything
    // (the first line), and with it set the invite code opened the door (the second).
    expect((await requirePassword(envWith({ password_hash: null }), operator, 'anything'))!.status).toBe(403)
    const withCode = envWith({ password_hash: null }, { INVITE_CODE: 'shared-code' })
    expect((await requirePassword(withCode, operator, 'shared-code'))!.status).toBe(403)
  })

  it('refuses a kiosk or a guest before any lookup, and an operator row that vanished', async () => {
    const env = envWith({ password_hash: await hashPassword('x') })
    expect((await requirePassword(env, { householdId: 'hh1', scope: 'kiosk', deviceId: 'd' }, 'x'))!.status).toBe(403)
    expect((await requirePassword(env, { householdId: 'hh1', scope: 'guest', guestId: 'g' }, 'x'))!.status).toBe(403)
    expect((await requirePassword(envWith(null), operator, 'x'))!.status).toBe(403)
  })
})
