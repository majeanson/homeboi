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

// ---- Open Graph enrichment --------------------------------------------------
// Google serves a RICH link-preview (the same card the Maps share sheet shows) to
// social crawlers: og:title = "Name · 4.8★(123) · Category", og:description = the
// address, og:image = the place photo. None of that is in the plain `?q=` page, so
// the handler fetches with a crawler UA and we parse the tags here. Phone + website
// are NOT in this preview (Google loads them client-side) — they need the Places API.

export interface PlaceOg {
  name: string | null
  address: string | null
  category: string | null
  photoUrl: string | null
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&') // last — so "&amp;#39;" doesn't double-decode
}

const safeCodePoint = (n: number): string => {
  try {
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''
  } catch {
    return ''
  }
}

// Read a <meta property|name|itemprop="<key>" content="…"> value (attribute order
// independent, entity-decoded). null when the tag/content is absent.
export function metaContent(html: string, key: string): string | null {
  const tag = html.match(new RegExp(`<meta[^>]*(?:property|name|itemprop)=["']${key}["'][^>]*>`, 'i'))?.[0]
  const c = tag?.match(/\scontent=["']([^"']*)["']/i)?.[1]
  return c ? decodeEntities(c).trim() || null : null
}

// "Clinique Dentaire · 5.0★(20) · Dentist" → name = first segment; a rating segment
// ("5.0★(20)", "(20)") or a price tier ("$$") is dropped; the remaining segment is
// the category. Defensive against the segments arriving in any order.
export function parseMapsTitle(title: string): { name: string | null; category: string | null } {
  const parts = title
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) return { name: null, category: null }
  const isRating = (p: string) => /★|^\(\d[\d,. ]*\)$/.test(p) || /^\d+([.,]\d+)?\s*(stars?|étoiles?)?$/i.test(p)
  const isPrice = (p: string) => /^\$+$/.test(p)
  const name = parts[0]
  const category = parts.slice(1).find((p) => !isRating(p) && !isPrice(p)) ?? null
  return { name: name || null, category }
}

// Parse the place out of a crawler-fetched HTML page's OG tags. Returns all-null
// when the page is the GENERIC "Google Maps" shell (no rich preview for this UA/link).
export function parsePlaceOg(html: string): PlaceOg {
  const title = metaContent(html, 'og:title')
  if (!title || /^google maps$/i.test(title)) return { name: null, address: null, category: null, photoUrl: null }
  const { name, category } = parseMapsTitle(title)
  const desc = metaContent(html, 'og:description')
  const image = metaContent(html, 'og:image')
  // Drop the generic boilerplate description + the fallback static-map image.
  const address = desc && !/find local businesses|trouvez des entreprises/i.test(desc) ? desc : null
  const photoUrl = image && !/\/staticmap/i.test(image) ? image : null
  return { name, address, category, photoUrl }
}

// Only Google's own image CDNs may be fetched for the place photo (SSRF guard).
const GOOGLE_IMG_HOST = /(^|\.)(googleapis\.com|googleusercontent\.com|ggpht\.com|gstatic\.com)$/i
export function googleImageUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null
  return GOOGLE_IMG_HOST.test(u.hostname.toLowerCase()) ? u : null
}

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
