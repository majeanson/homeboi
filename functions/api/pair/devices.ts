import { badRequest, ok, readJson, serverError } from '../../_lib/json'
import { authed } from '../../_lib/route'
import { issueDeviceToken } from '../../_lib/auth'
import { newId, newShortCode, nowSec, sha256Hex } from '../../_lib/ids'

// List paired tablets (operator) and revoke one. Revocation is the whole
// reason device-pairing beats a static capability URL: a lost tablet is killed
// here without touching anyone else's access. The list also surfaces read-only
// "display" devices (a living-room TV) so they're revoked from the same place.
export const onRequestGet = authed(async (ctx, actor) => {
  // `kind` rides along so the list can say WHAT a row is: a wall tablet, a read-only
  // TV, or an MCP agent. They are revoked from the same button either way, but a row
  // you cannot identify is a row you will not dare revoke.
  const { results } = await ctx.env.DB.prepare(
    `SELECT id, label, kind, created_at, last_seen_at, revoked_at
       FROM devices WHERE household_id = ? ORDER BY created_at DESC`,
  )
    .bind(actor.householdId)
    .all()
  return ok({ devices: results })
}, 'operator')

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    revokeId?: string
    mintDisplay?: boolean
    mintAgent?: boolean
    label?: string
    scene?: string
  }>(ctx.request)

  // Mint a READ-ONLY 'agent' device — the credential for the MCP server
  // (functions/api/mcp.ts), so Claude (or anything that speaks MCP) can read this
  // household and nothing else. Same shape as mintDisplay and for the same reason:
  // there is no 6-digit dance an agent could perform, and the operator is already
  // authed here. No new auth mode, no new table — it lands in the paired-devices
  // list and is revoked with the same trash button, which is the whole point.
  //
  // The token is returned ONCE and never stored in plaintext (only its SHA-256).
  // Lose it and you mint another; that is the correct trade for a credential that
  // lives in a config file on somebody's laptop.
  if (body?.mintAgent) {
    const ts = nowSec()
    const deviceId = newId()
    const token = await issueDeviceToken(ctx.env, deviceId, actor.householdId)
    const tokenHash = await sha256Hex(token)
    const label = (body.label?.trim() || 'Agent MCP').slice(0, 60)
    await ctx.env.DB.prepare(
      "INSERT INTO devices (id, household_id, label, token_hash, created_at, kind) VALUES (?, ?, ?, ?, ?, 'agent')",
    )
      .bind(deviceId, actor.householdId, label, tokenHash, ts)
      .run()
    return ok({ token, householdId: actor.householdId, deviceId, label })
  }

  // Mint a PERMANENT, read-only "display" device for a living-room TV — directly, with
  // no 6-digit pairing dance (a TV remote can't type; our users open a link/QR on the
  // TV). The operator is already authed, so we create the devices row (kind='display')
  // and return the token ONCE so the caller can build the /cast?display=<token> link.
  // It's read-only (route.ts gate) and revoked from the list above like any device.
  // We also stamp a short, hand-typeable `short_code` so the TV can open the board via
  // /tv/<code> (worker resolves the code → re-mints a token → 302 to /cast), and remember
  // the chosen `cast_scene` so /tv lands on the board vs the ambient screensaver.
  if (body?.mintDisplay) {
    const ts = nowSec()
    const deviceId = newId()
    const token = await issueDeviceToken(ctx.env, deviceId, actor.householdId)
    const tokenHash = await sha256Hex(token)
    const label = (body.label?.trim() || 'Téléviseur du salon').slice(0, 60)
    const scene = body.scene === 'ambient' ? 'ambient' : 'board'
    // Retry on the (rare) short_code unique-index collision — 4 chars is a small space.
    for (let attempt = 0; attempt < 6; attempt++) {
      const shortCode = newShortCode()
      try {
        await ctx.env.DB.prepare(
          "INSERT INTO devices (id, household_id, label, token_hash, created_at, kind, short_code, cast_scene) VALUES (?, ?, ?, ?, ?, 'display', ?, ?)",
        )
          .bind(deviceId, actor.householdId, label, tokenHash, ts, shortCode, scene)
          .run()
        return ok({ token, householdId: actor.householdId, deviceId, label, shortCode, scene })
      } catch {
        // Most likely a short_code collision — loop and try a fresh code. The row is
        // atomic (nothing inserted on failure), so re-inserting the same deviceId is safe.
      }
    }
    return serverError('Création de l’écran impossible.')
  }

  if (!body?.revokeId) return badRequest('revokeId requis.')
  await ctx.env.DB.prepare(
    'UPDATE devices SET revoked_at = ? WHERE id = ? AND household_id = ? AND revoked_at IS NULL',
  )
    .bind(nowSec(), body.revokeId, actor.householdId)
    .run()
  return ok({ ok: true })
}, 'operator')

// Rename a paired tablet (operator) — the only editable field a device has, so
// "Tablette du salon" stops being whatever label was typed at pairing time.
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; label?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  const label = body.label?.trim()
  if (!label) return badRequest('label requis.')
  await ctx.env.DB.prepare('UPDATE devices SET label = ? WHERE id = ? AND household_id = ?')
    .bind(label.slice(0, 60), body.id, actor.householdId)
    .run()
  return ok({ ok: true })
}, 'operator')
