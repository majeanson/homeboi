// The client half of functions/_lib/staleDelete.ts: the body of a DELETE aimed at a row
// that may be an OPTIMISTIC one (list lines, todos — the two resources whose ids are
// minted here as `tmp-…` before the server knows them).
//
// `text` + `asOf` are what let the server delete the same ITEM when the id turns out to
// be one its database never had (a persisted optimistic row from a dead session, a frame
// that predates a « Vider » + re-add). Without them a delete by id alone removed nothing
// and answered « ok » — « I swipe and the items always come back » (2026-10-06).
//
// `asOf` is the GESTURE's time, not the commit's: the held write fires ~15 s later, and
// the server only heals onto a row that already existed at `asOf`, so a delete replaying
// late can never eat a same-named row someone re-added meanwhile.
export function healingDeleteBody(id: string, text: string): { id: string; text: string; asOf: number } {
  return { id, text, asOf: Math.floor(Date.now() / 1000) }
}
