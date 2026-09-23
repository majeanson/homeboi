import type { Env } from '../../_lib/env'
import { ok } from '../../_lib/json'
import { currentOperator } from '../../_lib/auth'
import { mailEnabled } from '../../_lib/mail'

// Who am I? Drives the SPA's AuthProvider. Returns the operator email + their
// household tier, or signed-out.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  // Version-checked (0134): a cookie revoked by a reset or « Se déconnecter partout »
  // answers signed-out here too, so the shell and the API agree.
  const op = await currentOperator(ctx.env, ctx.request)
  if (!op) return ok({ signedIn: false })
  const email = op.email
  const row = await ctx.env.DB.prepare(
    `SELECT h.id AS id, h.name AS name, h.tier AS tier, o.member_id AS member_id, o.verified_at AS verified_at
       FROM operators o JOIN households h ON h.id = o.household_id
      WHERE o.email = ?`,
  )
    .bind(email)
    .first<{ id: string; name: string; tier: string; member_id: string | null; verified_at: number | null }>()
  // `memberId` — which household FACE this account is (migration 0130), so a personal
  // phone can start as the person holding it instead of asking on every new device.
  // Sent flat rather than inside `household`: it is a property of the ACCOUNT, and the
  // same household hands a different answer to each of its operators.
  return ok({
    signedIn: true,
    email,
    household: row ? { id: row.id, name: row.name, tier: row.tier } : null,
    memberId: row?.member_id ?? null,
    // « Confirme ton courriel » (0138). Sent as a decided BOOLEAN rather than the stamp:
    // the client's question is « may I invite someone », and when this deployment cannot
    // send mail at all the answer is yes — the same fail-open the gate itself takes
    // (_lib/verify), decided once here instead of in two places that could disagree.
    verified: !mailEnabled(ctx.env) || !!row?.verified_at,
  })
}
