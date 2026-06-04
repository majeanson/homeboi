import type { Env } from '../../_lib/env'
import { ok } from '../../_lib/json'
import { currentEmail } from '../../_lib/auth'

// Who am I? Drives the SPA's AuthProvider. Returns the operator email + their
// household tier, or signed-out.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const email = await currentEmail(ctx.env, ctx.request)
  if (!email) return ok({ signedIn: false })
  const row = await ctx.env.DB.prepare(
    `SELECT h.id AS id, h.name AS name, h.tier AS tier
       FROM operators o JOIN households h ON h.id = o.household_id
      WHERE o.email = ?`,
  )
    .bind(email)
    .first<{ id: string; name: string; tier: string }>()
  return ok({ signedIn: true, email, household: row ?? null })
}
