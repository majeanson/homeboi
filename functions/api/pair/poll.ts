import type { Env } from '../../_lib/env'
import { badRequest, ok } from '../../_lib/json'
import { nowSec } from '../../_lib/ids'

// Step 3: the tablet polls with its pairingId. While pending -> { status:
// 'pending' }. Once the operator has claimed it -> { status: 'approved',
// deviceToken, householdId } EXACTLY ONCE; we clear token_once so a replay of
// the poll can't re-leak the token. Expired -> { status: 'expired' }.
//
// CSRF-exempt: tablet has no cookie. The pairingId is an opaque 12-char id;
// guessing one inside the 10-min window is not feasible.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url)
  const pairingId = url.searchParams.get('pairingId')
  if (!pairingId) return badRequest('pairingId requis.')

  const row = await ctx.env.DB.prepare(
    'SELECT status, household_id, token_once, expires_at FROM pairing_codes WHERE id = ?',
  )
    .bind(pairingId)
    .first<{ status: string; household_id: string | null; token_once: string | null; expires_at: number }>()

  if (!row) return ok({ status: 'expired' })
  if (row.status === 'pending' && row.expires_at < nowSec()) return ok({ status: 'expired' })
  if (row.status !== 'approved') return ok({ status: row.status })

  // Approved: hand the token over once, then burn it.
  if (row.token_once) {
    await ctx.env.DB.prepare('UPDATE pairing_codes SET token_once = NULL WHERE id = ?')
      .bind(pairingId)
      .run()
    return ok({ status: 'approved', deviceToken: row.token_once, householdId: row.household_id })
  }
  // Already collected once — tell the tablet it's done so it stops polling.
  return ok({ status: 'approved' })
}
