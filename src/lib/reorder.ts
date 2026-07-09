// The ONE drag-reorder → position-PATCH derivation (moved out of components/voyage
// so the cercle/board notes list can share it). Move index `from` → `to` (indices in
// the DISPLAYED order) and return the { id, position } PATCHes that pin the new
// order — every row gets its index as position, but rows already stored at that
// position are skipped (fewer writes; a fresh list is all position 0, so the first
// drag renumbers the lot). Pure so the drag handler stays a two-liner (unit-tested
// via voyage.test.ts).
export function reorderPatches(
  rows: { id: string; position: number }[],
  from: number,
  to: number,
): { id: string; position: number }[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return []
  const next = [...rows]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next.flatMap((n, i) => (n.position === i ? [] : [{ id: n.id, position: i }]))
}
