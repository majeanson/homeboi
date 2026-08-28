// THE birthday rule — the one place that decides what a stored `birthday` string
// means, for BOTH the write validators (used by members/cercle/pets) and the
// server-side derivation in `birthdays.ts`.
//
// It has a twin: `parseBirthday` in `src/lib/cercle.ts`. The Worker bundle and the
// SPA bundle don't share code, so the client keeps its own copy for the cercle page,
// the detail peek and the countdown card. The two MUST agree, and on 2026-08-28 they
// did not: the server copy matched `\d{4}` where the client (and both write
// validators) matched `\d{1,4}`, so a stored 1–3-digit year rendered fine on the
// cercle page and was silently dropped from the board's agenda, which derives its
// birthdays server-side. Pinned by the agreement table in `src/lib/cercle.test.ts`
// — sibling of ingredient-mirror.test.ts and of that file's INVERSES check.
//
// This lives apart from `birthdays.ts` ON PURPOSE: that module's `fetchBirthdayPeople`
// names `D1Database`, and the agreement test has to import this from the SPA tree,
// whose tsconfig carries no Workers types. Keep this file free of them.
//
// Permissive on READ (`\d{1,4}`) so any short year already in the table is seen by
// both trees; canonical on WRITE (`birthdayOrNull` pads to 4) so new rows can't add
// to the problem. Year 0 / '0000' means "year unknown" → no age.
export function parseBirthday(s: string | null | undefined): { year: number; month: number; day: number; yearKnown: boolean } | null {
  if (!s) return null
  const m = /^(\d{1,4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day, yearKnown: year > 0 }
}

// THE write validator for a `birthday` column — shared by functions/api/members.ts,
// cercle.ts and pets.ts, which each carried their own copy (pets carried none at all
// and stored whatever string arrived). Validating through `parseBirthday` is the
// point: a value the readers can't parse can no longer be stored in the first place,
// so "accepted" and "readable" cannot drift apart. Normalizes the year to four
// digits, which is what `makeBirthday` (the only UI that produces one) already emits.
export function birthdayOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const p = parseBirthday(v)
  if (!p) return null
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}
