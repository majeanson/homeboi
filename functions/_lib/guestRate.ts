import type { Env } from './env'

// Per-token flood cap for the writable guest kinds (intake/postbox submit + media),
// REVIEW-PASS §509. Revocation (0098) lets an operator kill a leaked link; this bounds
// how much a single token can do BEFORE it's noticed + revoked — otherwise one broadly
// -shared link could create unbounded quarantine rows + R2 blobs within its TTL. Well
// above any honest use: a relative fills one intake form (+ maybe a photo), a sender
// drops a handful of messages. Distinct from the per-HOUSEHOLD MAX_PENDING queue cap.
export const MAX_GUEST_USES = 40

// Atomically charge ONE use against this token's `guests` row. Returns false when the
// token is over its cap (the caller should 429). The UPDATE is the atomic gate — the
// `use_count < cap` predicate means two concurrent charges can't both slip past the
// limit. A token with NO row (a legacy pre-0098 link) is uncapped → true; it can't be
// counted and expires within its short TTL. Revoked tokens never reach here (authed()
// → resolveActor rejects them before the handler runs).
export async function chargeGuestUse(env: Env, guestId: string | undefined): Promise<boolean> {
  if (!guestId) return true // not a guest actor (defensive) — nothing to charge
  const res = await env.DB.prepare('UPDATE guests SET use_count = use_count + 1 WHERE id = ? AND use_count < ?')
    .bind(guestId, MAX_GUEST_USES)
    .run()
  if ((res.meta?.changes ?? 0) > 0) return true // charged, was under the cap
  // Zero rows changed: either there's no row (legacy → allow) or the row sat at its
  // cap (reject). One cheap lookup disambiguates — a present-but-uncharged row is over.
  const row = await env.DB.prepare('SELECT id FROM guests WHERE id = ?').bind(guestId).first<{ id: string }>()
  return !row
}
