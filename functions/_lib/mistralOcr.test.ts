// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mistralOcr } from './mistralOcr'
import type { AiReport } from './ai'
import type { Env } from './env'

// The cloud reader must never block a read ('' on any failure) — AND must never fail
// in silence: prod answered `{text: ""}` with a plain 200 for a clean card on
// 2026-10-27 and nothing said why. The report carries the status + Mistral's words.

const env = { MISTRAL_API_KEY: 'k' } as unknown as Env
const bytes = new Uint8Array([1, 2, 3])
const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))

afterEach(() => vi.unstubAllGlobals())

describe('mistralOcr', () => {
  it('joins the pages’ markdown on a good answer, no error reported', async () => {
    vi.stubGlobal('fetch', reply(200, { pages: [{ markdown: '# Biscuits' }, { markdown: '3/4 tasse' }] }))
    const report: AiReport = { error: null }
    expect(await mistralOcr(env, bytes, report)).toBe('# Biscuits\n\n3/4 tasse')
    expect(report.error).toBeNull()
  })
  it('a refused call → empty text, and the report names the status and Mistral’s message', async () => {
    vi.stubGlobal('fetch', reply(401, { message: 'Unauthorized', request_id: 'x' }))
    const report: AiReport = { error: null }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await mistralOcr(env, bytes, report)).toBe('')
    expect(report.error).toMatch(/HTTP 401/)
    expect(report.error).toContain('Unauthorized')
  })
  it('a 200 with no page text is reported too — it is how the broken reader looked', async () => {
    vi.stubGlobal('fetch', reply(200, { pages: [] }))
    const report: AiReport = { error: null }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await mistralOcr(env, bytes, report)).toBe('')
    expect(report.error).toMatch(/no page text/)
  })
  it('no key → empty, no call, no report', async () => {
    const f = reply(200, { pages: [{ markdown: 'x' }] })
    vi.stubGlobal('fetch', f)
    const report: AiReport = { error: null }
    expect(await mistralOcr({} as Env, bytes, report)).toBe('')
    expect(f).not.toHaveBeenCalled()
    expect(report.error).toBeNull()
  })
})
