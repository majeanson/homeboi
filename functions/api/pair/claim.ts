import type { Env } from '../../_lib/env'
import { badRequest, conflict, notFound, ok, readJson, serverError } from '../../_lib/json'
import { requireActor } from '../../_lib/household'
import { issueDeviceToken } from '../../_lib/auth'
import { newId, nowSec, sha256Hex } from '../../_lib/ids'

// Step 2: the logged-in operator approves a tablet by typing the 6-digit code
// it shows. Binds the pairing to their household, mints a device + token, and
// stashes the token in token_once for the tablet's next poll to collect.
//
// Operator-scope only (a kiosk can't pair new kiosks). Goes through the normal
// cookie + CSRF gate.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const actor = await requireActor(ctx.env, ctx.request, 'operator')
  if (actor instanceof Response) return actor

  const body = await readJson<{ code?: string; label?: string }>(ctx.request)
  const code = body?.code?.trim()
  if (!code || !/^\d{6}$/.test(code)) return badRequest('Code à 6 chiffres requis.')
  const label = (body?.label?.trim() || 'Tablette').slice(0, 40)

  const pairing = await ctx.env.DB.prepare(
    "SELECT id, status, expires_at FROM pairing_codes WHERE code = ? AND status = 'pending'",
  )
    .bind(code)
    .first<{ id: string; status: string; expires_at: number }>()
  if (!pairing) return notFound('Code introuvable ou déjà utilisé.')
  if (pairing.expires_at < nowSec()) return conflict('Code expiré, redemande un code sur la tablette.')

  const ts = nowSec()
  const deviceId = newId()
  const token = await issueDeviceToken(ctx.env, deviceId, actor.householdId)
  const tokenHash = await sha256Hex(token)

  try {
    await ctx.env.DB.batch([
      ctx.env.DB.prepare(
        'INSERT INTO devices (id, household_id, label, token_hash, created_at) VALUES (?, ?, ?, ?, ?)',
      ).bind(deviceId, actor.householdId, label, tokenHash, ts),
      ctx.env.DB.prepare(
        `UPDATE pairing_codes
            SET status = 'approved', household_id = ?, device_id = ?, token_once = ?
          WHERE id = ?`,
      ).bind(actor.householdId, deviceId, token, pairing.id),
    ])
    return ok({ ok: true, deviceId, label })
  } catch {
    return serverError('Jumelage impossible.')
  }
}
