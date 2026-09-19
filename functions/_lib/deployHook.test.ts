import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkDeploySecret, deployHookEnabled, DEPLOY_SECRET_MIN } from './deployHook'

// The polarity, held by a test, because it is one `!` away from an unauthenticated write
// endpoint on production — and because the only adjacent precedent in this codebase
// (auth/login.ts) has the OPPOSITE polarity, so the next reader will pattern-match the
// wrong way round.
//
// Every case below was watched RED first, against the mutation named in its comment.

const GOOD = 'a'.repeat(DEPLOY_SECRET_MIN)

describe('the deploy-hook gate', () => {
  it('an UNSET secret closes the door', () => {
    // Red against: `if (secret && !safeEqual(p, secret)) return 'denied'; return 'ok'`
    // — i.e. the login.ts shape, which means unset ⇒ open.
    expect(checkDeploySecret(undefined, 'anything')).toBe('unconfigured')
    expect(checkDeploySecret(null, 'anything')).toBe('unconfigured')
  })

  it("an EMPTY-STRING secret is unset, not a secret that happens to match ''", () => {
    // THE TEST THAT EARNS ITS KEEP. Red against `if (secret === undefined …)`, and it
    // goes red for a reason that is easy to miss reading the code: safeEqual('', '') is
    // TRUE, so an `=== undefined` guard would accept a request whose header is present
    // and empty. And '' is a shape this repo genuinely produces — vitest.d1.config.ts
    // binds LOGIN_PASSWORD exactly that way, and wrangler does it for any declared-but-
    // empty var.
    expect(checkDeploySecret('', '')).toBe('unconfigured')
    expect(checkDeploySecret('', 'anything')).toBe('unconfigured')
  })

  it('a secret shorter than the floor is unset', () => {
    // Red against: dropping the `.length < DEPLOY_SECRET_MIN` clause.
    expect(checkDeploySecret('short', 'short')).toBe('unconfigured')
    expect(checkDeploySecret('a'.repeat(DEPLOY_SECRET_MIN - 1), 'x')).toBe('unconfigured')
  })

  it('a missing header is DENIED, never accepted', () => {
    // Red against the plausible typo `if (!presented) return 'ok'`.
    expect(checkDeploySecret(GOOD, null)).toBe('denied')
    expect(checkDeploySecret(GOOD, '')).toBe('denied')
  })

  it('accepts only the exact secret', () => {
    expect(checkDeploySecret(GOOD, GOOD)).toBe('ok')
    // Red against `a.startsWith(b)`: a correct PREFIX must not open it…
    expect(checkDeploySecret(GOOD, GOOD.slice(0, -1))).toBe('denied')
    // …nor a correct secret with something appended…
    expect(checkDeploySecret(GOOD, `${GOOD}x`)).toBe('denied')
    // …nor one wrong byte at the end, where a lazy compare would already have decided.
    expect(checkDeploySecret(GOOD, `${GOOD.slice(0, -1)}b`)).toBe('denied')
  })

  it('reports itself to /api/health without needing a presented value', () => {
    expect(deployHookEnabled({})).toBe(false)
    expect(deployHookEnabled({ DEPLOY_NOTIFY_SECRET: '' })).toBe(false)
    expect(deployHookEnabled({ DEPLOY_NOTIFY_SECRET: 'tooshort' })).toBe(false)
    expect(deployHookEnabled({ DEPLOY_NOTIFY_SECRET: GOOD })).toBe(true)
  })

  it('compares in constant time — asserted against the SOURCE, because behaviour cannot show it', () => {
    // `===` and safeEqual() agree on every input. The only difference is how long they
    // take to disagree, which no assertion above can see. So this one reads the file.
    const src = readFileSync(join(import.meta.dirname, 'deployHook.ts'), 'utf8')
    expect(src).toContain('safeEqual(presented, secret)')
    expect(src).not.toMatch(/presented\s*===\s*secret|secret\s*===\s*presented/)
  })
})
