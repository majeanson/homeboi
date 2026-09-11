import type { Lang } from '../i18n'

// Money formatting for the optional Projet/Entretien target budget (#home-projects)
// and for « Les virements » (migration 0126). Stored as integer cents throughout.
// NFR-CALM-1: these are descriptive amounts — a target, a recorded cost, an amount
// sent — never a balance or a progress figure.

// cents → localized currency string, WHOLE DOLLARS ("15 000 $" in FR-CA,
// "$15,000" in EN-CA). null/undefined/NaN → '' (nothing to show).
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

// cents → localized currency string WITH cents ("3 112,82 $" / "$3,112.82").
// A separate cached formatter rather than a parameter on the one above: both are
// hot (one per row), and swapping options on a shared Intl instance is exactly the
// per-call construction intl-rule.test.ts exists to prevent.
//
// Rounding to the dollar is right for a budget you are describing and WRONG for a
// transfer you are about to send: « 812,82 $ » shown as « 813 $ » would be a number
// the household could not match against a bank statement.
const exactMoneyFmtCache = new Map<Lang, Intl.NumberFormat>()
export function formatMoneyExact(cents: number | null | undefined, lang: Lang): string {
  if (cents == null || !Number.isFinite(cents)) return ''
  let f = exactMoneyFmtCache.get(lang)
  if (!f) {
    f = new Intl.NumberFormat(lang === 'en' ? 'en-CA' : 'fr-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    exactMoneyFmtCache.set(lang, f)
  }
  return f.format(cents / 100)
}

// A free-typed dollar amount → integer cents for storage. Tolerates spaces (plain
// and non-breaking), a leading "$", and either separator. Empty/invalid → null.
//
// THE COMMA IS AMBIGUOUS, and this app is FR-CA first: « 812,82 » is eight hundred
// twelve dollars and eighty-two cents, while « 15,000 » is fifteen thousand. Reading
// every comma as a thousands separator (which this did until « Les virements » needed
// cents) turned a Québécois typing their mortgage share into a number a hundred times
// too large, silently. The rule now:
//   * a comma followed by exactly one or two digits AT THE END is a decimal mark;
//   * any other comma is grouping and is stripped;
//   * a dot stays the decimal mark, as before;
//   * if BOTH appear, the LAST one is the decimal mark ("1.234,56" and "1,234.56").
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[^0-9.,-]/g, '').replace(/\s/g, '')
  if (!cleaned) return null

  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalized: string
  if (lastComma >= 0 && lastDot >= 0) {
    // Both present: the rightmost separator is the decimal mark, the other groups.
    const decimalAt = Math.max(lastComma, lastDot)
    normalized = cleaned.slice(0, decimalAt).replace(/[.,]/g, '') + '.' + cleaned.slice(decimalAt + 1).replace(/[.,]/g, '')
  } else if (lastComma >= 0) {
    normalized = /,\d{1,2}$/.test(cleaned) ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '')
  } else {
    normalized = cleaned
  }

  const n = Number(normalized)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}
