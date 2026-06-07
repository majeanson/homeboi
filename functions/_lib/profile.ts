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
