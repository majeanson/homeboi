// Shared shapes for flyer deals, used by the proof sheet, the list, and the
// cashier stepper. Mirrors the /api/deals `Deal` shape on the server.
export interface Deal {
  id: number | null
  flyerId: number | null
  name: string
  price: number | null
  wasPrice: number | null
  unitPrice: number | null
  unitLabel: string | null
  unitKind: 'mass' | 'volume' | null
  unitApprox: boolean // size inferred by AI rather than stated in the text
  merchant: string
  logo: string | null // store logo, for the flyer/cashier header band
  premium: boolean // image-based (scanned) flyer → reconstruction uses real clippings
  image: string | null
  validFrom: string | null
  validTo: string | null
}

// A store's current flyer near the household (from /api/flyers) — lets you open a
// whole flyer by store without searching an item.
export interface FlyerSummary {
  flyerId: number
  merchant: string
  logo: string | null
  validFrom: string | null
  validTo: string | null
  premium?: boolean // image-based (scanned) flyer vs SFML reconstruction
  // Only present in the settings store-filter feed (/api/flyers?manage=1):
  // whether the household's allowlist currently keeps this store.
  included?: boolean
}

// A deal the user picked to price-match, kept against the grocery item it's for.
export interface Pick {
  itemId: string
  itemText: string
  deal: Deal
}

// fr-CA convention (the household + the flyers are Québec): comma decimal, the
// dollar sign AFTER the amount with a non-breaking space — "4,99 $", not "$4.99".
// The short flyer date ("5 sept." / "Sep 5") — the ONE implementation for every
// deal surface (DealCard, CashierMode, FlyerViewer, La liste's zoom caption),
// which each used to carry an identical local copy.
export function dealDate(iso: string | null, lang: 'fr' | 'en'): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { month: 'short', day: 'numeric' })
}

// « Est-ce encore l'aubaine ? » answered structurally: the deal has ENDED once its
// validTo DAY is fully past — valid THROUGH that day, so it is never flagged early
// on its own last day. The calendar date is read literally as LOCAL rather than
// through Date parsing (new Date('2026-09-01') is UTC midnight = the evening of
// Aug 31 in Québec — off by a day). No / unparseable validTo → not flagged:
// unknown validity is not the same thing as an ended deal.
export function dealEnded(validTo: string | null | undefined, now = Date.now()): boolean {
  if (!validTo) return false
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(validTo)
  if (!m) return false
  const endOfDay = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1)
  return now >= endOfDay.getTime()
}

export const money = (n: number | null): string => (n == null ? '' : `${n.toFixed(2).replace('.', ',')} $`)

// The validity SPAN a cashier checks — "11 juin au 17 juin", or "jusqu'au 17 juin"
// when the ad only states an end. One implementation for every surface that holds a
// deal up as proof: FlyerViewer's header had it (« reebee shows it but our
// reconstruction dropped it ») while CashierMode — the surface actually presented at
// the till — showed only the end date, which is half of what makes an ad current.
// Words are passed in rather than imported so this file stays free of i18n.
export function dealValidity(
  validFrom: string | null,
  validTo: string | null,
  lang: 'fr' | 'en',
  words: { rangeTo: string; until: string },
): string {
  const from = dealDate(validFrom, lang)
  const to = dealDate(validTo, lang)
  if (from && to) return `${from} ${words.rangeTo} ${to}`
  return to ? `${words.until} ${to}` : from
}

// The official Flipp web flyer for a store's circular — the dense scanned pages our
// in-app reconstruction stands in for. ONE implementation: FlyerViewer's toolbar link
// and the till peek's source line both need it, and the second was about to grow a
// copy (2026-09-10).
//
// Flipp routes client-side on the numeric id + postal_code, so the merchant slug is
// cosmetic; we build it from the store name (accents stripped, spaces → hyphens:
// "Super C" → "super-c", "Métro" → "metro"). `postal` is optional because the till
// card knows the deal but not the household's postal code — the link still resolves,
// it just may not pre-pick the nearest store.
export function flippFlyerUrl(
  flyerId: number,
  merchant: string | null,
  lang: 'fr' | 'en',
  postal?: string | null,
): string {
  const slug =
    (merchant ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'circulaire'
  const pc = postal ? `?postal_code=${encodeURIComponent(postal)}` : ''
  return `https://flipp.com/${lang}-ca/circulaire/${flyerId}-${slug}-circulaire${pc}`
}


// « Montrer Flipp » — Flipp's own PAGE for one flyer item: the store's logo, the
// clipping, the name, the price, « Valide du … au … » and the format in its
// description. Verified in a real browser on 2026-09-10 with a live id (Lactantia
// at Adonis) — this is what a cashier who says "that's not one of the three apps"
// gets handed: the accepted channel, already open on the item, no hunting.
//
// Two things the probe established, both load-bearing:
//   · it NEEDS `postal_code`. Without it the page renders Flipp's error state, so
//     the caller must not build a link it cannot make work — return null instead of
//     a URL that fails in front of a cashier.
//   · `fr-ca` renders; `en-ca` redirected to a broken "Undefined store" page in the
//     same probe. So the locale is pinned to fr-ca whatever the UI language — the
//     page is bilingual anyway (the item name carries both).
// `/flyer_item/…` is NOT a route (404) — do not "fix" this to that shape.
export function flippItemUrl(flyerItemId: number | null, postal: string | null | undefined): string | null {
  if (flyerItemId == null || !postal) return null
  return `https://flipp.com/fr-ca/item/${flyerItemId}?postal_code=${encodeURIComponent(postal)}`
}

// « Voir ma liste Flipp » — Flipp's own shopping-list page. What it shows is whatever
// THIS browser (or, on Android, the Flipp app that claims flipp.com links) has
// clipped: probed 2026-09-10, « Ajouter à la liste » on flipp.com writes that
// browser's localStorage and makes no request, the page reads no URL parameter, and
// there is no API that writes a Flipp list. So this door is the END of a loop that
// runs through Flipp's own button, never a list we filled. Same postal rule as the
// item page (see above) — the page was only ever seen rendering with one.
//
// NO locale prefix. `/fr-ca/liste_dachats` is the marketing shell (it renders the
// flyers home with a list BADGE, which is how the wrong route shipped for an hour on
// 2026-09-10); the app route table maps `/liste_dachats` and `/shopping_list` — bare —
// to the list view, and that is where Flipp's own list icon navigates.
export function flippListUrl(postal: string | null | undefined): string | null {
  if (!postal) return null
  return `https://flipp.com/liste_dachats?postal_code=${encodeURIComponent(postal)}`
}
