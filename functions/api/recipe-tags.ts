import { badRequest, ok, readJson, parseJsonArray } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec } from '../_lib/ids'

// Recipe tag management — the household-wide layer over recipes.tags_json.
//
//   GET   → { presets, used: [{tag, count}], colors }   presets = the household's
//           saved pill list (migration 0021, [] = use the UI's built-in starters);
//           used = every tag currently on a recipe, with how many carry it;
//           colors = per-tag colour overrides {lowercase tag: "#rrggbb"} (migration 0037).
//   PATCH → any of (operator-only):
//           { presets: string[] }          replace the preset pill list
//           { rename: {from, to} }         rename a tag on EVERY recipe (and in presets/colours)
//           { remove: string }             strip a tag from EVERY recipe (and presets/colours)
//           { setColor: {tag, color} }     set (or clear, color=null) a tag's colour
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

// A #rrggbb hex, or null for "no colour" / anything malformed. Colours come from
// the client's PALETTE swatches, so we only need to gate the shape, not a list.
const cleanColor = (v: unknown): string | null => (isStr(v) && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null)

// The per-tag colour map {lowercase tag: "#rrggbb"} (migration 0037). Keys are
// lowercased and values shape-checked; junk entries are dropped on read.
async function readColors(env: { DB: D1Database }, householdId: string): Promise<Record<string, string>> {
  const row = await env.DB.prepare('SELECT recipe_tag_colors_json FROM households WHERE id = ?')
    .bind(householdId)
    .first<{ recipe_tag_colors_json: string | null }>()
  let raw: unknown
  try {
    raw = JSON.parse(row?.recipe_tag_colors_json ?? '{}')
  } catch {
    raw = {}
  }
  const out: Record<string, string> = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw))
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const c = cleanColor(v)
      if (isStr(k) && k.trim() && c) out[k.toLowerCase()] = c
    }
  return out
}

const writeColors = (env: { DB: D1Database }, householdId: string, colors: Record<string, string>, ts: number) =>
  env.DB.prepare('UPDATE households SET recipe_tag_colors_json = ?, updated_at = ? WHERE id = ?').bind(
    JSON.stringify(colors),
    ts,
    householdId,
  )

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
  const colors = await readColors(ctx.env, actor.householdId)
  return ok({ presets, used, colors })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    presets?: unknown
    rename?: { from?: unknown; to?: unknown }
    remove?: unknown
    setColor?: { tag?: unknown; color?: unknown }
  }>(ctx.request)
  if (!body) return badRequest('Corps requis.')

  if (Array.isArray(body.presets)) {
    await ctx.env.DB.prepare('UPDATE households SET recipe_tags_json = ?, updated_at = ? WHERE id = ?')
      .bind(JSON.stringify(cleanTagList(body.presets)), nowSec(), actor.householdId)
      .run()
    return ok({ presets: await readPresets(ctx.env, actor.householdId) })
  }

  // Set or clear (color=null) one tag's colour. Keyed by lowercase name so it
  // tracks the tag regardless of which casing a recipe stored.
  if (body.setColor) {
    const tag = cleanTag(body.setColor.tag)
    if (!tag) return badRequest('tag requis.')
    const color = cleanColor(body.setColor.color)
    const colors = await readColors(ctx.env, actor.householdId)
    const key = tag.toLowerCase()
    if (color) colors[key] = color
    else delete colors[key]
    await writeColors(ctx.env, actor.householdId, colors, nowSec()).run()
    return ok({ colors })
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

  // Move (rename) or drop (remove) the tag's colour so it follows the tag.
  const colors = await readColors(ctx.env, actor.householdId)
  if (fromKey in colors) {
    const hex = colors[fromKey]
    delete colors[fromKey]
    if (renameTo) colors[renameTo.toLowerCase()] = hex
    updates.push(writeColors(ctx.env, actor.householdId, colors, ts))
  }

  if (updates.length) await ctx.env.DB.batch(updates)
  return ok({ changed: updates.length })
})
