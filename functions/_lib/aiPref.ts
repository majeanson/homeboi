import type { Env } from './env'
import type { Actor } from './household'

// The household's "AI on/off" switch (migration 0061), the server-side half of the
// Réglages ▸ IA toggle. The whole point is that disabling AI is enforced here, not
// just hidden in the UI: every AI endpoint funnels through `aiUsable` so a request
// can't reach Workers AI when the household has turned it off.
//
// This is SEPARATE from the env.AI binding being unset (a deployment fact — see
// _lib/env.ts). Both must be true for AI to run; `aiUsable` folds them together so
// callers have one question to ask ("may this request use AI?") and /api/health can
// report a single effective `ai` flag the SPA reads to hide every AI affordance.

// Has the household left AI on? NULL (never toggled) or 1 = on (the default), 0 =
// the operator switched it off. Reads the one column; defaults to ON so a row
// without the value (or a failed read) keeps working rather than silently losing AI.
export async function householdAiEnabled(env: Env, householdId: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT ai_enabled FROM households WHERE id = ?')
    .bind(householdId)
    .first<{ ai_enabled: number | null }>()
  return row?.ai_enabled !== 0
}

// "May THIS request actually run an AI inference?" — the binding must exist AND the
// household must not have disabled AI. The single check every AI endpoint shares
// (directly, or via authed({ requiresAi: true })) so the operator's off switch is
// real, not cosmetic.
export async function aiUsable(env: Env, actor: Actor): Promise<boolean> {
  return !!env.AI && (await householdAiEnabled(env, actor.householdId))
}
