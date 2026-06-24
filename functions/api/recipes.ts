import { badRequest, ok, created, notFound, readJson, parseJsonArray } from '../_lib/json'
import { authed } from '../_lib/route'
import { deleteR2Blob } from '../_lib/r2'
import { newId, nowSec } from '../_lib/ids'

// Recipe book CRUD (the "consultation + meal-planning helper" layer). A recipe is
// a household card: title + ingredient lines + prep steps (both string[] stored
// as JSON), with optional servings/notes/source. See migration 0008.
//
// Companion endpoints keep their own files (the per-concern convention):
//   recipe-draft  — AI drafts ingredients/steps from a title (503 degrade)
//   recipe-to-list — push a recipe's ingredients onto the shared list

interface RecipeRow {
  id: string
  title: string
  ingredients_json: string
  steps_json: string
  servings: number | null
  servings_unit: string | null
  prep_min: number | null
  cook_min: number | null
  total_min: number | null
  notes: string | null
  source: string | null
  image: string | null
  tags_json: string
  original_json: string | null
  steps_images_json: string | null
  lang: string | null
  updated_at: number
}

interface RecipeBody {
  id?: string
  title?: string
  ingredients?: string[]
  steps?: string[]
  servings?: number | null
  servingsUnit?: string | null
  prepMin?: number | null
  cookMin?: number | null
  totalMin?: number | null
  notes?: string | null
  source?: string | null
  image?: string | null
  tags?: string[]
  original?: RecipeOriginal | null
  // Parallel per-step photo keys (feature #17 B) — same length as steps.
  stepImages?: unknown
  // The recipe's reading language for read-aloud ('fr' | 'en', null = follow UI).
  lang?: string | null
}

// The as-imported snapshot (migration 0020): what the import (URL / paste /
// photo) produced, untouched, so the sheet can always show "the original".
interface RecipeOriginal {
  title: string | null
  ingredients: string[]
  steps: string[]
  servings?: number | null
  source?: string | null
  importedAt?: number
  // R2 key of the photo this recipe was read from (photo-import path), so the
  // sheet's "Original" view can show the source card. An R2 key only — never a
  // remote URL — and freed with the row on delete.
  sourceImage?: string | null
}

// An image value is either an R2 key (a single path segment we own) or a remote
// https URL (imported). Only R2 keys get deleted from the bucket on row delete.
const isR2Key = (v: string | null | undefined): v is string => !!v && !/^https?:\/\//i.test(v)
// Accept an http(s) URL or a short R2-key-shaped token; reject anything else so a
// client can't stuff arbitrary junk into the column.
function cleanImage(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  if (/^https?:\/\//i.test(s)) return s.slice(0, 600)
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : null
}

const isStr = (v: unknown): v is string => typeof v === 'string'

// A time field is whole minutes, 1..48 h — anything else stores null.
const cleanMin = (v: unknown): number | null =>
  typeof v === 'number' && isFinite(v) && v > 0 && v <= 48 * 60 ? Math.round(v) : null
// The yield's unit word ("biscuits"); short free text, null when blank.
const cleanUnit = (v: unknown): string | null => (isStr(v) ? v.trim().slice(0, 24) || null : null)
// Reading language for read-aloud — only the two the app supports; anything else
// (or unset) stores null = "follow the UI language" (the long-standing default).
const cleanLang = (v: unknown): string | null => (v === 'fr' || v === 'en' ? v : null)

// Trim, drop blanks, cap length + count so a runaway paste can't bloat a row.
// Ingredients fit in 200 chars; STEPS need more (a real instruction sentence
// group runs longer) — silently chopping them at 200 was mangling imports.
function cleanList(v: unknown, max = 40, maxLen = 200): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => (isStr(x) ? x.trim() : ''))
    .filter(Boolean)
    .map((s) => s.slice(0, maxLen))
    .slice(0, max)
}
const cleanSteps = (v: unknown): string[] => cleanList(v, 40, 500)

// Per-step photos (feature #17 B, migration 0041): a PARALLEL array to steps,
// stepImages[i] is the R2 key for step i, or '' when that step has no photo. We
// keep it the SAME LENGTH as steps (a heading row's slot is simply empty) so the
// cook view indexes it positionally — pad/trim to `count`, validate each entry is
// an R2-key-shaped token ('' otherwise). Defensive on read: a bad/short row reads
// as all-''. Remote URLs aren't accepted here — step photos are always uploads.
const isStepImgKey = (v: unknown): v is string => isStr(v) && /^[A-Za-z0-9_-]{1,64}$/.test(v)
function normalizeStepImages(v: unknown, count: number): string[] {
  const src = parseJsonArray<unknown>(typeof v === 'string' ? v : JSON.stringify(v ?? []))
  const out: string[] = []
  for (let i = 0; i < count; i++) out.push(isStepImgKey(src[i]) ? (src[i] as string) : '')
  return out
}
// The R2 keys actually present in a step-image array — for cleanup on delete.
const stepImageKeys = (v: unknown): string[] => normalizeStepImages(v, 40).filter((k) => k.length > 0)

// The read-from photo's R2 key inside a stored original snapshot, if any — so it's
// freed with the row (and when a re-import during edit replaces the snapshot).
function originalSourceImage(json: string | null): string | null {
  const o = parseOriginal(json)
  return isStepImgKey(o?.sourceImage) ? (o!.sourceImage as string) : null
}

// Validate + serialize the as-imported snapshot. Returns the JSON string for
// the column, or null when the value isn't a usable snapshot. Same caps as the
// live fields so a hostile client can't bloat the row through this side door.
function cleanOriginal(v: unknown): string | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as RecipeOriginal
  const ingredients = cleanList(o.ingredients)
  const steps = cleanSteps(o.steps)
  if (!ingredients.length && !steps.length) return null
  return JSON.stringify({
    title: isStr(o.title) ? o.title.trim().slice(0, 200) || null : null,
    ingredients,
    steps,
    servings: typeof o.servings === 'number' && o.servings > 0 ? Math.floor(o.servings) : null,
    source: isStr(o.source) ? o.source.trim().slice(0, 600) || null : null,
    importedAt: typeof o.importedAt === 'number' ? Math.floor(o.importedAt) : null,
    // The read-from photo's R2 key (validated like a step-image key, never a URL).
    sourceImage: isStepImgKey(o.sourceImage) ? o.sourceImage : null,
  })
}

// Parse the stored snapshot back out (defensive — a bad row reads as null).
function parseOriginal(json: string | null): RecipeOriginal | null {
  if (!json) return null
  try {
    const o = JSON.parse(json) as RecipeOriginal
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null
  } catch {
    return null
  }
}

// Tags: short, deduped (case-insensitively), few. A tighter cleanList.
function cleanTags(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of v) {
    if (!isStr(x)) continue
    const s = x.trim().slice(0, 24)
    const key = s.toLowerCase()
    if (s && !seen.has(key)) {
      seen.add(key)
      out.push(s)
    }
  }
  return out.slice(0, 8)
}

export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, title, ingredients_json, steps_json, servings, servings_unit, prep_min, cook_min, total_min, notes, source, image, tags_json, original_json, steps_images_json, lang, updated_at FROM recipes WHERE household_id = ? ORDER BY title',
  )
    .bind(actor.householdId)
    .all<RecipeRow>()
  const recipes = (results ?? []).map((r) => {
    const steps = parseJsonArray<string>(r.steps_json, isStr)
    return {
      id: r.id,
      title: r.title,
      ingredients: parseJsonArray<string>(r.ingredients_json, isStr),
      steps,
      servings: r.servings,
      servingsUnit: r.servings_unit,
      prepMin: r.prep_min,
      cookMin: r.cook_min,
      totalMin: r.total_min,
      notes: r.notes,
      source: r.source,
      image: r.image,
      tags: parseJsonArray<string>(r.tags_json, isStr),
      original: parseOriginal(r.original_json),
      // Parallel per-step photo keys, '' = none (feature #17 B).
      stepImages: normalizeStepImages(r.steps_images_json, steps.length),
      // Reading language for read-aloud (#TTS): 'fr' | 'en' | null = follow UI.
      lang: cleanLang(r.lang),
      updatedAt: r.updated_at,
    }
  })
  return ok({ recipes })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<RecipeBody>(ctx.request)
  const title = body?.title?.trim()
  if (!title) return badRequest('Titre requis.')
  const id = newId()
  const ts = nowSec()
  const servings = typeof body?.servings === 'number' && body.servings > 0 ? Math.floor(body.servings) : null
  const steps = cleanSteps(body?.steps)
  await ctx.env.DB.prepare(
    'INSERT INTO recipes (id, household_id, title, ingredients_json, steps_json, servings, servings_unit, prep_min, cook_min, total_min, notes, source, image, tags_json, original_json, steps_images_json, lang, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      id,
      actor.householdId,
      title.slice(0, 200),
      JSON.stringify(cleanList(body?.ingredients)),
      JSON.stringify(steps),
      servings,
      cleanUnit(body?.servingsUnit),
      cleanMin(body?.prepMin),
      cleanMin(body?.cookMin),
      cleanMin(body?.totalMin),
      body?.notes?.trim()?.slice(0, 2000) || null,
      body?.source?.trim()?.slice(0, 200) || null,
      cleanImage(body?.image),
      JSON.stringify(cleanTags(body?.tags)),
      cleanOriginal(body?.original),
      // Step photos kept parallel + sliced to the cleaned steps length (feature #17 B).
      JSON.stringify(normalizeStepImages(body?.stepImages, steps.length)),
      cleanLang(body?.lang),
      ts,
      ts,
    )
    .run()
  return created({ id })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<RecipeBody>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  const title = body.title?.trim()
  if (!title) return badRequest('Titre requis.')
  const servings = typeof body.servings === 'number' && body.servings > 0 ? Math.floor(body.servings) : null
  const image = cleanImage(body.image)
  const steps = cleanSteps(body.steps)
  // The previous image, so we can free a now-orphaned R2 blob when it's replaced
  // or cleared (remote URLs need no cleanup), the previous original snapshot so an
  // edit that doesn't carry one never wipes it, and the previous step-image keys
  // so we can free any that this edit drops (feature #17 B).
  const prev = await ctx.env.DB.prepare(
    'SELECT image, original_json, steps_images_json FROM recipes WHERE id = ? AND household_id = ?',
  )
    .bind(body.id, actor.householdId)
    .first<{ image: string | null; original_json: string | null; steps_images_json: string | null }>()
  if (!prev) return notFound('Recette introuvable.')
  // A fresh import during the edit replaces the snapshot; anything else keeps it.
  const original = cleanOriginal(body.original) ?? prev.original_json
  // Step photos: a sent array re-aligns to the new step count; otherwise re-pad
  // the existing one to the new length so a step add/remove never desyncs it.
  const newStepImages =
    body.stepImages !== undefined
      ? normalizeStepImages(body.stepImages, steps.length)
      : normalizeStepImages(prev.steps_images_json, steps.length)
  await ctx.env.DB.prepare(
    'UPDATE recipes SET title = ?, ingredients_json = ?, steps_json = ?, servings = ?, servings_unit = ?, prep_min = ?, cook_min = ?, total_min = ?, notes = ?, source = ?, image = ?, tags_json = ?, original_json = ?, steps_images_json = ?, lang = ?, updated_at = ? WHERE id = ? AND household_id = ?',
  )
    .bind(
      title.slice(0, 200),
      JSON.stringify(cleanList(body.ingredients)),
      JSON.stringify(steps),
      servings,
      cleanUnit(body.servingsUnit),
      cleanMin(body.prepMin),
      cleanMin(body.cookMin),
      cleanMin(body.totalMin),
      body.notes?.trim()?.slice(0, 2000) || null,
      body.source?.trim()?.slice(0, 200) || null,
      image,
      JSON.stringify(cleanTags(body.tags)),
      original,
      JSON.stringify(newStepImages),
      cleanLang(body.lang),
      nowSec(),
      body.id,
      actor.householdId,
    )
    .run()
  if (isR2Key(prev.image) && prev.image !== image) await deleteR2Blob(ctx.env.PHOTOS, prev.image)
  // Free any step-photo blobs this edit orphaned (a key present before but no
  // longer in the saved array). Best-effort; never blocks the save.
  if (ctx.env.PHOTOS) {
    const kept = new Set(newStepImages)
    const orphaned = stepImageKeys(prev.steps_images_json).filter((k) => !kept.has(k))
    for (const k of orphaned) await deleteR2Blob(ctx.env.PHOTOS, k)
    // A re-import during the edit can replace the snapshot (and its source photo);
    // free the old source-card blob when it's no longer the one we just stored.
    const prevSrc = originalSourceImage(prev.original_json)
    const nextSrc = originalSourceImage(original)
    if (prevSrc && prevSrc !== nextSrc) await deleteR2Blob(ctx.env.PHOTOS, prevSrc)
  }
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  // Free the R2 blobs this recipe owned: its display picture (remote URLs aren't
  // ours) AND every per-step photo key (feature #17 B). Best-effort, never blocks.
  const row = await ctx.env.DB.prepare(
    'SELECT image, steps_images_json, original_json FROM recipes WHERE id = ? AND household_id = ?',
  )
    .bind(body.id, actor.householdId)
    .first<{ image: string | null; steps_images_json: string | null; original_json: string | null }>()
  if (ctx.env.PHOTOS) {
    if (isR2Key(row?.image)) await deleteR2Blob(ctx.env.PHOTOS, row?.image)
    for (const k of stepImageKeys(row?.steps_images_json)) await deleteR2Blob(ctx.env.PHOTOS, k)
    // The source-card photo lives in the original snapshot (photo-import path).
    const src = originalSourceImage(row?.original_json ?? null)
    if (src) await deleteR2Blob(ctx.env.PHOTOS, src)
  }
  await ctx.env.DB.prepare('DELETE FROM recipes WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  // Free the recipe's favorite hearts (#21) — D1 doesn't cascade FKs, so clear
  // them here or they'd linger as orphans keyed to a gone recipe.
  await ctx.env.DB.prepare('DELETE FROM recipe_loves WHERE recipe_id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})
