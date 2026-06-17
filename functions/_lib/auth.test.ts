import { describe, it, expect } from 'vitest'
import {
  issueDeviceToken,
  issueGuestToken,
  verifyDeviceToken,
  verifyGuestToken,
  currentDevice,
} from './auth'
import type { Env } from './env'

// The realtime WS upgrade (#20) can't send the X-Device-Token header, so the
// token arrives as a ?t= query param and is verified through verifyDeviceToken /
// verifyGuestToken — the SAME helpers the header path (currentDevice/currentGuest)
// now call. These tests pin that the raw-string verify is exact: a valid token
// resolves, the header path and the raw path agree, and bad/expired/cross-typed
// tokens are rejected. (No DB needed — these are the pure HMAC layer.)

const SECRET = 'test-secret-test-secret-test-secret'
const envWith = (secret: string | undefined = SECRET): Env => ({ SESSION_SECRET: secret }) as Env

describe('verifyDeviceToken (shared header + WS-query-param verify)', () => {
  it('resolves a freshly issued device token', async () => {
    const env = envWith()
    const token = await issueDeviceToken(env, 'dev1', 'hh1')
    expect(await verifyDeviceToken(env, token)).toEqual({ deviceId: 'dev1', householdId: 'hh1' })
  })

  it('verifies identically whether the token comes via header or raw string', async () => {
    const env = envWith()
    const token = await issueDeviceToken(env, 'dev1', 'hh1')
    const viaHeader = await currentDevice(env, {
      headers: { get: (k: string) => (k === 'X-Device-Token' ? token : null) },
    } as unknown as Request)
    const viaRaw = await verifyDeviceToken(env, token)
    expect(viaRaw).toEqual(viaHeader)
  })

  it('rejects null / garbage / wrong-secret tokens', async () => {
    const env = envWith()
    expect(await verifyDeviceToken(env, null)).toBeNull()
    expect(await verifyDeviceToken(env, 'not-a-token')).toBeNull()
    // Signed with a different secret → signature mismatch.
    const other = await issueDeviceToken(envWith('other-secret-other-secret-other-x'), 'dev1', 'hh1')
    expect(await verifyDeviceToken(env, other)).toBeNull()
  })

  it('rejects an expired token', async () => {
    const env = envWith()
    // issueGuestToken takes an explicit TTL — a negative TTL is already expired.
    const expired = await issueGuestToken(env, 'g1', 'hh1', -10)
    expect(await verifyGuestToken(env, expired)).toBeNull()
  })

  it('does not cross device and guest token types', async () => {
    const env = envWith()
    const device = await issueDeviceToken(env, 'dev1', 'hh1')
    const guest = await issueGuestToken(env, 'g1', 'hh1', 3600)
    // A device token has `d`, not `g` → guest verify rejects it, and vice-versa.
    expect(await verifyGuestToken(env, device)).toBeNull()
    expect(await verifyDeviceToken(env, guest)).toBeNull()
    // Each resolves under its own verifier.
    expect(await verifyGuestToken(env, guest)).toEqual({ guestId: 'g1', householdId: 'hh1' })
    expect(await verifyDeviceToken(env, device)).toEqual({ deviceId: 'dev1', householdId: 'hh1' })
  })
})
