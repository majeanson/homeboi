import { badRequest, ok, readJson, withAiError } from '../_lib/json'
import { authed } from '../_lib/route'
import { draftRecipe, resolveLang } from '../_lib/ai'

// AI-draft a recipe from just a title, so a new recipe card starts filled in
// instead of blank. Read-only suggestion: the recipes POST does the saving; the
// cook edits freely first. `requiresAi` 503s when AI is off (binding unset OR
// household switched it off) → the UI just opens an empty editor.
export const onRequestPost = authed(async (ctx) => {
  const body = await readJson<{ title?: string }>(ctx.request)
  const title = body?.title?.trim()
  if (!title) return badRequest('Titre requis.')
  const report = { error: null as string | null }
  const draft = await draftRecipe(ctx.env, title, resolveLang(ctx.env, ctx.request), report)
  return withAiError(ok(draft), report)
}, undefined, { requiresAi: true })
