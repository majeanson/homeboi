// Calm "Bientôt" reminder (migration 0038). One pure predicate the board uses to
// decide whether a dated occurrence should carry the quiet clock chip RIGHT NOW.
//
// Emphasis only — this never hides or surfaces anything beyond where it already is,
// and it is NOT a push (NFR-CALM-1). `now` is inside the lead window when it has
// reached `at - lead` but not yet `at`. A null/absent lead is never soon; once the
// occurrence is here or past (now ≥ at) it stops being "soon" (it's now/done).
export function isSoon(now: number, at: number, lead: number | null | undefined): boolean {
  return lead != null && now >= at - lead && now < at
}
