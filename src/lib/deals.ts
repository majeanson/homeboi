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
