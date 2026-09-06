import { badRequest, ok, readJson, parseJsonArray } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec } from '../_lib/ids'
import { getPref, setPref } from '../_lib/householdPrefs'

// Recipe tag management — the household-wide layer over recipes.tags_json.
//
//   GET   → { presets, used: [{tag, count}], colors }   presets = the household's
//           saved pill list (migration 0021, [] = use the UI's built-in starters);
//           used = every tag currently on a recipe, with how many carry it;
//           colors = per-tag colour overrides {lowercase tag: "#rrggbb"} (migration 0037);
//           tagSlots = per-tag meal-slot preferences {lowercase tag: MealSlot[]}.
//   PATCH → any of (operator-only):
//           { presets: string[] }          replace the preset pill list
//           { rename: {from, to} }         rename a tag on EVERY recipe (and in presets/colours)
//           { remove: string }             strip a tag from EVERY recipe (and presets/colours)
//           { setColor: {tag, color} }     set (or clear, color=null) a tag's colour
//           { setTagSlots: {tag, slots} }  which meal slots that TAG is preferred for
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
  const row = await env.DB.prepare('SELECT recipe_tag_colours_json AS recipe_tag_colors_json FROM households WHERE id = ?')
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
  env.DB.prepare('UPDATE households SET recipe_tag_colours_json = ?, updated_at = ? WHERE id = ?').bind(
    JSON.stringify(colors),
    ts,
    householdId,
  )

// --- per-tag meal-slot preferences -------------------------------------------
// « Cette étiquette est pour ces repas-là » — a tag mapped to the meal slots it
// belongs to, so a recipe tagged « Souper » leads the souper picker without anyone
// having to build a pill for it. A custom PILL could already carry `slots`, but that
// asks the household to model a filter in order to state a fact about a label; the
// label is where people put the meaning, so it is where the preference belongs.
//
// Lives in household_preferences (migration 0106), NOT a new `households` column —
// DB-6: that table already carries 18 preference columns, which is exactly the
// threshold that table was created for. Keyed by LOWERCASED tag, like `colors`, so it
// tracks a tag through whatever casing a recipe stored.
const TAG_SLOTS_KEY = 'recipeTagSlots'
export type TagSlots = Record<string, string[]>

// Shape-gated on read AND on write, same rule as the pill config: an unknown slot, a
// non-array value or a junk key is dropped rather than trusted. A tag whose list ends
// up empty is removed outright, so "no preference" is one state, never two.
function cleanTagSlots(raw: unknown): TagSlots {
  const out: TagSlots = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const tag = cleanTag(k)
    if (!tag) continue
    const slots = cleanPillSlots(v)
    if (slots.length) out[tag.toLowerCase()] = slots
  }
  return out
}

const readTagSlots = async (env: { DB: D1Database }, householdId: string): Promise<TagSlots> =>
  cleanTagSlots(await getPref<unknown>(env as never, householdId, TAG_SLOTS_KEY))

// --- recipe-tab pill config (migration 0045) ---------------------------------
// Mirror of src/lib/recipePills.ts, validated server-side. Built-ins are gated to
// a known key list; custom pills need a label + ≥1 valid rule. Shape is gated, not
// trusted — a malformed pill / criterion is dropped on read AND on write.
const PILL_BUILTINS = ['cookable', 'useSoon', 'fast', 'neglected', 'favorites', 'recent']
const NUM_FIELDS = ['totalMin', 'prepMin', 'cookMin', 'ingredients', 'servings']
// Mirror of MEAL_SLOTS in src/lib/mealSlots.ts — a custom pill's optional `slots`
// (which meal slots it should be prioritized for, e.g. a "Dîner & Souper" pill).
const MEAL_SLOTS = ['breakfast', 'lunch', 'supper', 'snack', 'dessert']

// Known slots only, deduped, capped at one-per-slot. Anything else (a stale/typo'd
// value) is silently dropped — same "shape gated, not trusted" rule as the rest of
// this file.
function cleanPillSlots(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter((s): s is string => isStr(s) && MEAL_SLOTS.includes(s)))]
}

function cleanCriterion(c: unknown): Record<string, unknown> | null {
  if (!c || typeof c !== 'object') return null
  const o = c as Record<string, unknown>
  if (o.field === 'tag') {
    // A tag rule OR-s 1+ tags. Accept the array shape and the LEGACY single `tag`
    // (pills saved before multi-tag); store normalized as a deduped string[].
    const rawTags = Array.isArray(o.tags) ? o.tags : o.tag != null ? [o.tag] : []
    const seen = new Set<string>()
    const tags: string[] = []
    for (const r of rawTags.slice(0, 20)) {
      const tg = cleanTag(r)
      if (tg && !seen.has(tg.toLowerCase())) {
        seen.add(tg.toLowerCase())
        tags.push(tg)
      }
    }
    return tags.length ? { field: 'tag', tags } : null
  }
  if (o.field === 'favorite' || o.field === 'photo') return { field: o.field }
  if (isStr(o.field) && NUM_FIELDS.includes(o.field)) {
    const n = Number(o.n)
    if (!Number.isFinite(n) || n < 0 || n > 100000) return null
    return { field: o.field, op: o.op === 'gte' ? 'gte' : 'lte', n: Math.round(n) }
  }
  return null
}

function cleanPills(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return []
  const out: Record<string, unknown>[] = []
  const seenK = new Set<string>()
  const seenId = new Set<string>()
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue
    const o = p as Record<string, unknown>
    if (isStr(o.k) && PILL_BUILTINS.includes(o.k)) {
      if (seenK.has(o.k)) continue
      seenK.add(o.k)
      out.push(o.off ? { k: o.k, off: true } : { k: o.k })
    } else if (isStr(o.id) && Array.isArray(o.rules)) {
      const id = o.id.slice(0, 40)
      if (!id || seenId.has(id)) continue
      const label = isStr(o.label) ? o.label.trim().slice(0, 24) : ''
      const rules = o.rules.map(cleanCriterion).filter((c): c is Record<string, unknown> => !!c).slice(0, 6)
      if (!label || !rules.length) continue
      seenId.add(id)
      const color = cleanColor(o.color)
      const slots = cleanPillSlots(o.slots)
      out.push({
        id,
        label,
        rules,
        ...(color ? { color } : {}),
        ...(o.off ? { off: true } : {}),
        ...(slots.length ? { slots } : {}),
      })
    }
    if (out.length >= 30) break
  }
  return out
}

// Ensure every built-in is present (append any missing, shown, at the end) — so a
// new built-in pill surfaces for households whose saved config predates it.
function withAllBuiltins(pills: Record<string, unknown>[]): Record<string, unknown>[] {
  const have = new Set(pills.filter((p) => isStr(p.k)).map((p) => p.k as string))
  return [...pills, ...PILL_BUILTINS.filter((k) => !have.has(k)).map((k) => ({ k }))]
}

async function readPills(env: { DB: D1Database }, householdId: string): Promise<Record<string, unknown>[]> {
  const row = await env.DB.prepare('SELECT recipe_pills_json FROM households WHERE id = ?')
    .bind(householdId)
    .first<{ recipe_pills_json: string | null }>()
  let raw: unknown
  try {
    raw = JSON.parse(row?.recipe_pills_json ?? 'null')
  } catch {
    raw = null
  }
  const cleaned = cleanPills(raw)
  // null / empty / all-junk → the default set (every built-in, shown, in order).
  return withAllBuiltins(cleaned.length ? cleaned : PILL_BUILTINS.map((k) => ({ k })))
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
  const colors = await readColors(ctx.env, actor.householdId)
  const pills = await readPills(ctx.env, actor.householdId)
  const tagSlots = await readTagSlots(ctx.env, actor.householdId)
  return ok({ presets, used, colors, pills, tagSlots })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    presets?: unknown
    rename?: { from?: unknown; to?: unknown }
    remove?: unknown
    setColor?: { tag?: unknown; color?: unknown }
    setTagSlots?: { tag?: unknown; slots?: unknown }
    setPills?: unknown
  }>(ctx.request)
  if (!body) return badRequest('Corps requis.')

  // Replace the whole pill config (order + shown/hidden + custom pills). Cleaned
  // server-side; an empty/all-junk array resets to the built-in default set.
  if (body.setPills !== undefined) {
    const pills = cleanPills(body.setPills)
    await ctx.env.DB.prepare('UPDATE households SET recipe_pills_json = ?, updated_at = ? WHERE id = ?')
      .bind(JSON.stringify(pills), nowSec(), actor.householdId)
      .run()
    return ok({ pills: withAllBuiltins(pills.length ? pills : PILL_BUILTINS.map((k) => ({ k }))) })
  }

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

  // Set (or clear, with an empty list) which meal slots a TAG is preferred for.
  if (body.setTagSlots) {
    const tag = cleanTag(body.setTagSlots.tag)
    if (!tag) return badRequest('tag requis.')
    const slots = cleanPillSlots(body.setTagSlots.slots)
    const all = await readTagSlots(ctx.env, actor.householdId)
    const key = tag.toLowerCase()
    if (slots.length) all[key] = slots
    else delete all[key]
    await setPref(ctx.env as never, actor.householdId, TAG_SLOTS_KEY, all)
    return ok({ tagSlots: all })
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

  // …and its meal-slot preference, for the same reason: renaming « Souper » to
  // « Soir » must not quietly drop what that label MEANT. Written outside the batch
  // because it lives in household_preferences (a separate upsert, not a D1 statement
  // this function builds) — a rename that only moved slots still reports 0 changed
  // rows, which is honest: no recipe changed.
  const tagSlots = await readTagSlots(ctx.env, actor.householdId)
  if (fromKey in tagSlots) {
    const slots = tagSlots[fromKey]!
    delete tagSlots[fromKey]
    if (renameTo) tagSlots[renameTo.toLowerCase()] = slots
    await setPref(ctx.env as never, actor.householdId, TAG_SLOTS_KEY, tagSlots)
  }

  if (updates.length) await ctx.env.DB.batch(updates)
  return ok({ changed: updates.length })
})
