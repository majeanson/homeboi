import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env } from './env'

// The Browser Run seam: every way it can come back empty says null and never throws, and
// the budget is charged BEFORE the browser starts (a refused charge never starts it).
const charge = vi.fn()
vi.mock('./usage', () => ({ charge: (...a: unknown[]) => charge(...a) }))
const { renderPage, isRefusalPage } = await import('./renderPage')

const PAGE = '<html><head><title>Pouding chômeur</title></head><body>…</body></html>'
const envWith = (quickAction: unknown) => ({ DB: {}, BROWSER: { quickAction } }) as unknown as Env

beforeEach(() => {
  charge.mockReset()
  charge.mockResolvedValue({ allowed: true, used: 1, limit: 20 })
})

describe('renderPage', () => {
  it('unbound (or bound to "" in the d1 harness) → null, nothing charged', async () => {
    expect(await renderPage({ DB: {} } as unknown as Env, 'https://x.test/')).toBeNull()
    expect(await renderPage({ DB: {}, BROWSER: '' } as unknown as Env, 'https://x.test/')).toBeNull()
    expect(charge).not.toHaveBeenCalled()
  })

  it('over budget → null, and the browser never starts', async () => {
    charge.mockResolvedValue({ allowed: false, used: 21, limit: 20 })
    const qa = vi.fn()
    expect(await renderPage(envWith(qa), 'https://x.test/')).toBeNull()
    expect(charge).toHaveBeenCalledWith(expect.anything(), 'browser', 1)
    expect(qa).not.toHaveBeenCalled()
  })

  it('success:false, an empty result, a throw → null', async () => {
    expect(await renderPage(envWith(async () => ({ success: false, result: PAGE })), 'https://x.test/')).toBeNull()
    expect(await renderPage(envWith(async () => ({ success: true, result: '  ' })), 'https://x.test/')).toBeNull()
    expect(
      await renderPage(
        envWith(async () => {
          throw new Error('quota')
        }),
        'https://x.test/',
      ),
    ).toBeNull()
  })

  it('the rendered HTML — from the parsed object or a Response — with networkidle2', async () => {
    const qa = vi.fn(async () => ({ success: true, result: PAGE }))
    expect(await renderPage(envWith(qa), 'https://x.test/r')).toBe(PAGE)
    expect(qa).toHaveBeenCalledWith('content', { url: 'https://x.test/r', gotoOptions: { waitUntil: 'networkidle2', timeout: 30_000 } })
    const asResponse = async () => new Response(JSON.stringify({ success: true, result: PAGE }))
    expect(await renderPage(envWith(asResponse), 'https://x.test/r')).toBe(PAGE)
  })

  it('a bot manager’s refusal, rendered faithfully, is still a refusal', async () => {
    const denied = '<HTML><HEAD><TITLE>Access Denied</TITLE></HEAD><BODY>Reference #18</BODY></HTML>'
    expect(isRefusalPage(denied)).toBe(true)
    expect(isRefusalPage(PAGE)).toBe(false)
    expect(await renderPage(envWith(async () => ({ success: true, result: denied })), 'https://x.test/')).toBeNull()
  })
})
