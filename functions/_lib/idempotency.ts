import type { Env } from './env'

// Server side of the offline write queue (NFR-OFFLINE-1). The client's outbox
// stamps every queued write with a unique Idempotency-Key and REPLAYS it on
// reconnect; this dedups the replay so a write never double-applies. authed()
// routes mutating requests that carry the key through here. Since B-9 (bmad/10)
// a normal ONLINE write from `writeWith` sends this same key too (hoisted before
// the online attempt) — so if the response is lost after the write actually
// applied, a later re-tap/replay under the same key answers from this ledger
// instead of re-running the write. See 0039_idempotency.sql.
const PRUNE_AFTER = 7 * 24 * 60 * 60 * 1000 // ms — keep the ledger short-lived

export async function withIdempotency(
  env: Env,
  householdId: string,
  key: string,
  run: () => Response | Promise<Response>,
): Promise<Response> {
  // Already processed for this household? Return the stored result verbatim.
  const prior = await env.DB.prepare(
    'SELECT status_code, result_json FROM idempotency_keys WHERE household_id = ? AND key = ?',
  )
    .bind(householdId, key)
    .first<{ status_code: number; result_json: string | null }>()
  if (prior) {
    return new Response(prior.result_json, {
      status: prior.status_code,
      headers: { 'content-type': 'application/json', 'X-Idempotent-Replay': '1' },
    })
  }

  const res = await run()
  // Only remember successes — a 4xx/5xx must stay retryable. Clone so the body we
  // read here doesn't consume the response we return to the caller.
  if (res.status >= 200 && res.status < 300) {
    const body = await res.clone().text()
    const now = Date.now()
    try {
      await env.DB.batch([
        env.DB.prepare(
          'INSERT OR IGNORE INTO idempotency_keys (household_id, key, status_code, result_json, created_at) VALUES (?, ?, ?, ?, ?)',
        ).bind(householdId, key, res.status, body, now),
        // Opportunistic prune so the ledger stays small (it's dedup, not history).
        env.DB.prepare('DELETE FROM idempotency_keys WHERE created_at < ?').bind(now - PRUNE_AFTER),
      ])
    } catch {
      // A storage hiccup must never fail the user's actual write — worst case a
      // later replay re-runs, which the outbox only queues for idempotent ops.
    }
  }
  return res
}
