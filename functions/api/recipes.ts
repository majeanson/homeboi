import { badRequest, ok, created, notFound, readJson, parseJsonArray } from '../_lib/json'
import { authed } from '../_lib/route'
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
  notes: string | null
  source: string | null
  image: string | null
  updated_at: number
}

interface RecipeBody {
  id?: string
  title?: string
  ingredients?: string[]
  steps?: string[]
  servings?: number | null
  notes?: string | null
  source?: string | null
  image?: string | null
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

// Trim, drop blanks, cap length + count so a runaway paste can't bloat a row.
function cleanList(v: unknown, max = 40): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => (isStr(x) ? x.trim() : ''))
    .filter(Boolean)
    .map((s) => s.slice(0, 200))
    .slice(0, max)
}

export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, title, ingredients_json, steps_json, servings, notes, source, image, updated_at FROM recipes WHERE household_id = ? ORDER BY title',
  )
    .bind(actor.householdId)
    .all<RecipeRow>()
  const recipes = (results ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    ingredients: parseJsonArray<string>(r.ingredients_json, isStr),
    steps: parseJsonArray<string>(r.steps_json, isStr),
    servings: r.servings,
    notes: r.notes,
    source: r.source,
    image: r.image,
    updatedAt: r.updated_at,
  }))
  return ok({ recipes })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<RecipeBody>(ctx.request)
  const title = body?.title?.trim()
  if (!title) return badRequest('Titre requis.')
  const id = newId()
  const ts = nowSec()
  const servings = typeof body?.servings === 'number' && body.servings > 0 ? Math.floor(body.servings) : null
  await ctx.env.DB.prepare(
    'INSERT INTO recipes (id, household_id, title, ingredients_json, steps_json, servings, notes, source, image, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      id,
      actor.householdId,
      title.slice(0, 200),
      JSON.stringify(cleanList(body?.ingredients)),
      JSON.stringify(cleanList(body?.steps)),
      servings,
      body?.notes?.trim()?.slice(0, 2000) || null,
      body?.source?.trim()?.slice(0, 200) || null,
      cleanImage(body?.image),
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
  // The previous image, so we can free a now-orphaned R2 blob when it's replaced
  // or cleared (remote URLs need no cleanup).
  const prev = await ctx.env.DB.prepare('SELECT image FROM recipes WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .first<{ image: string | null }>()
  if (!prev) return notFound('Recette introuvable.')
  await ctx.env.DB.prepare(
    'UPDATE recipes SET title = ?, ingredients_json = ?, steps_json = ?, servings = ?, notes = ?, source = ?, image = ?, updated_at = ? WHERE id = ? AND household_id = ?',
  )
    .bind(
      title.slice(0, 200),
      JSON.stringify(cleanList(body.ingredients)),
      JSON.stringify(cleanList(body.steps)),
      servings,
      body.notes?.trim()?.slice(0, 2000) || null,
      body.source?.trim()?.slice(0, 200) || null,
      image,
      nowSec(),
      body.id,
      actor.householdId,
    )
    .run()
  if (isR2Key(prev.image) && prev.image !== image && ctx.env.PHOTOS) {
    await ctx.env.PHOTOS.delete(prev.image).catch(() => {})
  }
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  // Free the R2 blob if this recipe owned an uploaded picture (remote URLs aren't ours).
  const row = await ctx.env.DB.prepare('SELECT image FROM recipes WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .first<{ image: string | null }>()
  if (isR2Key(row?.image) && ctx.env.PHOTOS) await ctx.env.PHOTOS.delete(row!.image!).catch(() => {})
  await ctx.env.DB.prepare('DELETE FROM recipes WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})
