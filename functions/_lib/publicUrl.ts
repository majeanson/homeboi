// Light SSRF guard for every outbound fetch of a URL a third party chose (a recipe
// link, a step photo named by a page's JSON-LD): only public http(s), no obvious
// internal target — and the guard follows REDIRECTS itself, because a public address
// that 302s to an internal one passes a check made only on the first URL. Workers
// cannot reach a private network anyway; this keeps the intent explicit and cheap.

function internalHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true
  // IPv6 literals: loopback, unspecified, unique-local, link-local, v4-mapped.
  if (h.includes(':')) return h === '::' || h === '::1' || /^(fc|fd|fe[89ab])/.test(h) || h.startsWith('::ffff:')
  // WHATWG URL already folds decimal/hex/octal IPv4 forms into dotted quads.
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}

export function publicHttpUrl(raw: string): URL | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  return internalHost(u.hostname) ? null : u
}

const MAX_HOPS = 5

/** `fetch` that re-checks every redirect hop against `publicHttpUrl`. Throws on a
 *  refused hop or too many hops — callers already treat a throw as « did not come ». */
export async function fetchPublic(url: string, init: RequestInit = {}): Promise<Response> {
  let current = url
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (!publicHttpUrl(current)) throw new Error('refused: not a public address')
    const res = await fetch(current, { ...init, redirect: 'manual' })
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
    if (!loc) return res
    current = new URL(loc, current).toString()
  }
  throw new Error('refused: too many redirects')
}
