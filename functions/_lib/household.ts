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
import { currentOperator, currentDevice, currentGuest, type GuestKind } from './auth'
import { forbidden, unauthorized } from './json'
import { nowSec } from './ids'

export interface Actor {
  householdId: string
  scope: 'operator' | 'kiosk' | 'guest'
  // The household's wall-clock zone (migration 0135). `authed()` puts it into the
  // per-request async context (_lib/tz.ts) so every day helper picks it up; a handler
  // never has to pass it. Absent → America/Toronto, the pre-0135 behaviour.
  tz?: string
  email?: string
  deviceId?: string
  // Only set when scope === 'kiosk'. A normal wall tablet is 'kiosk'; older device
  // rows default to it (migration 0083). The other two are READ-ONLY — route.ts
  // blocks their non-GET methods, like a guest:
  //   'display' — a living-room TV showing /cast.
  //   'agent'   — an MCP client (functions/api/mcp.ts). Read-only is the whole
  //               promise of that server, and it has to hold on EVERY endpoint, not
  //               just the one: a leaked agent token must not be able to POST to
  //               /api/list either. The single exception is the MCP endpoint itself,
  //               whose POST performs no write — authed({ readOnlyPost: true }).
  deviceKind?: 'kiosk' | 'display' | 'agent'
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

// D-18 (bmad/10) — the guest-row acceptance rule, factored out pure so it's unit-
// testable without a DB. A legacy/short-TTL guest token has always been row-
// optional: no row (pre-0098, or a best-effort insert that failed at mint) still
// works until the token's own signed TTL. A STANDING token flips that: its signed
// expiry is a 10-year backstop (auth.ts STANDING_TTL), so the row is the ONLY real
// kill switch — a missing row must reject it (guest/start.ts's MANDATORY insert for
// a standing mint is what keeps this from ever firing on an honestly-minted link).
export function guestRowAcceptable(standing: boolean, row: { revoked_at: number | null } | null): boolean {
  if (standing) return row != null && row.revoked_at == null
  return row == null || row.revoked_at == null
}

// Exported so the realtime WS upgrade (worker/index.ts → /api/live) can resolve
// the actor BEFORE hijacking the request, without routing through authed().
export async function resolveActor(env: Env, request: Request): Promise<Actor | null> {
  // Operator first — a logged-in human outranks a device. currentOperator already
  // checked the cookie's session_version against the row (0134): a revoked session
  // resolves to nothing here and falls through to the device/guest paths, exactly
  // like an expired one.
  const op = await currentOperator(env, request)
  if (op) return { householdId: op.householdId, scope: 'operator', email: op.email, tz: await householdTz(env, op.householdId) }

  const device = await currentDevice(env, request)
  if (device) {
    // A revoked or unknown device must not act, even with a validly-signed
    // token — revocation is the whole point of device pairing over a static
    // capability URL.
    const row = await env.DB.prepare(
      'SELECT id, kind FROM devices WHERE id = ? AND household_id = ? AND revoked_at IS NULL',
    )
      .bind(device.deviceId, device.householdId)
      .first<{ id: string; kind: string }>()
    if (row) {
      // Best-effort heartbeat; never block the request on it.
      await env.DB.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?')
        .bind(nowSec(), device.deviceId)
        .run()
        .catch(() => {})
      // The row's kind is authoritative (revocable, server-owned) — the read-only
      // kinds vs a full kiosk. route.ts gates both read-only kinds to GET/HEAD.
      // Anything unrecognized reads as 'kiosk', which is the pre-0083 behaviour and
      // the only safe default for the rows that predate the column.
      return {
        householdId: device.householdId,
        scope: 'kiosk',
        deviceId: device.deviceId,
        deviceKind: row.kind === 'display' ? 'display' : row.kind === 'agent' ? 'agent' : 'kiosk',
        tz: await householdTz(env, device.householdId),
      }
    }
  }

  // Guest LAST — checked only after operator + device fail, so a real operator
  // or kiosk is never downgraded to read-only. The household must still exist — a
  // token for a deleted household resolves to nothing — AND the link must pass
  // guestRowAcceptable (§509 + D-18 standing): LEFT JOIN the guests row keyed by
  // this token id so we can tell "no row" from "row, not revoked" from "row,
  // revoked" in one query — `gid` is NULL only when there's no matching row.
  const guest = await currentGuest(env, request)
  if (guest) {
    const row = await env.DB.prepare(
      'SELECT h.id AS hid, h.tz AS tz, g.id AS gid, g.revoked_at AS revoked FROM households h LEFT JOIN guests g ON g.id = ? WHERE h.id = ?',
    )
      .bind(guest.guestId, guest.householdId)
      .first<{ hid: string; tz: string | null; gid: string | null; revoked: number | null }>()
    const guestRow = row && row.gid != null ? { revoked_at: row.revoked } : null
    if (row && guestRowAcceptable(guest.standing, guestRow))
      return {
        householdId: guest.householdId,
        scope: 'guest',
        tz: row.tz ?? undefined,
        guestId: guest.guestId,
        guestKind: guest.kind,
        guestTargetKey: guest.targetKey,
        guestFields: guest.fields,
      }
  }

  return null
}

// The household's zone (migration 0135), read on the actor path so `authed()` can put
// it in scope for the whole request. One tiny indexed read per request; a household that
// predates the column, or a row that vanished mid-request, answers undefined and the
// helpers fall back to America/Toronto.
async function householdTz(env: Env, householdId: string): Promise<string | undefined> {
  const row = await env.DB.prepare('SELECT tz FROM households WHERE id = ?')
    .bind(householdId)
    .first<{ tz: string | null }>()
  return row?.tz ?? undefined
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
