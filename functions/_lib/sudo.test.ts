import { describe, it, expect } from 'vitest'
import { requirePassword } from './sudo'
import { hashPassword } from './password'
import type { Env } from './env'
import type { Actor } from './household'

// The password door (STATE.md §4-L, L5). Verification mirrors login: a row with a
// hash checks it; a legacy row checks LOGIN_PASSWORD; a legacy row on an open
// deployment has nothing to ask. Only an operator may pass — a kiosk or a guest is
// refused before any lookup.

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

  it('a legacy row (no hash) checks the shared LOGIN_PASSWORD, like login does', async () => {
    const env = envWith({ password_hash: null }, { LOGIN_PASSWORD: 'shared-code' })
    expect(await requirePassword(env, operator, 'shared-code')).toBeNull()
    expect((await requirePassword(env, operator, 'nope'))!.status).toBe(403)
  })

  it('a legacy row on an open deployment (no LOGIN_PASSWORD) has no password to ask for', async () => {
    const env = envWith({ password_hash: null })
    expect(await requirePassword(env, operator, 'anything')).toBeNull()
  })

  it('refuses a kiosk or a guest before any lookup, and an operator row that vanished', async () => {
    const env = envWith({ password_hash: await hashPassword('x') })
    expect((await requirePassword(env, { householdId: 'hh1', scope: 'kiosk', deviceId: 'd' }, 'x'))!.status).toBe(403)
    expect((await requirePassword(env, { householdId: 'hh1', scope: 'guest', guestId: 'g' }, 'x'))!.status).toBe(403)
    expect((await requirePassword(envWith(null), operator, 'x'))!.status).toBe(403)
  })
})
