// Pick-your-face attribution: which member the acting device says it is, from the
// `X-Profile` header (set by lib/api on the client). This is attribution ONLY,
// never an access decision — the household auth in resolveActor already gated the
// request; here we just record who, among the family, added a thing. A client
// could spoof another member's id; that's acceptable for family attribution.
// Returns null when absent (a kiosk, or "tout le monde").
export function profileMemberId(request: Request): string | null {
  const v = request.headers.get('X-Profile')
  if (!v) return null
  const trimmed = v.trim().slice(0, 64)
  return trimmed || null
}

// THE FACE ON A WRITE MUST STILL BE A FACE HERE (2026-11-06). The header goes straight into a
// foreign key, so a device wearing a deleted member got a 500 and lost what was typed: a
// phone that opened Notes before the board cleared its stale face, or an outbox replay days
// later. Attribution is never worth a person's words, so the write keeps going with no
// author. Called once from authed(), for writes only, so a handler never has to think
// about it. A member of another household is treated the same way.
export async function dropGoneFace(db: D1Database, request: Request, householdId: string): Promise<Request> {
  const face = profileMemberId(request)
  if (!face) return request
  const row = await db.prepare('SELECT 1 FROM members WHERE id = ? AND household_id = ?').bind(face, householdId).first()
  if (row) return request
  const headers = new Headers(request.headers)
  headers.delete('X-Profile')
  return new Request(request, { headers })
}
