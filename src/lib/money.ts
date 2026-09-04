import type { Lang } from '../i18n'

// Money formatting for the optional Projet/Entretien target budget (#home-projects).
// Stored as integer cents; shown as a whole-dollar CAD amount in the active locale
// ("15 000 $" in FR-CA, "$15,000" in EN-CA). NFR-CALM-1: this is a descriptive
// TARGET only — there is no saved-so-far / progress figure to format.

// cents → localized currency string. null/undefined/NaN → '' (nothing to show).
// Formatter cached per lang — constructing one costs ~100 µs and this runs per
// project row (same class as the lib/format.ts caches).
const moneyFmtCache = new Map<Lang, Intl.NumberFormat>()
export function formatMoney(cents: number | null | undefined, lang: Lang): string {
  if (cents == null || !Number.isFinite(cents)) return ''
  let f = moneyFmtCache.get(lang)
  if (!f) {
    f = new Intl.NumberFormat(lang === 'en' ? 'en-CA' : 'fr-CA', {
      style: 'currency',
      currency: 'CAD',
      maximumFractionDigits: 0,
    })
    moneyFmtCache.set(lang, f)
  }
  return f.format(cents / 100)
}

// A free-typed dollar amount → integer cents for storage. Tolerates spaces, a
// leading "$", and either separator ("15 000", "15,000", "1500.50"). Empty/invalid
// → null (clears the budget). Whole dollars only (rounds to the nearest cent).
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[^0-9.,-]/g, '').replace(/\s/g, '')
  if (!cleaned) return null
  // Treat a comma as a thousands separator (FR groups with spaces/commas); keep a
  // dot as the decimal point. Strip commas, then parse.
  const n = Number(cleaned.replace(/,/g, ''))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}
