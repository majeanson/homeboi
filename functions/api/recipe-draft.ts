import { badRequest, ok, serviceUnavailable, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { draftRecipe, resolveLang } from '../_lib/ai'

// AI-draft a recipe from just a title, so a new recipe card starts filled in
// instead of blank. Read-only suggestion: the recipes POST does the saving; the
// cook edits freely first. Degrades to 503 when AI is unset → the UI just opens
// an empty editor. Same on-demand one-call shape as suggest-meal / meal-staples.
export const onRequestPost = authed(async (ctx) => {
  if (!ctx.env.AI) return serviceUnavailable('Suggestion IA indisponible ici.')
  const body = await readJson<{ title?: string }>(ctx.request)
  const title = body?.title?.trim()
  if (!title) return badRequest('Titre requis.')
  const draft = await draftRecipe(ctx.env, title, resolveLang(ctx.env, ctx.request))
  return ok(draft)
})
