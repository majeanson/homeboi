import { badRequest, ok, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { isPostal, normalizePostal, householdPostal } from '../_lib/postal'
import { computeUnitPrice, type UnitKind } from '../_lib/unitprice'

// PROOF OF CONCEPT — full flyer reconstruction (the "show the cashier the whole
// flyer" half). Same undocumented Flipp backend + caveats as deals.ts.
//
// KEY INSIGHT: a Flipp "flyer page" is NOT a scanned image — it's a canvas of
// item clippings positioned by coordinates. So we return each page's geometry
// plus every item's clipping URL + box, and the client composites them into a
// page (optionally highlighting one item). The clipping images are public/
// unsigned on f.wishabi.net, so no token is needed to render them.
//
//   GET /api/flyer?id=7961971&postal=H2X1Y4
//
// Degrades to 503 if Flipp changes/blocks the endpoint.

interface RawPage {
  id?: number
  page?: number
  name?: string
  left?: number
  top?: number
  right?: number
  bottom?: number
}
// NB: the flyer endpoint names fields differently from the search endpoint —
// `id`/`price`/`cutout_image_url` here vs `flyer_item_id`/`current_price`/
// `clean_image_url` in deals.ts. There's no "was" price on this endpoint.
interface RawItem {
  id?: number
  name?: string
  price?: number | null
  cutout_image_url?: string
  pre_price_text?: string | null
  post_price_text?: string | null
  valid_from?: string
  valid_to?: string
  left?: number
  top?: number
  right?: number
  bottom?: number
}

// Geometry is shared by pages and items (same coordinate space), so the client
// can place each item's box within its page.
interface Box {
  left: number
  top: number
  right: number
  bottom: number
}
export interface FlyerPage extends Box {
  id: number | null
  page: number
}
export interface FlyerItem extends Box {
  id: number | null
  name: string
  price: number | null
  unitPrice: number | null
  unitLabel: string | null
  unitKind: UnitKind | null
  validFrom: string | null
  validTo: string | null
  image: string | null
}

// Flyer images are served over http://; upgrade so an https app doesn't drop
// them as mixed content. (Same host serves them fine over https.)
const https = (u: string | null | undefined): string | null =>
  u ? u.replace(/^http:\/\//, 'https://') : null

const box = (o: { left?: number; top?: number; right?: number; bottom?: number }): Box => ({
  left: o.left ?? 0,
  top: o.top ?? 0,
  right: o.right ?? 0,
  bottom: o.bottom ?? 0,
})

export const onRequestGet = authed(async (ctx, actor) => {
  const url = new URL(ctx.request.url)
  const id = url.searchParams.get('id')?.trim()
  const postalRaw = url.searchParams.get('postal')?.trim()
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'fr'

  if (!id || !/^\d+$/.test(id)) return badRequest('id de circulaire requis.')

  let postal: string | null = null
  if (postalRaw) {
    if (!isPostal(postalRaw)) return badRequest('Code postal invalide (ex. H2X 1Y4).')
    postal = normalizePostal(postalRaw)
  } else {
    postal = await householdPostal(ctx.env, actor.householdId)
  }
  if (!postal) return badRequest('Code postal requis — réglez-le dans les réglages.')

  const endpoint =
    `https://backflipp.wishabi.com/flipp/flyers/${encodeURIComponent(id)}` +
    `?locale=${lang}-ca&postal_code=${encodeURIComponent(postal)}`

  let payload: { pages?: RawPage[]; items?: RawItem[] }
  try {
    const res = await fetch(endpoint, {
      headers: { accept: 'application/json', 'user-agent': 'Babillard/0.1 (+household planner)' },
    })
    if (!res.ok) return serviceUnavailable('Circulaire indisponible.')
    payload = await res.json()
  } catch {
    return serviceUnavailable('Circulaire indisponible.')
  }

  const pages: FlyerPage[] = (payload.pages ?? [])
    .map((p) => ({ id: p.id ?? null, page: p.page ?? 0, ...box(p) }))
    .sort((a, b) => a.page - b.page)

  const items: FlyerItem[] = (payload.items ?? [])
    .map((it) => {
      const u = computeUnitPrice({
        price: typeof it.price === 'number' ? it.price : null,
        name: it.name,
        prePriceText: it.pre_price_text,
        postPriceText: it.post_price_text,
      })
      return {
        id: it.id ?? null,
        name: it.name ?? '',
        price: typeof it.price === 'number' ? it.price : null,
        unitPrice: u?.unitPrice ?? null,
        unitLabel: u?.unitLabel ?? null,
        unitKind: u?.unitKind ?? null,
        validFrom: it.valid_from ?? null,
        validTo: it.valid_to ?? null,
        image: https(it.cutout_image_url),
        ...box(it),
      }
    })
    .filter((it) => it.image)

  return ok({ flyerId: Number(id), postal, pages, items })
})
