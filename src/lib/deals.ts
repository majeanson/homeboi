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
export const money = (n: number | null): string => (n == null ? '' : `${n.toFixed(2).replace('.', ',')} $`)
