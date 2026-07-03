import { describe, it, expect } from 'vitest'
import {
  issueDeviceToken,
  issueGuestToken,
  verifyDeviceToken,
  verifyGuestToken,
  currentDevice,
  issueSharedTripInvite,
  verifySharedTripInvite,
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
    // A token minted with no explicit kind normalizes to the showcase share-mode.
    expect(await verifyGuestToken(env, guest)).toEqual({ guestId: 'g1', householdId: 'hh1', kind: 'showcase', targetKey: null, fields: null })
    expect(await verifyDeviceToken(env, device)).toEqual({ deviceId: 'dev1', householdId: 'hh1' })
  })
})

describe('shared-trip invite token (« Voyage partagé » join link)', () => {
  it('roundtrips the shared trip id + nonce', async () => {
    const env = envWith()
    const token = await issueSharedTripInvite(env, 'st1', 'nonce1')
    expect(await verifySharedTripInvite(env, token)).toEqual({ sharedTripId: 'st1', nonce: 'nonce1' })
  })

  it('returns whatever nonce the token carries — the handler, not verify, compares it', async () => {
    const env = envWith()
    // A link minted under an OLD nonce still verifies (valid HMAC + unexpired); the
    // rotated-link rejection happens where the returned nonce is checked against the
    // trip's live invite_nonce. verifySharedTripInvite just surfaces the payload nonce.
    const stale = await issueSharedTripInvite(env, 'st1', 'old-nonce')
    expect(await verifySharedTripInvite(env, stale)).toEqual({ sharedTripId: 'st1', nonce: 'old-nonce' })
  })

  it('rejects an expired invite → null', async () => {
    const env = envWith()
    const expired = await issueSharedTripInvite(env, 'st1', 'nonce1', -10)
    expect(await verifySharedTripInvite(env, expired)).toBeNull()
  })

  it('rejects a tampered signature → null', async () => {
    const env = envWith()
    const token = await issueSharedTripInvite(env, 'st1', 'nonce1')
    const [body] = token.split('.')
    expect(await verifySharedTripInvite(env, `${body}.deadbeef`)).toBeNull()
    // A token signed under a different secret also fails the HMAC check.
    const other = await issueSharedTripInvite(envWith('other-secret-other-secret-other-x'), 'st1', 'nonce1')
    expect(await verifySharedTripInvite(env, other)).toBeNull()
  })

  it('never cross-verifies with device / guest / session tokens', async () => {
    const env = envWith()
    const device = await issueDeviceToken(env, 'dev1', 'hh1')
    const guest = await issueGuestToken(env, 'g1', 'hh1', 3600)
    const invite = await issueSharedTripInvite(env, 'st1', 'nonce1')
    // A device/guest token has no `st` (and carries `d`/`g`) → invite verify rejects it.
    expect(await verifySharedTripInvite(env, device)).toBeNull()
    expect(await verifySharedTripInvite(env, guest)).toBeNull()
    // And an invite token (no `d`/`g`) never resolves as a device or guest credential.
    expect(await verifyDeviceToken(env, invite)).toBeNull()
    expect(await verifyGuestToken(env, invite)).toBeNull()
  })
})
