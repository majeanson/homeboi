import { badRequest, ok, readJson, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { resolveLang } from '../_lib/ai'
import { putR2Blob } from '../_lib/r2'
import { googleMapsUrl, googleImageUrl, googleSorryContinue, isGoogleSorry, parseGoogleMapsUrl, parsePlaceOg } from '../_lib/placeImport'

// « Le cercle » → Business: pre-fill a business card from a shared Google Maps link.
// The browser can't follow the share-link redirects (CORS), so we do it server-side
// AND fetch with a social-crawler User-Agent — Google then serves the rich link
// preview (the same card the Maps "share" sheet shows): og:title = "Name · rating ·
// Category", og:description = the address, og:image = the place photo. We parse those
// (and the resolved URL for coordinates), and copy the photo into R2.
//
// What we CANNOT get without the paid Places API: phone + website. Google loads those
// client-side only, so they're in neither the preview nor the page HTML — the form
// leaves them for the operator to add.
//
//   POST { url } -> { name, address, category, photoKey, lat, lng, mapUrl, empty? }

const MAX_HTML = 1_500_000
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

// Copy the place photo from Google's image CDN into R2 (best-effort). Returns the new
// key, or null when R2 is unbound / the host isn't Google / the fetch fails.
async function storePhoto(bucket: R2Bucket | undefined, photoUrl: string | null): Promise<string | null> {
  if (!bucket) return null
  const u = googleImageUrl(photoUrl)
  if (!u) return null
  try {
    const res = await fetch(u.toString(), { headers: { 'user-agent': 'Babillard/0.1 (+household planner)' } })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? 'image/jpeg'
    if (!ct.startsWith('image/')) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0 || buf.byteLength > MAX_PHOTO_BYTES) return null
    return await putR2Blob(bucket, buf, ct, 'bz')
  } catch {
    return null
  }
}

export const onRequestPost = authed(async (ctx) => {
  const lang = resolveLang(ctx.env, ctx.request)
  const url = googleMapsUrl((await readJson<{ url?: string }>(ctx.request))?.url ?? '')
  if (!url) return badRequest('Lien Google Maps requis.')

  let html = ''
  let finalUrl = url.toString()
  try {
    const res = await fetch(url.toString(), {
      redirect: 'follow',
      headers: {
        // A social-crawler UA — Google answers it with the rich place preview tags.
        'user-agent': 'facebookexternalhit/1.1 (+https://babillard.example/preview)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': lang === 'en' ? 'en-CA' : 'fr-CA',
      },
    })
    // Datacenter block: Google 429s Cloudflare egress into its /sorry captcha page.
    // The shortlink was already expanded, so the block URL's `continue` param IS the
    // resolved maps destination — parse THAT and skip the page (it's a captcha shell;
    // its own q= is an anti-bot token that would land in the form as a junk name).
    const sorry = googleSorryContinue(res.url)
    if (sorry) {
      finalUrl = sorry.toString()
    } else if (isGoogleSorry(res.url)) {
      // Blocked AND no usable continue — nothing trustworthy to parse.
      return ok({ name: null, address: null, category: null, photoKey: null, lat: null, lng: null, mapUrl: url.toString(), empty: true })
    } else {
      if (googleMapsUrl(res.url)) finalUrl = res.url // re-check the destination is still Google
      html = (await res.text()).slice(0, MAX_HTML)
    }
  } catch {
    return serviceUnavailable('Lien introuvable.')
  }

  // OG preview is richest; the resolved URL is the fallback for name/address and the
  // only source of coordinates.
  const og = parsePlaceOg(html)
  const fromUrl = parseGoogleMapsUrl(finalUrl)
  const name = og.name ?? fromUrl.name
  const address = og.address ?? fromUrl.address
  const photoKey = await storePhoto(ctx.env.PHOTOS, og.photoUrl)

  // Nothing usable (a bare dropped-pin) — let the UI say "fill it in by hand".
  const empty = !name && !address
  return ok({ name, address, category: og.category, photoKey, lat: fromUrl.lat, lng: fromUrl.lng, mapUrl: finalUrl, empty })
}, 'operator')
