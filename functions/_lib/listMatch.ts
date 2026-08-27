import { normalizeItem } from './normalize'

// Does an existing grocery line already answer for an incoming (flyer) name?
// SERVER MIRROR of `matchListItem` in src/lib/picks.tsx — the reuse-not-duplicate
// decision (deal ↔ item doctrine: a flyer deal rides on the generic recurring
// line, never a specific-named copy). The client decides first against its cached
// board list; this is the backstop for a cold cache / an offline replay. Keep the
// two in step — the client's picks.test.ts and this file's listMatch.test.ts
// cover the same cases on purpose.

// A saved synonym is sometimes typed as ONE comma list ("apple, apples, pomme")
// instead of one chip per word — that is what a household actually does, and
// `/api/deals?terms=` has always split it that way for the lookup. Matching must
// split it too, or the very line that carries the synonyms never recognizes its
// own flyer names ("Chicken breast, boneless" spawned a duplicate beside "Poulet").
const TERM_SPLIT = /[,;/|\n]+/

function splitTerms(raw: string): string[] {
  return raw.split(TERM_SPLIT).map((s) => s.trim()).filter(Boolean)
}

// Stored synonyms (a JSON array of strings) → the flat term list, comma lists
// unpacked. [] on absent/malformed — a bad blob matches on the name alone.
export function parseTerms(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const a = JSON.parse(json)
    if (!Array.isArray(a)) return []
    return a.filter((x): x is string => typeof x === 'string').flatMap(splitTerms)
  } catch {
    return []
  }
}

// Incoming synonyms → the array to store: split, trimmed, de-blanked, deduped
// (case/accent-insensitively), capped at 12. Splitting on the way IN means a
// comma list typed once is stored as real separate synonyms from then on.
export function normTerms(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    for (const term of splitTerms(String(raw))) {
      const key = normalizeItem(term)
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(term)
      if (out.length >= 12) return out
    }
  }
  return out
}

// Crude per-word singular fold, mirror of src/lib/picks.tsx: « pommes » still
// finds « Pomme Gala 3 lb ». Trailing 's' on 4+ letter words only.
function singularWords(key: string): string {
  return key
    .split(' ')
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ')
}

// Exact normalized name, exact synonym, or the LINE's generic name/synonym
// contained whole-word in the specific product name (one direction only — a deal
// searched as "oeufs" must NOT land on an "Oeufs en chocolat" line). Flattened:
// the client's tier preference is approximated here by the caller's
// open-before-checked row ordering.
export function lineMatches(nameKey: string, line: { text: string; search_terms: string | null }): boolean {
  const hay = ` ${singularWords(nameKey)} `
  const keys = [normalizeItem(line.text), ...parseTerms(line.search_terms).map(normalizeItem)]
  return keys.some((k) => !!k && (k === nameKey || (k.length >= 3 && hay.includes(` ${singularWords(k)} `))))
}
