import type { Env } from '../../_lib/env'
import { ok } from '../../_lib/json'
import { currentOperator } from '../../_lib/auth'

// Who am I? Drives the SPA's AuthProvider. Returns the operator email + their
// household tier, or signed-out.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  // Version-checked (0134): a cookie revoked by a reset or « Se déconnecter partout »
  // answers signed-out here too, so the shell and the API agree.
  const op = await currentOperator(ctx.env, ctx.request)
  if (!op) return ok({ signedIn: false })
  const email = op.email
  const row = await ctx.env.DB.prepare(
    `SELECT h.id AS id, h.name AS name, h.tier AS tier, o.member_id AS member_id
       FROM operators o JOIN households h ON h.id = o.household_id
      WHERE o.email = ?`,
  )
    .bind(email)
    .first<{ id: string; name: string; tier: string; member_id: string | null }>()
  // `memberId` — which household FACE this account is (migration 0130), so a personal
  // phone can start as the person holding it instead of asking on every new device.
  // Sent flat rather than inside `household`: it is a property of the ACCOUNT, and the
  // same household hands a different answer to each of its operators.
  return ok({
    signedIn: true,
    email,
    household: row ? { id: row.id, name: row.name, tier: row.tier } : null,
    memberId: row?.member_id ?? null,
  })
}
