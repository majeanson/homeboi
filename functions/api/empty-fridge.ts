import { ok, badRequest, serviceUnavailable, readJson, withAiError } from '../_lib/json'
import { authed } from '../_lib/route'
import { fridgeIdeas, draftRecipe, resolveLang, type AiReport } from '../_lib/ai'
import type { Env } from '../_lib/env'

// « Vide-frigo » — turn what's about to spoil into supper, in TWO cheap steps so a
// full recipe is only generated for the dishes the cook actually picks (NFR-COST):
//
//   step 'ideas'   → ONE AI call → ~10 dish NAMES built around the « à utiliser
//                    bientôt » + réserve items (anti-waste, not variety).
//   step 'recipes' → up to 3 picked names → a full recipe each (draftRecipe with the
//                    on-hand items as `have` context, so each leans on the perishables).
//
// Reads only EXISTING tables (pantry_use_soon + pantry_reserve) — no migration, no
// inventory count (calm). `requiresAi` 503s when AI is off → the SPA hides the tile.
// The right anti-waste signal is use-soon (things you HAVE that spoil), NOT pantry-low
// (a restock signal) — so this never touches pantry_low.
const MAX_PICKS = 3

// What the household has on hand to use up: the use-soon list first (the true
// spoilage signal), then the réserve stash. Capped so the prompt stays short.
async function gatherHave(env: Env, householdId: string): Promise<{ soon: string[]; reserve: string[] }> {
  const [soon, reserve] = await Promise.all([
    env.DB.prepare('SELECT item FROM pantry_use_soon WHERE household_id = ? ORDER BY marked_at DESC LIMIT 12')
      .bind(householdId)
      .all<{ item: string }>(),
    env.DB.prepare('SELECT item FROM pantry_reserve WHERE household_id = ? ORDER BY marked_at DESC LIMIT 12')
      .bind(householdId)
      .all<{ item: string }>(),
  ])
  return { soon: soon.results.map((r) => r.item), reserve: reserve.results.map((r) => r.item) }
}

export const onRequestPost = authed(
  async (ctx, actor) => {
    const body = await readJson<{ step?: string; avoid?: string[]; titles?: string[] }>(ctx.request).catch(() => null)
    const lang = resolveLang(ctx.env, ctx.request)
    const report: AiReport = { error: null }
    const have = await gatherHave(ctx.env, actor.householdId)

    // STEP 2 — flesh the picked names into full recipes, biased to the on-hand items.
    if (body?.step === 'recipes') {
      const titles = Array.isArray(body.titles)
        ? body.titles.filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, MAX_PICKS)
        : []
      if (!titles.length) return badRequest('Aucun plat choisi.')
      const haveAll = [...have.soon, ...have.reserve]
      const recipes = await Promise.all(
        titles.map(async (title) => {
          const draft = await draftRecipe(ctx.env, title.trim(), lang, report, haveAll)
          return { title: title.trim(), ingredients: draft.ingredients, steps: draft.steps }
        }),
      )
      return withAiError(ok({ recipes }), report)
    }

    // STEP 1 (default) — names that use up what's about to spoil. Nothing to use up →
    // a clean 503 (the tile is already hidden in this case, but a stale client gets a
    // calm "nothing to do" rather than an empty card).
    if (!have.soon.length && !have.reserve.length) {
      return withAiError(serviceUnavailable('Rien à écouler pour le moment.'), report)
    }
    const avoid = Array.isArray(body?.avoid)
      ? body!.avoid.filter((x): x is string => typeof x === 'string').slice(0, 20)
      : []
    const ideas = await fridgeIdeas(ctx.env, have, lang, avoid, report)
    if (!ideas.length) return withAiError(serviceUnavailable('Pas d’idée pour le moment.'), report)
    return ok({ ideas })
  },
  undefined,
  { requiresAi: true },
)
