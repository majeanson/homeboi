import { badRequest, ok, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { isPostal, normalizePostal, householdPostal } from '../_lib/postal'
import { householdIncludedStores, storeKey } from '../_lib/stores'
import { resolveLang } from '../_lib/ai'

// PROOF OF CONCEPT — list the grocery flyers near the household, so you can open a
// store's whole flyer (Super C, IGA…) WITHOUT searching for an item. Same
// undocumented Flipp backend + caveats as deals.ts/flyer.ts (no key, free, ToS-
// adjacent, private family tool only).
//
//   GET /api/flyers   → { flyers: [{ flyerId, merchant, logo, validFrom, validTo }] }
//
// Filters to grocery flyers (Flipp tags each with `categories`) and keeps one per
// merchant — otherwise the postal returns ~140 flyers across hardware, pharmacy,
// etc. Degrades to 503 if Flipp changes/blocks the endpoint so the UI can hide the
// store picker rather than error.

interface FlippFlyer {
  id?: number
  merchant?: string
  merchant_logo?: string
  valid_from?: string
  valid_to?: string
  categories?: string[]
  premium?: boolean // image-based (scanned) flyer vs SFML reconstruction
}

export interface FlyerSummary {
  flyerId: number
  merchant: string
  logo: string | null
  validFrom: string | null
  validTo: string | null
  // Image-based (scanned) flyer — its reconstruction uses real flyer clippings, so
  // the viewer can present it as the official flyer. False = SFML vector flyer.
  premium: boolean
  // Only set in ?manage=1 (settings) responses: whether this store is currently
  // kept by the household's store allowlist. Omitted from the normal feed.
  included?: boolean
}

const https = (u: string | null | undefined): string | null =>
  u ? u.replace(/^http:\/\//, 'https://') : null

export const onRequestGet = authed(async (ctx, actor) => {
  const url = new URL(ctx.request.url)
  const postalRaw = url.searchParams.get('postal')?.trim()
  // ?manage=1 is the settings store-filter view: it returns every grocery store
  // (including ones outside the allowlist) each tagged with `included`, so the
  // operator can toggle them. The normal feed drops non-included stores entirely.
  const manage = url.searchParams.get('manage') === '1'
  const qlang = url.searchParams.get('lang')
  const lang = qlang === 'en' || qlang === 'fr' ? qlang : resolveLang(ctx.env, ctx.request)

  let postal: string | null = null
  if (postalRaw) {
    if (!isPostal(postalRaw)) return badRequest('Code postal invalide (ex. H2X 1Y4).')
    postal = normalizePostal(postalRaw)
  } else {
    postal = await householdPostal(ctx.env, actor.householdId)
  }
  if (!postal) return badRequest('Code postal requis — réglez-le dans les réglages.')

  const included = new Set(await householdIncludedStores(ctx.env, actor.householdId))

  const endpoint =
    'https://backflipp.wishabi.com/flipp/flyers' +
    `?locale=${lang}-ca&postal_code=${encodeURIComponent(postal)}`

  let payload: { flyers?: FlippFlyer[] }
  try {
    const res = await fetch(endpoint, {
      headers: { accept: 'application/json', 'user-agent': 'Babillard/0.1 (+household planner)' },
    })
    if (!res.ok) return serviceUnavailable('Service de circulaires indisponible.')
    payload = await res.json()
  } catch {
    return serviceUnavailable('Service de circulaires indisponible.')
  }

  // Food-shopping flyers, one per merchant (first wins — Flipp returns them
  // roughly by priority), sorted by store name for a stable picker. We keep
  // Groceries AND Pharmacy (Jean Coutu, Pharmaprix… carry groceries) so a real
  // grocery run isn't missing stores; everything else (hardware, electronics,
  // fashion, auto, pets, restaurants…) is dropped. Flipp's category labels come
  // back in English regardless of locale, but match case-insensitively to be safe.
  const KEEP = ['groceries', 'pharmacy']
  const seen = new Set<string>()
  const flyers: FlyerSummary[] = []
  for (const f of payload.flyers ?? []) {
    if (typeof f.id !== 'number' || !f.merchant) continue
    const cats = (f.categories ?? []).map((c) => c.toLowerCase())
    if (!cats.some((c) => KEEP.includes(c))) continue
    const key = storeKey(f.merchant)
    if (seen.has(key)) continue
    seen.add(key)
    // Empty allowlist = no filter, so every store counts as included. Normal feed:
    // non-included stores are simply dropped so nothing downstream sees them.
    // Manage view: keep them all and tag the state for the settings toggle.
    const isIncluded = included.size === 0 || included.has(key)
    if (!isIncluded && !manage) continue
    flyers.push({
      flyerId: f.id,
      merchant: f.merchant,
      logo: https(f.merchant_logo),
      validFrom: f.valid_from ?? null,
      validTo: f.valid_to ?? null,
      premium: f.premium ?? false,
      ...(manage ? { included: isIncluded } : {}),
    })
  }
  flyers.sort((a, b) => a.merchant.localeCompare(b.merchant))

  return ok({ postal, count: flyers.length, flyers })
})
