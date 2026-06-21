// « Le cercle » → Business: turn a shared Google Maps link into a pre-filled
// business card. A share link (maps.app.goo.gl/…) redirects to a maps URL whose
// `q` parameter is the place as "<Name>, <street>, <city>, <region> <postal>" — so
// once the redirect is resolved (server-side, in functions/api/place-import.ts), the
// whole card falls out of the URL with NO scraping and NO AI. Pure + framework-free
// so it's unit-testable without a network.

export interface ParsedPlace {
  name: string | null
  address: string | null
  lat: number | null
  lng: number | null
  mapUrl: string | null
}

const EMPTY: ParsedPlace = { name: null, address: null, lat: null, lng: null, mapUrl: null }

// Accept only Google's own hosts (the share shortener + the maps domains) — this is
// the SSRF allowlist for the outbound fetch; never let the importer hit an arbitrary
// host. Returns the parsed URL, or null when it isn't an http(s) Google link.
const GOOGLE_HOST = /(^|\.)(google\.[a-z]{2,3}(\.[a-z]{2})?|goo\.gl|g\.co)$/i
export function googleMapsUrl(raw: string): URL | null {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  return GOOGLE_HOST.test(u.hostname.toLowerCase()) ? u : null
}

const COORDS = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/

// Split a "<Name>, <Address…>" string. The address normally starts at the first
// comma-segment that begins with a street number, so a name that itself contains a
// comma ("Joe's Bar, Grill, 123 Main St") stays whole; if nothing looks like a
// street number, fall back to "first segment = name, the rest = address".
export function splitNameAddress(q: string): { name: string | null; address: string | null } {
  const parts = q
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) return { name: null, address: null }
  if (parts.length === 1) return { name: parts[0], address: null }
  let idx = parts.findIndex((p, i) => i > 0 && /^\d/.test(p))
  if (idx < 1) idx = 1
  const name = parts.slice(0, idx).join(', ')
  const address = parts.slice(idx).join(', ')
  return { name: name || null, address: address || null }
}

// Parse a RESOLVED Google Maps URL (after the share link's redirects) into a card.
// Two shapes are handled:
//   …/maps?q=<Name>, <Address>      — the share-link redirect target (richest)
//   …/maps/place/<Name>/@lat,lng…   — a place permalink (name from the path)
// Coordinates are pulled from `@lat,lng` in the path or a bare "lat,lng" `q`.
export function parseGoogleMapsUrl(finalUrl: string): ParsedPlace {
  let u: URL
  try {
    u = new URL(finalUrl)
  } catch {
    return EMPTY
  }
  const out: ParsedPlace = { ...EMPTY, mapUrl: finalUrl }

  const q = u.searchParams.get('q')?.trim() || u.searchParams.get('query')?.trim() || ''
  if (q && !COORDS.test(q)) {
    const { name, address } = splitNameAddress(q)
    out.name = name
    out.address = address
  } else {
    const m = u.pathname.match(/\/place\/([^/@]+)/)
    if (m) out.name = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim() || null
  }

  const at = u.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (at) {
    out.lat = Number(at[1])
    out.lng = Number(at[2])
  } else if (q && COORDS.test(q)) {
    const [a, b] = q.split(',')
    out.lat = Number(a)
    out.lng = Number(b)
  }
  return out
}
