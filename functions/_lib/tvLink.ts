// Resolve a /tv/<code> short link to its DISPLAY device. The living-room TV link
// (worker/index.ts intercepts /tv/<code> before the SPA) trades a short, hand-typeable
// code for a fresh read-only display token: this finds the device, the worker mints the
// token, and 302s to /cast. Only a LIVE (non-revoked) display matches — so revoking the
// TV from Réglages ▸ Tablettes kills its /tv link immediately, same as the long link.
import type { Env } from './env'

export async function resolveTvCode(
  env: Env,
  code: string,
): Promise<{ deviceId: string; householdId: string; scene: 'board' | 'ambient' } | null> {
  // Codes are 7 chars; cap the lookup input so a junk path can't probe with a huge string.
  if (!code || code.length > 32) return null
  const row = await env.DB.prepare(
    "SELECT id, household_id, cast_scene FROM devices WHERE short_code = ? AND kind = 'display' AND revoked_at IS NULL",
  )
    .bind(code)
    .first<{ id: string; household_id: string; cast_scene: string | null }>()
  if (!row) return null
  return {
    deviceId: row.id,
    householdId: row.household_id,
    scene: row.cast_scene === 'ambient' ? 'ambient' : 'board',
  }
}
