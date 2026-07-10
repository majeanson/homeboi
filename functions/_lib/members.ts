import type { Env } from './env'
import { deleteR2Blob } from './r2'

// ─────────────────────────────────────────────────────────────────────────────
// Deleting a member: FK cleanup (ONE authoritative list)
//
// Many tables FK-reference members(id). D1 enforces those REFERENCES, so a member
// DELETE is rejected — and the whole atomic batch fails — while ANY row still
// points at it. When this went unmaintained, five tables were handled but ELEVEN
// newer ones (recipe_loves, schedule_blocks, mots, notes, day_notes, todos,
// contacts, family_notes, trip_notes, trip_packing, ai_errors) were not, so
// deleting a member that a `mot`/heart/etc. referenced silently 500'd — e.g. the
// sample "Léa" carries a seeded mot, so she could never be removed.
//
// This is now the single source of truth for "detach a member from everything,"
// reused by BOTH `DELETE /api/members` and the sample-data sweep. Keep it in
// lockstep with `grep "REFERENCES members" functions/db/migrations/` — a table
// missed here re-breaks member deletion.
//
// Resolution per reference:
//   • NOT NULL refs (routines, recipe_loves, schedule_blocks) — the rows belong to
//     the member alone; DELETE them (routine_runs first, they FK routines).
//   • A « mot » to/from the member is a private 1:1 message; DELETE it rather than
//     SET NULL (a NULL recipient would re-broadcast it to the whole Maisonnée).
//   • A member-owned « habitude » is private too; DELETE it with its habit_days
//     history (a NULL owner would promote it to a household habit). Household
//     habits survive — only the departed member's day-mark attribution is detached.
//   • Nullable refs (events, meals, notes, contacts, …) — DETACH with SET NULL so
//     the host row survives, now unassigned.
//   • Polymorphic edges (contact_links / contact_group_members, no DB FK) — DELETE
//     so a removed face leaves no dangling relationship.
// Callers append the final `DELETE FROM members …` and run everything in one batch.
export function memberRefStatements(env: Env, householdId: string, memberId: string): D1PreparedStatement[] {
  const hh = householdId
  const id = memberId
  const P = env.DB.prepare.bind(env.DB)
  return [
    // NOT NULL refs → the rows are the member's own; delete them.
    P('DELETE FROM routine_runs WHERE routine_id IN (SELECT id FROM routines WHERE member_id = ? AND household_id = ?)').bind(id, hh),
    P('DELETE FROM routines WHERE member_id = ? AND household_id = ?').bind(id, hh),
    P('DELETE FROM recipe_loves WHERE member_id = ? AND household_id = ?').bind(id, hh),
    P('DELETE FROM schedule_blocks WHERE member_id = ? AND household_id = ?').bind(id, hh),
    // A private « mot » loses meaning without its member; delete both directions.
    P('DELETE FROM mots WHERE household_id = ? AND (member_id = ? OR author_member_id = ?)').bind(hh, id, id),
    // A member's own « habitude » is private to them — delete it with its history
    // (day rows first: they FK habits). Household-wide habits (member_id NULL)
    // survive; only this member's authorship of their day marks is detached below.
    P('DELETE FROM habit_days WHERE habit_id IN (SELECT id FROM habits WHERE member_id = ? AND household_id = ?)').bind(id, hh),
    P('DELETE FROM habits WHERE member_id = ? AND household_id = ?').bind(id, hh),
    // Nullable refs → detach so the host row survives.
    P('UPDATE events SET member_id = NULL WHERE member_id = ? AND household_id = ?').bind(id, hh),
    P('UPDATE tasks SET last_done_by = NULL WHERE last_done_by = ? AND household_id = ?').bind(id, hh),
    P('UPDATE meals SET cook_member_id = NULL WHERE cook_member_id = ? AND household_id = ?').bind(id, hh),
    P('UPDATE task_participants SET member_id = NULL WHERE member_id = ? AND task_id IN (SELECT id FROM tasks WHERE household_id = ?)').bind(id, hh),
    P('UPDATE notes SET member_id = NULL WHERE member_id = ? AND household_id = ?').bind(id, hh),
    P('UPDATE day_notes SET member_id = NULL WHERE member_id = ? AND household_id = ?').bind(id, hh),
    P('UPDATE todos SET member_id = NULL WHERE member_id = ? AND household_id = ?').bind(id, hh),
    P('UPDATE contacts SET member_id = NULL WHERE member_id = ? AND household_id = ?').bind(id, hh),
    P('UPDATE family_notes SET member_id = NULL WHERE member_id = ? AND household_id = ?').bind(id, hh),
    P('UPDATE family_notes SET author_member_id = NULL WHERE author_member_id = ? AND household_id = ?').bind(id, hh),
    P('UPDATE trip_notes SET member_id = NULL WHERE member_id = ? AND household_id = ?').bind(id, hh),
    P('UPDATE trip_packing SET member_id = NULL WHERE member_id = ? AND household_id = ?').bind(id, hh),
    P('UPDATE ai_errors SET profile = NULL WHERE profile = ? AND household_id = ?').bind(id, hh),
    // Who last marked a surviving household habit — attribution, not ownership.
    P('UPDATE habit_days SET member_id = NULL WHERE member_id = ? AND habit_id IN (SELECT id FROM habits WHERE household_id = ?)').bind(id, hh),
    // « Le défi du jour » per-face marks ARE the departed member's identity (a mark
    // is a face, never anonymous), so DELETE them — a NULL face would be a mark by
    // nobody. The household défi habit itself survives (member_id NULL).
    P('DELETE FROM habit_marks WHERE member_id = ? AND habit_id IN (SELECT id FROM habits WHERE household_id = ?)').bind(id, hh),
    // « Le cercle » edges + named-group memberships (polymorphic, no FK).
    P("DELETE FROM contact_links WHERE household_id = ? AND ((person_a_id = ? AND person_a_kind = 'member') OR (person_b_id = ? AND person_b_kind = 'member'))").bind(hh, id, id),
    P("DELETE FROM contact_group_members WHERE person_kind = 'member' AND person_id = ?").bind(id),
  ]
}

// Free R2 blobs that `memberRefStatements` will hard-DELETE (only mots carry media;
// every other reference is SET NULL and keeps its row + blob). Best-effort and
// no-ops when R2 is unset — mirrors `deleteR2Blob`. Call BEFORE the ref batch.
export async function freeMemberMediaBlobs(env: Env, householdId: string, memberId: string): Promise<void> {
  if (!env.PHOTOS) return
  const { results } = await env.DB.prepare(
    'SELECT media_key FROM mots WHERE household_id = ? AND media_key IS NOT NULL AND (member_id = ? OR author_member_id = ?)',
  )
    .bind(householdId, memberId, memberId)
    .all<{ media_key: string }>()
  for (const r of results) await deleteR2Blob(env.PHOTOS, r.media_key)
}

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
    'SELECT id, display_name FROM members WHERE household_id = ? ORDER BY position, created_at',
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
