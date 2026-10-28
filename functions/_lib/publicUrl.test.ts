import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPublic, publicHttpUrl } from './publicUrl'

describe('publicHttpUrl', () => {
  it.each(['https://example.com/a', 'http://recettes.qc.ca/x'])('lets %s through', (u) => expect(publicHttpUrl(u)).not.toBeNull())
  it.each([
    'ftp://example.com',
    'http://localhost/x',
    'http://127.0.0.1/x',
    'http://2130706433/x', // decimal 127.0.0.1
    'http://0x7f.1/x',
    'http://10.1.2.3/x',
    'http://172.20.0.1/x',
    'http://192.168.1.1/x',
    'http://169.254.169.254/x',
    'http://[::1]/x',
    'http://[fd00::1]/x',
    'http://[::ffff:127.0.0.1]/x',
    'http://printer.local/x',
    'not a url',
  ])('refuses %s', (u) => expect(publicHttpUrl(u)).toBeNull())
})

describe('fetchPublic', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('re-checks a redirect hop', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } })))
    await expect(fetchPublic('https://example.com/a')).rejects.toThrow(/not a public/)
  })
  it('follows a public redirect', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: '/b' } })).mockResolvedValueOnce(new Response('ok')),
    )
    expect(await (await fetchPublic('https://example.com/a')).text()).toBe('ok')
  })
})
