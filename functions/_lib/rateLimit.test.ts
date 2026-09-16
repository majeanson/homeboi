import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { clientIp, overAuthLimit, overLimit, rateLimitEnabled } from './rateLimit'
import type { Env } from './env'

// A rate-limit binding that answers `success: false` after `allow` calls per key.
function fakeLimiter(allow: number): RateLimit & { calls: string[] } {
  const seen = new Map<string, number>()
  const calls: string[] = []
  return {
    calls,
    async limit({ key }) {
      calls.push(key)
      const n = (seen.get(key) ?? 0) + 1
      seen.set(key, n)
      return { success: n <= allow }
    },
  }
}

const req = (headers: Record<string, string> = {}): Request =>
  ({ headers: { get: (k: string) => headers[k] ?? null } }) as unknown as Request

describe('rateLimit', () => {
  it('allows under the limit and refuses the attempt that crosses it', async () => {
    const env = { LIMIT_KEY: fakeLimiter(2) } as unknown as Env
    expect(await overLimit(env, 'key', 'login:a@b.com')).toBe(false)
    expect(await overLimit(env, 'key', 'login:a@b.com')).toBe(false)
    expect(await overLimit(env, 'key', 'login:a@b.com')).toBe(true)
    // Another key is its own bucket.
    expect(await overLimit(env, 'key', 'login:c@d.com')).toBe(false)
  })

  it('an unset binding allows (dev / tests) — and health says so', async () => {
    const env = {} as Env
    expect(await overLimit(env, 'ip', '1.2.3.4')).toBe(false)
    expect(rateLimitEnabled(env)).toBe(false)
    expect(rateLimitEnabled({ LIMIT_IP: fakeLimiter(1), LIMIT_KEY: fakeLimiter(1) } as unknown as Env)).toBe(true)
  })

  it('a binding that throws allows — the door must not lock on the limiter’s bad day', async () => {
    const env = { LIMIT_IP: { limit: async () => { throw new Error('edge') } } } as unknown as Env
    expect(await overLimit(env, 'ip', 'x')).toBe(false)
  })

  it('overAuthLimit charges the address first, then the target — a flood never reaches the per-target count', async () => {
    const ip = fakeLimiter(1)
    const key = fakeLimiter(10)
    const env = { LIMIT_IP: ip, LIMIT_KEY: key } as unknown as Env
    const r = req({ 'CF-Connecting-IP': '9.9.9.9' })
    expect(await overAuthLimit(env, r, 'login:a@b.com')).toBe(false)
    expect(await overAuthLimit(env, r, 'login:a@b.com')).toBe(true)
    expect(ip.calls).toEqual(['ip:9.9.9.9', 'ip:9.9.9.9'])
    expect(key.calls).toEqual(['key:login:a@b.com']) // the second attempt never got here
  })

  it('reads the caller’s address from CF-Connecting-IP, else the first X-Forwarded-For hop, else one shared bucket', () => {
    expect(clientIp(req({ 'CF-Connecting-IP': '1.1.1.1', 'X-Forwarded-For': '2.2.2.2' }))).toBe('1.1.1.1')
    expect(clientIp(req({ 'X-Forwarded-For': '2.2.2.2, 3.3.3.3' }))).toBe('2.2.2.2')
    expect(clientIp(req())).toBe('unknown')
  })

  it('wrangler.toml declares BOTH bindings — unset in production would be a silent hole', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
    const toml = readFileSync(join(root, 'wrangler.toml'), 'utf8')
    expect(toml).toMatch(/\[\[ratelimits\]\]\s*\nname = "LIMIT_IP"/)
    expect(toml).toMatch(/\[\[ratelimits\]\]\s*\nname = "LIMIT_KEY"/)
  })
})
