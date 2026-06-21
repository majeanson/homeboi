import { badRequest, ok, readJson, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { resolveLang } from '../_lib/ai'
import { googleMapsUrl, parseGoogleMapsUrl, type ParsedPlace } from '../_lib/placeImport'

// « Le cercle » → Business: pre-fill a business card from a shared Google Maps link.
// A share link (maps.app.goo.gl/…) is a chain of redirects whose final maps URL
// carries the place as a `q=<Name>, <Address>` parameter — so we follow the
// redirects server-side (the browser can't, CORS) and parse the destination. NO
// scraping, NO AI, NO Places API key. Returns a draft the client drops into the
// BusinessForm for the operator to review before saving. Operator-only: it makes an
// outbound fetch and is part of the household-admin surface.
//
//   POST { url } -> { name, address, lat, lng, mapUrl, empty? }

// Resolve the share link by letting the runtime follow the redirect chain, then read
// `res.url` — the final destination URL (reliable in the Workers runtime). We never
// need the page body, so we cancel it. The destination is re-checked against the
// Google host allowlist (defense-in-depth) before we trust it.
async function resolveFinalUrl(start: URL, lang: 'fr' | 'en'): Promise<string | null> {
  let res: Response
  try {
    res = await fetch(start.toString(), {
      redirect: 'follow',
      headers: {
        // A browser-like UA — Google answers a bare bot UA differently.
        'user-agent': 'Mozilla/5.0 (compatible; Babillard/0.1; +household planner)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': lang === 'en' ? 'en-CA' : 'fr-CA',
      },
    })
  } catch {
    return null
  }
  // Drop the body unread (we only want the resolved URL, not the heavy HTML).
  try {
    await res.body?.cancel()
  } catch {
    /* already consumed / no body — ignore */
  }
  const finalUrl = res.url || start.toString()
  return googleMapsUrl(finalUrl) ? finalUrl : null
}

export const onRequestPost = authed(async (ctx) => {
  const lang = resolveLang(ctx.env, ctx.request)
  const body = await readJson<{ url?: string }>(ctx.request)
  const url = googleMapsUrl(body?.url ?? '')
  if (!url) return badRequest('Lien Google Maps requis.')

  const finalUrl = await resolveFinalUrl(url, lang)
  if (!finalUrl) return serviceUnavailable('Lien introuvable.')

  const place: ParsedPlace = parseGoogleMapsUrl(finalUrl)
  // Nothing usable fell out (e.g. a bare dropped-pin with no name/address) — let the
  // UI tell the user to fill it in by hand rather than save a blank card.
  const empty = !place.name && !place.address
  return ok({ ...place, empty })
}, 'operator')
