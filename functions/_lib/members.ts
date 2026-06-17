import type { Env } from './env'

// Fold accents + case so a spoken/typed name matches the stored one: "Léa" ↔
// "lea", "ÉLODIE" ↔ "elodie". Captures come from a 70B model reading speech,
// which rarely lands the right diacritics, so we always compare folded.
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

// Resolve a free-text person hint from a capture ("Léa", "pour maman", "for Dad")
// to a household member, or null when nothing matches. Matching is forgiving on
// purpose — the router gets the name from the intent model, not a picker — but
// READ-ONLY: a stray name never creates a member. We strip a leading "pour/for/à"
// the model sometimes leaves in, fold accents/case, then try, in order: exact
// name, exact first name, name-starts-with, first-name-starts-with. First hit in
// the household's own sort order wins, so a tie favours the listed-first person.
export async function resolveMemberByName(
  env: Env,
  householdId: string,
  hint: string | null | undefined,
): Promise<{ id: string; displayName: string } | null> {
  const cleaned = (hint ?? '').replace(/^\s*(?:pour|for|à|a)\s+/i, '').trim()
  const needle = fold(cleaned)
  if (needle.length < 2) return null // a one-letter scrap is too ambiguous to assign
  const { results } = await env.DB.prepare(
    'SELECT id, display_name FROM members WHERE household_id = ? ORDER BY sort_order, created_at',
  )
    .bind(householdId)
    .all<{ id: string; display_name: string }>()
  const members = results.map((m) => {
    const folded = fold(m.display_name)
    return { id: m.id, displayName: m.display_name, folded, first: folded.split(/\s+/)[0] ?? '' }
  })
  const pick =
    members.find((m) => m.folded === needle) ??
    members.find((m) => m.first === needle) ??
    members.find((m) => m.folded.startsWith(needle)) ??
    members.find((m) => m.first.length >= 2 && needle.startsWith(m.first))
  return pick ? { id: pick.id, displayName: pick.displayName } : null
}
