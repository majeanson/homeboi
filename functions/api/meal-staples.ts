import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { mealStaples, resolveLang } from '../_lib/ai'

// Meal -> grocery staples (PRD B3). Given a planned supper title, suggest the
// staples it needs so the client can offer the missing ones for the shared
// list. Read-only: this only SUGGESTS — the meals POST does the writing (with
// source 'meal'). `requiresAi` 503s when AI is off (binding unset OR household
// switched it off); the UI then just saves the meal without the staple step.
export const onRequestPost = authed(async (ctx) => {
  const body = await readJson<{ title?: string }>(ctx.request)
  const title = body?.title?.trim()
  if (!title) return badRequest('Titre requis.')

  const staples = await mealStaples(ctx.env, title, resolveLang(ctx.env, ctx.request))
  return ok({ staples })
}, undefined, { requiresAi: true })
