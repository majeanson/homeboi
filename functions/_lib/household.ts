// Household resolution — the single place that answers "which household is this
// request acting on, and is it allowed to write?".
//
// Three credential paths converge here:
//   - operator session cookie  -> their household, full read/write
//   - device token (kiosk)      -> the bound household, board-scoped writes
//   - guest token (babysitter)  -> the bound household, READ-ONLY, time-boxed
//
// All return the same shape so handlers use one guard. `scope` lets a handler
// refuse a kiosk where only the operator should act (billing, member admin).
// Guests are strictly narrower than a kiosk: route.ts blocks every non-GET.

import type { Env } from './env'
import { currentEmail, currentDevice, currentGuest, type GuestKind } from './auth'
import { forbidden, unauthorized } from './json'
import { nowSec } from './ids'

export interface Actor {
  householdId: string
  scope: 'operator' | 'kiosk' | 'guest'
  email?: string
  deviceId?: string
  guestId?: string
  // Only set when scope === 'guest'. Selects the share-mode lens; the per-kind
  // read allowlist lives in worker/index.ts (see auth.ts GuestKind).
  guestKind?: GuestKind
  // Only meaningful for an 'intake' guest: the person key (`member:<id>` /
  // `contact:<id>`) the form link is pre-addressed to, signed into the token.
  // null ⇒ an open "add yourself" link.
  guestTargetKey?: string | null
  // Only meaningful for an 'intake' guest: bitmask of which optional form sections
  // to ask for (see _lib/intake.ts). null ⇒ ask everything.
  guestFields?: number | null
}

// Exported so the realtime WS upgrade (worker/index.ts → /api/live) can resolve
// the actor BEFORE hijacking the request, without routing through authed().
export async function resolveActor(env: Env, request: Request): Promise<Actor | null> {
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

  // Guest LAST — checked only after operator + device fail, so a real operator
  // or kiosk is never downgraded to read-only. Stateless: validity is the signed
  // expiry alone (no DB row), so there's no revoke-before-TTL. The household must
  // still exist — a token for a deleted household resolves to nothing.
  const guest = await currentGuest(env, request)
  if (guest) {
    const row = await env.DB.prepare('SELECT id FROM households WHERE id = ?')
      .bind(guest.householdId)
      .first<{ id: string }>()
    if (row)
      return {
        householdId: guest.householdId,
        scope: 'guest',
        guestId: guest.guestId,
        guestKind: guest.kind,
        guestTargetKey: guest.targetKey,
        guestFields: guest.fields,
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
