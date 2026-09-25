import { describe, it, expect } from 'vitest'
import { inviteAccepted, inviteRequired, signupOpen } from './signupGate'

// Who may create an account. A pure module, held here rather than in the d1 suite,
// because the d1 harness binds its env once per run (vitest.d1.config.ts) and every row
// of this table is a different env. Each case was watched RED against the mutation in
// its comment.

const CODE = 'shared-invite-code'

describe('the signup gate', () => {
  it('invite-gated: INVITE_CODE set and SIGNUP_OPEN not "1" asks for the code', () => {
    const env = { INVITE_CODE: CODE, SIGNUP_OPEN: '0' }
    expect(inviteRequired(env)).toBe(true)
    expect(inviteAccepted(env, CODE)).toBe(true)
    // Red against `return true` in inviteAccepted.
    expect(inviteAccepted(env, 'wrong')).toBe(false)
    expect(inviteAccepted(env, undefined)).toBe(false)
    expect(inviteAccepted(env, '')).toBe(false)
    // A non-string body field is refused, not coerced.
    expect(inviteAccepted(env, 42)).toBe(false)
  })

  it('SIGNUP_OPEN = "1" opens signup even while INVITE_CODE stays set', () => {
    // THE POINT OF THE MODULE. Red against `inviteRequired = () => !!env.INVITE_CODE`
    // — the old coupling, where opening signup meant deleting a secret (then also the
    // legacy login's lock) instead of committing a line.
    const env = { INVITE_CODE: CODE, SIGNUP_OPEN: '1' }
    expect(signupOpen(env)).toBe(true)
    expect(inviteRequired(env)).toBe(false)
    expect(inviteAccepted(env, undefined)).toBe(true)
  })

  it('only exactly "1" opens it — a typo fails toward the gate', () => {
    // Red against `!!env.SIGNUP_OPEN` (which "0" would satisfy) or a truthy parse.
    for (const v of ['0', '', 'true', 'yes', ' 1', '1 ', 'on', undefined]) {
      expect(signupOpen({ SIGNUP_OPEN: v }), `SIGNUP_OPEN=${JSON.stringify(v)}`).toBe(false)
      expect(inviteRequired({ SIGNUP_OPEN: v, INVITE_CODE: CODE })).toBe(true)
    }
  })

  it('no INVITE_CODE and not opened: nothing to ask (local dev, the d1 harness)', () => {
    expect(inviteRequired({})).toBe(false)
    expect(inviteRequired({ INVITE_CODE: '' })).toBe(false)
    expect(inviteAccepted({ INVITE_CODE: '' }, undefined)).toBe(true)
  })
})
