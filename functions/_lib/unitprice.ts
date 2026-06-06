// Unit-price parsing for flyer deals: turn a messy item ("Natrel ... 3% 2L",
// "2/" multi-buy, size sometimes only in post_price_text) into a comparable
// price per kilogram / per litre so the list can be ordered best-value first.
//
// Source data is inconsistent — many flyer items simply don't state a size — so
// this returns null rather than guessing when it can't find one. The UI shows a
// unit price only when we actually have it; it never fabricates one.

export type UnitKind = 'mass' | 'volume'

export interface UnitPrice {
  unitPrice: number // price per base display unit (per kg for mass, per L for volume)
  unitLabel: string // '/kg' | '/L'
  unitKind: UnitKind
}

// Multipliers to a base unit: grams for mass, millilitres for volume.
const MASS: Record<string, number> = {
  mg: 0.001,
  g: 1,
  gr: 1,
  gramme: 1,
  grammes: 1,
  kg: 1000,
  kilo: 1000,
  kilos: 1000,
  lb: 453.592,
  lbs: 453.592,
  livre: 453.592,
  livres: 453.592,
  oz: 28.3495,
}
const VOL: Record<string, number> = {
  ml: 1,
  millilitre: 1,
  millilitres: 1,
  cl: 10,
  dl: 100,
  l: 1000,
  litre: 1000,
  litres: 1000,
}

interface Size {
  kind: UnitKind
  base: number // grams or millilitres
}

// Plausible package-size window for a grocery flyer item, in base units (g / ml).
// Outside this, the "size" is almost certainly a parse error — most often a
// leading product/SKU code read as grams (a 6-digit code like "994949" implies
// ~995 kg → a nonsense "$0.01/kg"). Real grocery items run from a ~1 g spice to a
// ~40 kg bag of dog food or 24-can case of water, so 50 kg / 50 L is a safe ceiling.
const MIN_BASE = 1
const MAX_MASS = 50_000 // 50 kg in grams
const MAX_VOL = 50_000 // 50 L in millilitres

// Flyer names frequently carry a leading numeric SKU/product code ("994949
// FROMAGE …"). It has no unit so the size regex ignores it, but the AI sniper
// (which sees the raw name) can mistake it for a gram size — so strip a leading
// run of 5+ digits before sizing. Real sizes top out at 4 digits ("1000 ml",
// "2000 g") and always carry a unit, so this never eats a genuine size.
export function stripProductCode(name: string): string {
  return name.replace(/^\s*\d{5,}\b\s*/, '')
}

// Pull the first size token out of a string. Handles "N x SIZE unit" packs and
// plain "SIZE unit". `g` and `l` are matched in a second pass so they don't
// greedily shadow `kg`/`ml`/etc.
function parseSize(str: string | null | undefined): Size | null {
  if (!str) return null
  const t = stripProductCode(str.toLowerCase().replace(',', '.'))

  const pack = t.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|mg|g|gr|ml|cl|dl|l|oz|lbs|lb)\b/)
  if (pack) {
    const n = Number(pack[1])
    const sz = Number(pack[2])
    const u = pack[3]
    if (MASS[u]) return { kind: 'mass', base: MASS[u] * sz * n }
    if (VOL[u]) return { kind: 'volume', base: VOL[u] * sz * n }
  }

  const multi =
    t.match(/(\d+(?:\.\d+)?)\s*(kg|mg|ml|cl|dl|oz|lbs|lb|kilos?|millilitres?|litres?)\b/) ||
    t.match(/(\d+(?:\.\d+)?)\s*(g|gr|l)\b/)
  if (multi) {
    const sz = Number(multi[1])
    const u = multi[2]
    if (MASS[u]) return { kind: 'mass', base: MASS[u] * sz }
    if (VOL[u]) return { kind: 'volume', base: VOL[u] * sz }
  }
  return null
}

// How many items the advertised price covers. "2/" (deux pour) => 2, so the
// per-each price is price/2. Defaults to 1.
function multiBuy(prePriceText: string | null | undefined): number {
  const m = (prePriceText ?? '').match(/(\d+)\s*\//)
  const n = m ? Number(m[1]) : 1
  return n > 0 ? n : 1
}

export interface UnitPriceInput {
  price: number | null
  name?: string | null
  prePriceText?: string | null
  postPriceText?: string | null
}

// Compute a comparable unit price, or null when no size is stated.
export function computeUnitPrice(it: UnitPriceInput): UnitPrice | null {
  if (typeof it.price !== 'number') return null
  const size = parseSize(it.name) ?? parseSize(it.postPriceText)
  if (!size) return null
  // Reject an implausible size rather than emit an absurd unit price. This is the
  // backstop for the AI sniper: it re-runs its extracted string through here, so a
  // hallucinated "994949 g" lands as null, not "$0.01/kg".
  if (size.base < MIN_BASE) return null
  if (size.kind === 'mass' ? size.base > MAX_MASS : size.base > MAX_VOL) return null
  const each = it.price / multiBuy(it.prePriceText)
  if (size.kind === 'mass') {
    return { unitPrice: each / (size.base / 1000), unitLabel: '/kg', unitKind: 'mass' }
  }
  return { unitPrice: each / (size.base / 1000), unitLabel: '/L', unitKind: 'volume' }
}
