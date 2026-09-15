// A CEILING FOR THE READS THAT GROW FOR EVER.
//
// Most of this app's list reads are bounded by the household itself — you have six
// members, four groups, a week of meals — and a `LIMIT` on those would be noise. A
// handful are different: they accumulate with TIME and nothing ever removes a row.
// Family notes, fridge mots, drawings, recorded transfers, a carnet's service history.
// A household three years in has three years of them, and several of those reads ride
// `...live`, so the whole pile is re-fetched every ~10 s while a tab is open, persisted
// to IndexedDB before first paint, and replayed offline.
//
// The cap is deliberately GENEROUS — it is a backstop against a payload nobody
// budgeted for, not a paging scheme. At 400 a household writing two family notes a week
// is covered for four years. Nothing today is anywhere near it, which is the point: this
// removes the unbounded property before it becomes a support ticket, and costs nothing
// in the meantime.
//
// TWO RULES, both of which matter more than the number:
//
//  1. THE ORDER MUST PUT THE ROWS WORTH KEEPING FIRST. Every capped query here is
//     already `ORDER BY <recency> DESC`, so the rows beyond the cap are the OLDEST — the
//     ones a household is least likely to be looking at. Capping a query ordered any
//     other way would drop something arbitrary, which is worse than a big payload.
//  2. A TRUNCATED READ SAYS SO. `capped()` returns the flag alongside the rows so the
//     response can carry `more: true`. Silently returning 400 of 600 notes is the app
//     lying about the household's own content — the same class of mistake as an empty
//     list where a fetch failed. Nothing renders that flag yet; when a household ever
//     trips it, the surface has the fact to work with instead of a mystery.
export const LIST_CAP = 400

/**
 * Split a capped read's results into the rows to send and whether more exist.
 *
 * Query with `LIMIT LIST_CAP + 1` — one row past the ceiling — so a full page is
 * distinguishable from a page that happens to be exactly `LIST_CAP` long. The extra row
 * is dropped, never sent.
 */
export function capped<T>(rows: T[] | undefined | null): { rows: T[]; more: boolean } {
  const all = rows ?? []
  return all.length > LIST_CAP ? { rows: all.slice(0, LIST_CAP), more: true } : { rows: all, more: false }
}

/** `LIMIT` clause for a capped read — one past the ceiling, so `capped()` can tell. */
export const CAP_SQL = `LIMIT ${LIST_CAP + 1}`
