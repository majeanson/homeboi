import { describe, it, expect } from 'vitest'
import { seal, open } from './secretBox'

const SECRET = 'a-secret-that-is-at-least-thirty-two-characters-long'

describe('secretBox — the sealed box for a held third-party token', () => {
  it('round-trips, with a fresh iv every time', async () => {
    const a = await seal('Token token=abc', SECRET)
    const b = await seal('Token token=abc', SECRET)
    expect(a).not.toBe(b)
    expect(a.startsWith('v1.')).toBe(true)
    expect(await open(a, SECRET)).toBe('Token token=abc')
    expect(await open(b, SECRET)).toBe('Token token=abc')
  })

  it('yields nothing under another secret, a tampered box, or garbage — never throws', async () => {
    const box = await seal('hello', SECRET)
    expect(await open(box, SECRET + 'x')).toBeNull()
    const [v, iv, ct] = box.split('.')
    expect(await open(`${v}.${iv}.${ct.slice(0, -2)}AA`, SECRET)).toBeNull()
    expect(await open('v1.not.abox', SECRET)).toBeNull()
    expect(await open('', SECRET)).toBeNull()
    expect(await open('v2.a.b', SECRET)).toBeNull()
  })

  it('refuses to seal with a missing or short secret (sealing with a known key is no seal)', async () => {
    await expect(seal('x', undefined)).rejects.toThrow(/SESSION_SECRET/)
    await expect(seal('x', 'short')).rejects.toThrow(/SESSION_SECRET/)
  })
})
