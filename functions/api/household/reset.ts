import { authed } from '../../_lib/route'
import { badRequest, ok, readJson } from '../../_lib/json'
import { requireHouseholdName, requirePassword } from '../../_lib/sudo'
import { resetHouseholdContent } from '../../_lib/restore'

// POST /api/household/reset — « Repartir à neuf » (2026-09-23). Everything the
// household holds goes: the examples, whatever was tried while exploring, the family's
// own rows, the photos in R2. What stays is who may open it — the account and this
// session, the paired tablets, the links handed out — and the settings
// (resetHouseholdContent, _lib/restore.ts, says exactly which tables and why).
//
// The little sibling of DELETE /api/household (leaving), and locked like it, because
// what it erases is just as gone: `authed(…, 'operator')`, the password, and the
// household's name retyped (_lib/sudo.ts). POST, not DELETE, so a log line or a handler
// table can never confuse « start over » with « leave ».
//
// NOT in the outbox (`write-rule` ALLOWED with the reason): replaying « erase
// everything » hours later would erase what the family added since. No realtime
// mapping either — another open device catches up on its next poll, which is fine for
// something a household does once.
export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ password?: string; name?: string }>(ctx.request)
  if (!body) return badRequest('Corps invalide.')
  const denied = (await requirePassword(ctx.env, actor, body.password)) ?? (await requireHouseholdName(ctx.env, actor.householdId, body.name))
  if (denied) return denied

  await resetHouseholdContent(ctx.env, actor.householdId)
  return ok({ ok: true })
}, 'operator')
