import { badRequest, ok, readJson, parseJsonArray } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec } from '../_lib/ids'

// Recipe tag management — the household-wide layer over recipes.tags_json.
//
//   GET   → { presets, used: [{tag, count}] }   presets = the household's saved
//           pill list (migration 0021, [] = use the UI's built-in starters);
//           used = every tag currently on a recipe, with how many carry it.
//   PATCH → any of (operator-only):
//           { presets: string[] }          replace the preset pill list
//           { rename: {from, to} }         rename a tag on EVERY recipe (and in presets)
//           { remove: string }             strip a tag from EVERY recipe (and presets)
//
// Rename/remove rewrite each affected recipe's tags_json in one pass — the
// recipe book is small (a household's worth), so a read-modify-write loop in a
// batch is plenty.

const isStr = (v: unknown): v is string => typeof v === 'string'

const cleanTag = (v: unknown): string | null => {
  if (!isStr(v)) return null
  const s = v.trim().slice(0, 24)
  return s || null
}

function cleanTagList(v: unknown, max = 20): string[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of v) {
    const s = cleanTag(x)
    if (!s) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= max) break
  }
  return out
}

async function readPresets(env: { DB: D1Database }, householdId: string): Promise<string[]> {
  const row = await env.DB.prepare('SELECT recipe_tags_json FROM households WHERE id = ?')
    .bind(householdId)
    .first<{ recipe_tags_json: string | null }>()
  return cleanTagList(parseJsonArray<string>(row?.recipe_tags_json ?? '[]', isStr))
}

export const onRequestGet = authed(async (ctx, actor) => {
  const presets = await readPresets(ctx.env, actor.householdId)
  const { results } = await ctx.env.DB.prepare('SELECT tags_json FROM recipes WHERE household_id = ?')
    .bind(actor.householdId)
    .all<{ tags_json: string }>()
  // Count case-insensitively but keep the first-seen casing for display.
  const counts = new Map<string, { tag: string; count: number }>()
  for (const r of results ?? []) {
    for (const tag of parseJsonArray<string>(r.tags_json, isStr)) {
      const key = tag.toLowerCase()
      const cur = counts.get(key)
      if (cur) cur.count++
      else counts.set(key, { tag, count: 1 })
    }
  }
  const used = [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
  return ok({ presets, used })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    presets?: unknown
    rename?: { from?: unknown; to?: unknown }
    remove?: unknown
  }>(ctx.request)
  if (!body) return badRequest('Corps requis.')

  if (Array.isArray(body.presets)) {
    await ctx.env.DB.prepare('UPDATE households SET recipe_tags_json = ?, updated_at = ? WHERE id = ?')
      .bind(JSON.stringify(cleanTagList(body.presets)), nowSec(), actor.householdId)
      .run()
    return ok({ presets: await readPresets(ctx.env, actor.householdId) })
  }

  const renameFrom = cleanTag(body.rename?.from)
  const renameTo = cleanTag(body.rename?.to)
  const removeTag = cleanTag(body.remove)
  if (!(renameFrom && renameTo) && !removeTag) return badRequest('presets, rename ou remove requis.')

  // Rewrite the tag on every recipe that carries it (case-insensitive match).
  const fromKey = (renameFrom ?? removeTag!).toLowerCase()
  const { results } = await ctx.env.DB.prepare('SELECT id, tags_json FROM recipes WHERE household_id = ?')
    .bind(actor.householdId)
    .all<{ id: string; tags_json: string }>()
  const ts = nowSec()
  const updates: D1PreparedStatement[] = []
  for (const r of results ?? []) {
    const tags = parseJsonArray<string>(r.tags_json, isStr)
    if (!tags.some((tg) => tg.toLowerCase() === fromKey)) continue
    const next = renameTo
      ? cleanTagList(tags.map((tg) => (tg.toLowerCase() === fromKey ? renameTo : tg)))
      : tags.filter((tg) => tg.toLowerCase() !== fromKey)
    updates.push(
      ctx.env.DB.prepare('UPDATE recipes SET tags_json = ?, updated_at = ? WHERE id = ? AND household_id = ?').bind(
        JSON.stringify(next),
        ts,
        r.id,
        actor.householdId,
      ),
    )
  }

  // Mirror the change into the preset list so a renamed pill follows along.
  const presets = await readPresets(ctx.env, actor.householdId)
  const nextPresets = renameTo
    ? cleanTagList(presets.map((tg) => (tg.toLowerCase() === fromKey ? renameTo : tg)))
    : presets.filter((tg) => tg.toLowerCase() !== fromKey)
  if (JSON.stringify(nextPresets) !== JSON.stringify(presets)) {
    updates.push(
      ctx.env.DB.prepare('UPDATE households SET recipe_tags_json = ?, updated_at = ? WHERE id = ?').bind(
        JSON.stringify(nextPresets),
        ts,
        actor.householdId,
      ),
    )
  }

  if (updates.length) await ctx.env.DB.batch(updates)
  return ok({ changed: updates.length })
}, 'operator')
