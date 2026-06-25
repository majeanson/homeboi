import { pictoFor } from './picto'
import { normalizeItem } from './normalize'

// A bilingual label (FR-CA first), the app's standard { fr, en } shape.
type Bi = { fr: string; en: string }

// A per-item aisle override map: normalized item key → aisle id. Set in the list
// item's edit sheet, stored on the household (survives a clear, like ghost/purchase
// keys), so a mis-classified item ("granola" → snacks) stays put once corrected.
export type AisleOverrides = Record<string, AisleId>

// The stable key an override sticks to (accent/quantity-insensitive), so "oeufs"
// and "2 douzaines d'oeufs" share one override.
export const aisleKey = (text: string): string => normalizeItem(text)

// Aisle = a coarse grocery category, so the shared list can be SORTED to match a
// store's walk (produce → bakery → meat → dairy → …) instead of add-order. A calm
// convenience, never inventory: it groups + orders rows, it never counts them.
//
// The classifier reuses what the app already does for the row PICTURE: pictoFor()
// maps a free-text item ("lait", "2% milk") to one friendly emoji. We just map that
// emoji → an aisle. So the whole keyword table (FR + EN, hundreds of words) is reused
// for free — adding a grocery word to picto.ts classifies it here too, automatically.
// Anything pictoFor can't place (or a non-grocery note) falls to 'autres', last.

export type AisleId =
  | 'produce'
  | 'bakery'
  | 'meat'
  | 'dairy'
  | 'pantry'
  | 'frozen'
  | 'snacks'
  | 'drinks'
  | 'household'
  | 'autres'

export interface Aisle {
  id: AisleId
  emoji: string
  label: Bi
}

// The fixed set (phase 1: user-orderable, not user-editable). 'autres' is always the
// catch-all; it's pinned LAST regardless of the saved order (see aisleRank below).
export const AISLES: Aisle[] = [
  { id: 'produce', emoji: '🍎', label: { fr: 'Fruits & légumes', en: 'Produce' } },
  { id: 'bakery', emoji: '🍞', label: { fr: 'Boulangerie', en: 'Bakery' } },
  { id: 'meat', emoji: '🥩', label: { fr: 'Viandes & poissons', en: 'Meat & fish' } },
  { id: 'dairy', emoji: '🥛', label: { fr: 'Produits laitiers & œufs', en: 'Dairy & eggs' } },
  { id: 'pantry', emoji: '🥫', label: { fr: 'Épicerie', en: 'Pantry' } },
  { id: 'frozen', emoji: '🧊', label: { fr: 'Surgelés', en: 'Frozen' } },
  { id: 'snacks', emoji: '🍪', label: { fr: 'Collations & sucreries', en: 'Snacks & sweets' } },
  { id: 'drinks', emoji: '🥤', label: { fr: 'Breuvages', en: 'Drinks' } },
  { id: 'household', emoji: '🧹', label: { fr: 'Maison & ménage', en: 'Household' } },
  { id: 'autres', emoji: '🛒', label: { fr: 'Autres', en: 'Other' } },
]

export const AISLE_BY_ID: Record<AisleId, Aisle> = Object.fromEntries(AISLES.map((a) => [a.id, a])) as Record<
  AisleId,
  Aisle
>

// The picture pictoFor draws → which aisle it belongs to. Only grocery-ish emojis
// appear; anything else (kid-activity / transport pictos, or no match) → 'autres'.
const EMOJI_AISLE: Record<string, AisleId> = {
  // produce
  '🥔': 'produce', '🍎': 'produce', '🍌': 'produce', '🍊': 'produce', '🍇': 'produce',
  '🍓': 'produce', '🫐': 'produce', '🍉': 'produce', '🍑': 'produce', '🍒': 'produce',
  '🍐': 'produce', '🥝': 'produce', '🍍': 'produce', '🥥': 'produce', '🍋': 'produce',
  '🍅': 'produce', '🥕': 'produce', '🧅': 'produce', '🧄': 'produce', '🥬': 'produce',
  '🥦': 'produce', '🌽': 'produce', '🍄': 'produce', '🫑': 'produce', '🥒': 'produce',
  '🥑': 'produce', '🫒': 'produce',
  // meat & fish (sausage/hot-dog rides here too)
  '🥓': 'meat', '🍗': 'meat', '🍖': 'meat', '🥩': 'meat', '🐟': 'meat', '🦐': 'meat', '🌭': 'meat',
  // dairy & eggs
  '🥛': 'dairy', '🧈': 'dairy', '🧀': 'dairy', '🥚': 'dairy',
  // bakery
  '🍞': 'bakery', '🥐': 'bakery', '🥯': 'bakery',
  // pantry / dry staples (dry pasta, rice, honey, salt, cereal, canned soup)
  '🍝': 'pantry', '🍚': 'pantry', '🍯': 'pantry', '🧂': 'pantry', '🥣': 'pantry', '🍲': 'pantry',
  // snacks & sweets (nuts included)
  '🍪': 'snacks', '🍰': 'snacks', '🧁': 'snacks', '🍫': 'snacks', '🍬': 'snacks',
  '🍩': 'snacks', '🍿': 'snacks', '🥜': 'snacks',
  // frozen
  '🍦': 'frozen',
  // drinks
  '☕': 'drinks', '🍵': 'drinks', '🧃': 'drinks', '🥤': 'drinks', '💧': 'drinks',
  // household / cleaning
  '🧹': 'household', '🧺': 'household',
}

// Classify one free-text list item into an aisle. A per-item override (if any) wins;
// otherwise reuse the row picture (pictoFor emoji → aisle), else 'autres'.
// Deterministic, offline, calm.
export function aisleFor(text: string, overrides?: AisleOverrides): AisleId {
  if (overrides) {
    const ov = overrides[aisleKey(text)]
    if (ov && AISLE_BY_ID[ov]) return ov
  }
  return EMOJI_AISLE[pictoFor(text, '')] ?? 'autres'
}

// Resolve a household's saved aisle ORDER (an array of AisleId) into a rank lookup
// for sorting. Unknown/missing ids fall back to the default order; 'autres' is always
// pinned last so unclassified items never wedge between real aisles.
export function aisleRanks(order: AisleId[] | null | undefined): Record<AisleId, number> {
  const seen = new Set<AisleId>()
  const ordered: AisleId[] = []
  for (const id of order ?? []) if (AISLE_BY_ID[id] && !seen.has(id)) (seen.add(id), ordered.push(id))
  // Append any aisle the saved order didn't mention (e.g. a newly added built-in),
  // in default order, so the set is always complete.
  for (const a of AISLES) if (!seen.has(a.id)) ordered.push(a.id)
  const ranks = {} as Record<AisleId, number>
  ordered.forEach((id, i) => (ranks[id] = id === 'autres' ? Number.MAX_SAFE_INTEGER : i))
  return ranks
}

// The default order = the AISLES declaration order (a typical store walk).
export const DEFAULT_AISLE_ORDER: AisleId[] = AISLES.map((a) => a.id)
