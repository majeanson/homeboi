import type { Env } from '../../_lib/env'
import { ok, serverError } from '../../_lib/json'
import { newId, newPairingCode, nowSec } from '../../_lib/ids'

// Step 1 of device pairing, called by the tablet with NO auth (it has none
// yet). Mints a pending pairing row + a 6-digit code, returns the code for the
// tablet to display. The operator then claims it from their phone.
//
// CSRF-exempt (in _middleware): there is no cookie to ride. Pairing rows are
// short-lived (10 min) and useless until an authenticated operator claims one,
// so an attacker generating codes achieves nothing.
const PAIRING_TTL = 60 * 10

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const ts = nowSec()
  const id = newId()
  const code = newPairingCode()
  try {
    await ctx.env.DB.prepare(
      `INSERT INTO pairing_codes (id, code, status, created_at, expires_at)
       VALUES (?, ?, 'pending', ?, ?)`,
    )
      .bind(id, code, ts, ts + PAIRING_TTL)
      .run()
    return ok({ pairingId: id, code, expiresInSec: PAIRING_TTL })
  } catch {
    return serverError('Pairing indisponible.')
  }
}
