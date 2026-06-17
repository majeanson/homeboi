// Household resolution — the single place that answers "which household is this
// request acting on, and is it allowed to write?".
//
// Two credential paths converge here:
//   - operator session cookie  -> their household, full read/write
//   - device token (kiosk)      -> the bound household, board-scoped writes
//
// Both return the same shape so handlers use one guard. `scope` lets a handler
// refuse a kiosk where only the operator should act (billing, member admin).

import type { Env } from './env'
import { currentEmail, currentDevice } from './auth'
import { forbidden, unauthorized } from './json'
import { nowSec } from './ids'

export interface Actor {
  householdId: string
  scope: 'operator' | 'kiosk'
  email?: string
  deviceId?: string
}

async function resolveActor(env: Env, request: Request): Promise<Actor | null> {
  // Operator first — a logged-in human outranks a device.
  const email = await currentEmail(env, request)
  if (email) {
    const row = await env.DB.prepare('SELECT household_id FROM operators WHERE email = ?')
      .bind(email)
      .first<{ household_id: string }>()
    if (row) return { householdId: row.household_id, scope: 'operator', email }
  }

  const device = await currentDevice(env, request)
  if (device) {
    // A revoked or unknown device must not act, even with a validly-signed
    // token — revocation is the whole point of device pairing over a static
    // capability URL.
    const row = await env.DB.prepare(
      'SELECT id FROM devices WHERE id = ? AND household_id = ? AND revoked_at IS NULL',
    )
      .bind(device.deviceId, device.householdId)
      .first<{ id: string }>()
    if (row) {
      // Best-effort heartbeat; never block the request on it.
      await env.DB.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?')
        .bind(nowSec(), device.deviceId)
        .run()
        .catch(() => {})
      return { householdId: device.householdId, scope: 'kiosk', deviceId: device.deviceId }
    }
  }

  return null
}

// Guard-or-return-early. `requireScope: 'operator'` rejects kiosk actors.
export async function requireActor(
  env: Env,
  request: Request,
  requireScope?: 'operator',
): Promise<Actor | Response> {
  const actor = await resolveActor(env, request)
  if (!actor) return unauthorized()
  if (requireScope === 'operator' && actor.scope !== 'operator') {
    return forbidden('This action needs the operator account, not a kiosk.')
  }
  return actor
}

// Ensure the operator's household row exists, creating it + the operator link
// on first login. Prototype-simple: one household per operator email.
export async function ensureHouseholdForEmail(env: Env, email: string): Promise<string> {
  const existing = await env.DB.prepare('SELECT household_id FROM operators WHERE email = ?')
    .bind(email)
    .first<{ household_id: string }>()
  if (existing) return existing.household_id

  const { newId } = await import('./ids')
  const householdId = newId()
  const ts = nowSec()
  const name = email.split('@')[0]
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO households (id, name, tier, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(householdId, `Maisonnée de ${name}`, 'free', 'active', ts, ts),
    env.DB.prepare('INSERT INTO operators (email, household_id, created_at) VALUES (?, ?, ?)').bind(
      email,
      householdId,
      ts,
    ),
  ])
  return householdId
}
