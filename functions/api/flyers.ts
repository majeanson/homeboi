import { badRequest, ok, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { isPostal, normalizePostal, householdPostal } from '../_lib/postal'

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
}

export interface FlyerSummary {
  flyerId: number
  merchant: string
  logo: string | null
  validFrom: string | null
  validTo: string | null
}

const https = (u: string | null | undefined): string | null =>
  u ? u.replace(/^http:\/\//, 'https://') : null

export const onRequestGet = authed(async (ctx, actor) => {
  const url = new URL(ctx.request.url)
  const postalRaw = url.searchParams.get('postal')?.trim()
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'fr'

  let postal: string | null = null
  if (postalRaw) {
    if (!isPostal(postalRaw)) return badRequest('Code postal invalide (ex. H2X 1Y4).')
    postal = normalizePostal(postalRaw)
  } else {
    postal = await householdPostal(ctx.env, actor.householdId)
  }
  if (!postal) return badRequest('Code postal requis — réglez-le dans les réglages.')

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

  // Grocery only, one flyer per merchant (first wins — Flipp returns them roughly
  // by priority), sorted by store name for a stable picker.
  const seen = new Set<string>()
  const flyers: FlyerSummary[] = []
  for (const f of payload.flyers ?? []) {
    if (typeof f.id !== 'number' || !f.merchant) continue
    if (!f.categories?.includes('Groceries')) continue
    const key = f.merchant.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    flyers.push({
      flyerId: f.id,
      merchant: f.merchant,
      logo: https(f.merchant_logo),
      validFrom: f.valid_from ?? null,
      validTo: f.valid_to ?? null,
    })
  }
  flyers.sort((a, b) => a.merchant.localeCompare(b.merchant))

  return ok({ postal, count: flyers.length, flyers })
})
