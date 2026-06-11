import type { Env } from '../_lib/env'
import { badRequest, ok, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { isPostal, normalizePostal, householdPostal } from '../_lib/postal'
import { householdIncludedStores, storeKey } from '../_lib/stores'
import { computeUnitPrice, stripProductCode, type UnitKind } from '../_lib/unitprice'
import { extractSizes, resolveLang } from '../_lib/ai'
import { ingredientName } from '../_lib/ingredient'

// PROOF OF CONCEPT — flyer-deal lookup (the "Reebee replacement" half).
//
// This rides on Flipp's UNDOCUMENTED mobile backend (backflipp.wishabi.com),
// the same endpoint the Reebee/Flipp apps call. There is no official API and
// no key: it's free but unsupported, against Flipp's ToS, and can break or get
// IP-blocked without warning. Fine for a private family tool; do NOT ship this
// to a public/multi-user product. See the chat that introduced it.
//
// Read-only and server-side (keeps the call off the client → no CORS, and the
// origin IP is our Worker, not every visitor). Given a query + postal code it
// returns current flyer deals near that postal code so the grocery list can be
// annotated with "on sale at X this week, $Y".
//
//   GET /api/deals?q=lait&postal=H2X1Y4&lang=fr
//
// Degrades to 503 if Flipp changes/blocks the endpoint, so the list UI can just
// hide the deals strip rather than error.

interface FlippItem {
  name?: string
  current_price?: number | null
  original_price?: number | null
  merchant_name?: string
  merchant_logo?: string
  premium?: boolean // image-based (scanned) flyer vs SFML reconstruction
  clean_image_url?: string
  clipping_image_url?: string
  flyer_item_id?: number
  flyer_id?: number
  pre_price_text?: string | null
  post_price_text?: string | null
  valid_from?: string
  valid_to?: string
}

export interface Deal {
  id: number | null
  flyerId: number | null // the flyer this item lives on -> opens the full flyer
  name: string
  price: number | null
  wasPrice: number | null
  unitPrice: number | null // normalized $/kg or $/L, null when no size is stated
  unitLabel: string | null // '/kg' | '/L'
  unitKind: UnitKind | null
  unitApprox: boolean // true when the size came from the AI sniper, not the text
  merchant: string
  logo: string | null // store logo (for the flyer/cashier header band)
  // True for image-based (scanned) flyers — Super C, Métro, IGA… — whose
  // reconstruction uses real flyer clippings. False for SFML flyers (Maxi,
  // Provigo) that are vector-only, so the viewer can flag it as a reconstruction.
  premium: boolean
  image: string | null
  validFrom: string | null
  validTo: string | null
}

// Flyer images are http://; upgrade so an https app doesn't drop them.
const https = (u: string | null | undefined): string | null =>
  u ? u.replace(/^http:\/\//, 'https://') : null

// One Flipp query → raw items. Throws on a network error or non-200 so the caller
// can decide (503 for the primary term, silently skip for synonym terms).
async function flippSearch(term: string, postal: string, lang: 'fr' | 'en'): Promise<FlippItem[]> {
  const endpoint =
    'https://backflipp.wishabi.com/flipp/items/search' +
    `?locale=${lang}-ca&postal_code=${encodeURIComponent(postal)}&q=${encodeURIComponent(term)}`
  const res = await fetch(endpoint, {
    headers: { accept: 'application/json', 'user-agent': 'Babillard/0.1 (+household planner)' },
  })
  if (!res.ok) throw new Error('flipp')
  const payload = (await res.json()) as { items?: FlippItem[] }
  return payload.items ?? []
}

export const onRequestGet = authed(async (ctx, actor) => {
  const url = new URL(ctx.request.url)
  const q = url.searchParams.get('q')?.trim()
  const postalRaw = url.searchParams.get('postal')?.trim()
  // Explicit ?lang wins; otherwise honour the X-Lang header the client sends on
  // every call (so an EN household gets en-ca flyer results, not fr-ca).
  const qlang = url.searchParams.get('lang')
  const lang = qlang === 'en' || qlang === 'fr' ? qlang : resolveLang(ctx.env, ctx.request)

  if (!q) return badRequest('q requis.')
  // Search by the bare item word ("2 œufs" → "Œufs", "15 ml de beurre" → "Beurre")
  // so a flyer query matches the most deals instead of failing on a measured line.
  // Optional ?terms=a,b,c folds in the line's saved synonyms (edit sheet) so "Œuf"
  // can also fan out to "egg"/"oeufs". Each is reduced to its bare word, deduped,
  // and the set is capped so the Flipp fan-out stays small.
  const extraTerms = (url.searchParams.get('terms') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const terms = [...new Set([q, ...extraTerms].map(ingredientName).filter(Boolean))].slice(0, 6)

  // Explicit ?postal wins; otherwise fall back to the household's saved code so
  // the client doesn't have to pass it on every call (set in Operator).
  let postal: string | null = null
  if (postalRaw) {
    if (!isPostal(postalRaw)) return badRequest('Code postal invalide (ex. H2X 1Y4).')
    postal = normalizePostal(postalRaw)
  } else {
    postal = await householdPostal(ctx.env, actor.householdId)
  }
  if (!postal) return badRequest('Code postal requis — réglez-le dans les réglages.')

  // Only the stores the operator kept in the settings allowlist make it onto the
  // list. An empty allowlist means no filter — every store is considered.
  const included = new Set(await householdIncludedStores(ctx.env, actor.householdId))

  // The primary term must resolve (so a real Flipp outage still surfaces as 503);
  // the synonyms are best-effort enrichment — a failing alias just adds nothing.
  let rawItems: FlippItem[]
  try {
    rawItems = await flippSearch(terms[0], postal, lang)
  } catch {
    return serviceUnavailable('Service de circulaires indisponible.')
  }
  for (const term of terms.slice(1)) {
    try {
      rawItems.push(...(await flippSearch(term, postal, lang)))
    } catch {
      /* synonym lookups are optional — skip on failure */
    }
  }
  // Same flyer item can surface under several synonyms; keep the first of each
  // (by flyer_item_id, falling back to name|merchant|price for id-less rows).
  const seen = new Set<string>()
  const merged = rawItems.filter((it) => {
    const k =
      it.flyer_item_id != null
        ? `id:${it.flyer_item_id}`
        : `nm:${it.name}|${it.merchant_name}|${it.current_price}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  const deals: Deal[] = merged
    .map((it) => {
      const u = computeUnitPrice({
        price: typeof it.current_price === 'number' ? it.current_price : null,
        name: it.name,
        prePriceText: it.pre_price_text,
        postPriceText: it.post_price_text,
      })
      return {
        id: it.flyer_item_id ?? null,
        flyerId: it.flyer_id ?? null,
        name: it.name ?? '',
        price: typeof it.current_price === 'number' ? it.current_price : null,
        wasPrice: typeof it.original_price === 'number' ? it.original_price : null,
        unitPrice: u?.unitPrice ?? null,
        unitLabel: u?.unitLabel ?? null,
        unitKind: u?.unitKind ?? null,
        unitApprox: false,
        merchant: it.merchant_name ?? '',
        logo: https(it.merchant_logo),
        premium: it.premium ?? false,
        image: https(it.clean_image_url ?? it.clipping_image_url),
        validFrom: it.valid_from ?? null,
        validTo: it.valid_to ?? null,
      }
    })
    .filter((d) => d.name && d.price !== null && (included.size === 0 || included.has(storeKey(d.merchant))))

  await sniperFill(ctx.env, deals, lang)
  sortBestFirst(deals)
  return ok({ query: q, postal, count: deals.length, deals })
})

// AI size-sniper fallback: for deals the regex couldn't size, ask the model to
// pull a size string out of the name (one batched call, capped), then run that
// string back through computeUnitPrice — so the AI only proposes wording and the
// trusted parser still does the math. Marks the result approximate (≈). No-op
// without env.AI or when nothing needs filling; any failure leaves deals as-is.
const SNIPER_CAP = 24
async function sniperFill(env: Env, deals: Deal[], lang: 'fr' | 'en'): Promise<void> {
  if (!env.AI) return
  const gaps: number[] = []
  for (let i = 0; i < deals.length && gaps.length < SNIPER_CAP; i++) {
    if (deals[i].unitPrice == null && deals[i].price != null) gaps.push(i)
  }
  if (gaps.length === 0) return

  const sizes = await extractSizes(
    env,
    // Strip the leading SKU/product code first; otherwise the model reads it as a
    // gram size (the "994949 FROMAGE …" → "$0.01/kg" bug).
    gaps.map((i) => stripProductCode(deals[i].name)),
    lang,
  )
  sizes.forEach((size, k) => {
    if (!size) return
    const d = deals[gaps[k]]
    const u = computeUnitPrice({ price: d.price, name: size })
    if (u) {
      d.unitPrice = u.unitPrice
      d.unitLabel = u.unitLabel
      d.unitKind = u.unitKind
      d.unitApprox = true
    }
  })
}

// Order the deals best-value first. Comparing $/kg against $/L is meaningless,
// so we group by unit kind: the kind most items share (e.g. "/L" for milk) leads,
// sorted cheapest-per-unit first; then the other unit-priced kind; then deals
// with no parseable size, by raw price. This puts the genuinely-best buy on top
// while never ranking incomparable units against each other.
function sortBestFirst(deals: Deal[]): void {
  const tally = new Map<UnitKind, number>()
  for (const d of deals) if (d.unitPrice != null && d.unitKind) tally.set(d.unitKind, (tally.get(d.unitKind) ?? 0) + 1)
  let primary: UnitKind | null = null
  let best = -1
  for (const [k, n] of tally) if (n > best) (best = n), (primary = k)

  const rank = (d: Deal): number => {
    if (d.unitPrice != null && d.unitKind === primary) return 0
    if (d.unitPrice != null) return 1
    return 2
  }
  deals.sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb
    if (ra < 2) return (a.unitPrice ?? 0) - (b.unitPrice ?? 0) // by unit price
    return (a.price ?? Infinity) - (b.price ?? Infinity) // no unit -> raw price
  })
}
