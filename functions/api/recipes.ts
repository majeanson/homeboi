import { badRequest, ok, created, notFound, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { deleteR2Blob } from '../_lib/r2'
import { newId, nowSec } from '../_lib/ids'
import { isValidR2Key } from '../_lib/validate'
import { MAX_INGREDIENT_LEN, MAX_INGREDIENTS, MAX_NOTES_LEN, MAX_STEP_LEN, MAX_STEP_ROWS } from '../_lib/recipeImport'
// THE row -> wire mapping for the list read lives in one place, with the reason the
// as-imported snapshot is not in it. Its test is the guard.
import { recipeListItem, parseOriginal, type RecipeRow, type RecipeOriginal } from '../_lib/recipeWire'
// The step-image lockstep rule lives in ONE server home (its client twin is
// src/lib/parallelArray.ts) — see functions/_lib/recipeStepImages.ts.
import { normalizeStepImages, stepImageKeys } from '../_lib/recipeStepImages'

// Recipe book CRUD (the "consultation + meal-planning helper" layer). A recipe is
// a household card: title + ingredient lines + prep steps (both string[] stored
// as JSON), with optional servings/notes/source. See migration 0008.
//
// Companion endpoints keep their own files (the per-concern convention):
//   recipe-draft  — AI drafts ingredients/steps from a title (503 degrade)
//   recipe-to-list — push a recipe's ingredients onto the shared list

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
  return isValidR2Key(s) ? s : null
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
// STEPS need much more than ingredients (a real instruction sentence group runs
// long) — silently chopping them at 200 mangled imports, then 500 was still too
// tight for a dense run-on step, so steps get MAX_STEP_LEN (1000). Every cap is the
// SAME constant the importer uses, so a line that survives the import survives the
// save unchanged (ingredients were a bare 200 here until 2026-10-30).
function cleanList(v: unknown, max = MAX_INGREDIENTS, maxLen = MAX_INGREDIENT_LEN): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => (isStr(x) ? x.trim() : ''))
    .filter(Boolean)
    .map((s) => s.slice(0, maxLen))
    .slice(0, max)
}
// MAX_STEP_ROWS = the importer's MAX_STEPS steps plus room for their "## " headings.
// It was 40 rows, so a long import lost its tail AT SAVE (2026-10-27).
const cleanSteps = (v: unknown): string[] => cleanList(v, MAX_STEP_ROWS, MAX_STEP_LEN)

// The read-from photos' R2 keys inside a stored original snapshot — every page (the
// first doubles as `sourceImage` for older snapshots) — so they are freed with the row
// (and when a re-import during edit replaces the snapshot).
function originalSourceImages(json: string | null): string[] {
  const o = parseOriginal(json)
  if (!o) return []
  const keys = [o.sourceImage, ...(Array.isArray(o.sourceImages) ? o.sourceImages : [])].filter((k): k is string => isValidR2Key(k))
  return [...new Set(keys)]
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
    // The read-from photo's R2 key (validated like a step-image key, never a URL) —
    // and every page of it, in order, a few at most (a spread is two or three).
    sourceImage: isValidR2Key(o.sourceImage) ? o.sourceImage : null,
    sourceImages: (Array.isArray(o.sourceImages) ? o.sourceImages : []).filter((k): k is string => isValidR2Key(k)).slice(0, 8),
  })
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
  // ONE mapper (_lib/recipeWire), whose header says why the as-imported snapshot
  // is not in this payload and whose test holds it there. original_json is still
  // SELECTed: healTruncatedSteps reads it to restore steps the old 200-char cap
  // chopped — it is read, not sent.
  const recipes = (results ?? []).map(recipeListItem)
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
      body?.notes?.trim()?.slice(0, MAX_NOTES_LEN) || null,
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
      body.notes?.trim()?.slice(0, MAX_NOTES_LEN) || null,
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
    // A re-import during the edit can replace the snapshot (and its source photos);
    // free every old source-page blob that is no longer among the ones just stored.
    const nextSrc = new Set(originalSourceImages(original))
    for (const k of originalSourceImages(prev.original_json)) if (!nextSrc.has(k)) await deleteR2Blob(ctx.env.PHOTOS, k)
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
    // The source-card photos live in the original snapshot (photo-import path).
    for (const k of originalSourceImages(row?.original_json ?? null)) await deleteR2Blob(ctx.env.PHOTOS, k)
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
