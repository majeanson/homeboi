// Base "renew" staples for the ghost list — the ~90% of a grocery list that's
// the same handful of things every week (eggs, bread, milk). Code-defined so
// the feature is useful on day one, before any purchase history exists; once you
// actually buy them, your real cadence (learned from purchase_log) takes over.
//
// Keys are the NORMALIZED form (see normalizeItem) so a seeded staple and the
// same thing you type by hand collapse to one ghost. Labels are localized FR/EN
// like the routine/chore templates in src/lib/routineTemplates.ts.
//
// The operator can retune cadence, mute, or add their own via the Settings
// "Liste fantôme" section (a ghost_items override row) — these are just defaults.

export type Lang = 'fr' | 'en'

export interface StapleDef {
  key: string
  cadenceDays: number
  label: string
}

interface RawStaple {
  key: string
  cadenceDays: number
  label: Record<Lang, string>
}

const STAPLES: RawStaple[] = [
  { key: 'oeufs', cadenceDays: 7, label: { fr: 'Œufs', en: 'Eggs' } },
  { key: 'pain', cadenceDays: 5, label: { fr: 'Pain', en: 'Bread' } },
  { key: 'lait', cadenceDays: 6, label: { fr: 'Lait', en: 'Milk' } },
  { key: 'beurre', cadenceDays: 14, label: { fr: 'Beurre', en: 'Butter' } },
  { key: 'cafe', cadenceDays: 21, label: { fr: 'Café', en: 'Coffee' } },
  { key: 'bananes', cadenceDays: 7, label: { fr: 'Bananes', en: 'Bananas' } },
  { key: 'fromage', cadenceDays: 14, label: { fr: 'Fromage', en: 'Cheese' } },
  { key: 'yogourt', cadenceDays: 10, label: { fr: 'Yogourt', en: 'Yogurt' } },
  { key: 'poulet', cadenceDays: 7, label: { fr: 'Poulet', en: 'Chicken' } },
  { key: 'pommes', cadenceDays: 10, label: { fr: 'Pommes', en: 'Apples' } },
  { key: 'oignons', cadenceDays: 14, label: { fr: 'Oignons', en: 'Onions' } },
  { key: 'papier toilette', cadenceDays: 21, label: { fr: 'Papier toilette', en: 'Toilet paper' } },
]

export function staples(lang: Lang): StapleDef[] {
  return STAPLES.map((s) => ({ key: s.key, cadenceDays: s.cadenceDays, label: s.label[lang] }))
}
