import { ok } from '../../_lib/json'
import { authed } from '../../_lib/route'

// GET /api/takeout/backups — the nightly copies the cron keeps for THIS household in R2
// (`backup/<householdId>/<date>.json`, newest 14 — functions/_lib/nightly.ts), newest
// first. Operator-only like the takeout itself. R2 unset → an empty list, honestly.
export const onRequestGet = authed(async (ctx, actor) => {
  const bucket = ctx.env.PHOTOS
  if (!bucket) return ok({ backups: [] })
  const listed = await bucket.list({ prefix: `backup/${actor.householdId}/` })
  const backups = listed.objects
    .map((o) => ({ date: o.key.slice(`backup/${actor.householdId}/`.length).replace(/\.json$/, ''), bytes: o.size }))
    .filter((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.date))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
  return ok({ backups })
}, 'operator')
