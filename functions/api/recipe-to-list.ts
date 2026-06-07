import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { profileMemberId } from '../_lib/profile'
import { ingredientName } from '../_lib/ingredient'

// Push a recipe's ingredients onto the shared list in ONE call (source 'recipe',
// so the ghost list / list UI can tell where they came from). Mirrors the meal
// staples write in meals.ts; kept its own endpoint so the recipe sheet's "add
// ingredients" button is a single round-trip, not N list POSTs.
export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ items?: string[] }>(ctx.request)
  // Reduce each recipe line to its buyable name ("15 ml de beurre" → "Beurre")
  // and de-dupe — the grocery list wants items, not measured recipe lines.
  const seen = new Set<string>()
  const items: string[] = []
  for (const s of body?.items ?? []) {
    if (typeof s !== 'string' || !s.trim()) continue
    const name = ingredientName(s).slice(0, 200)
    const key = name.toLowerCase()
    if (name && !seen.has(key)) {
      seen.add(key)
      items.push(name)
    }
    if (items.length >= 40) break
  }
  if (items.length === 0) return badRequest('Aucun ingrédient.')
  const ts = nowSec()
  const addedBy = profileMemberId(ctx.request)
  await ctx.env.DB.batch(
    items.map((item) =>
      ctx.env.DB.prepare(
        'INSERT INTO list_items (id, household_id, text, source, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).bind(newId(), actor.householdId, item, 'recipe', addedBy, ts),
    ),
  )
  return ok({ added: items.length })
})
