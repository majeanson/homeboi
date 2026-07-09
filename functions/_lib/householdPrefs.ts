import type { Env } from './env'
import { nowSec } from './ids'

// Generic per-household preference store (migration 0106_household_preferences) —
// a (household_id, key) keyed JSON blob for settings that don't deserve their own
// `households` column (DB-6 rule: households was accumulating ~15 pref columns).
// Each preference is looked up/written by its own key so unrelated PATCHes never
// clobber each other on a shared row, unlike a single wide households column would.
//
// Callers own their own shape + validation (e.g. functions/_lib/schoolYear.ts) —
// this module only knows "a household has a JSON blob under a key", nothing about
// what's inside it.

export async function getPref<T>(env: Env, householdId: string, key: string): Promise<T | null> {
  const row = await env.DB.prepare('SELECT value FROM household_preferences WHERE household_id = ? AND key = ?')
    .bind(householdId, key)
    .first<{ value: string }>()
  if (!row?.value) return null
  try {
    return JSON.parse(row.value) as T
  } catch {
    return null
  }
}

export async function setPref(env: Env, householdId: string, key: string, value: unknown): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO household_preferences (household_id, key, value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (household_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  )
    .bind(householdId, key, JSON.stringify(value), nowSec())
    .run()
}

export async function clearPref(env: Env, householdId: string, key: string): Promise<void> {
  await env.DB.prepare('DELETE FROM household_preferences WHERE household_id = ? AND key = ?').bind(householdId, key).run()
}
