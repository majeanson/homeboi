import { ok } from '../_lib/json'
import { authed } from '../_lib/route'
import { countSampleData, seedSampleData, clearSampleData } from '../_lib/sampleData'

// Sample/demo data for a first-time household (onboarding Phase 1). Seeding runs
// automatically at account creation (auth/signup + first-login), so this endpoint
// is the MANAGE surface the operator reaches from the board banner (« Exemples pour
// explorer ») and Réglages:
//   GET    — how many demo rows exist (drives the banner + the Réglages control).
//            Any actor: a kiosk board reads it to decide whether to show the banner.
//   POST   — (re)seed the demo family — operator only. No-ops if already present.
//   DELETE — « Vider les exemples »: remove every seeded row — operator only.
//
// Everything is tagged is_sample=1 (migration 0096) so clear touches only the demo,
// never a row the operator created while exploring. Media-free → clear is pure DB.

export const onRequestGet = authed(async (ctx, actor) => {
  return ok({ count: await countSampleData(ctx.env, actor.householdId) })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const seeded = await seedSampleData(ctx.env, actor.householdId)
  return ok({ seeded, count: await countSampleData(ctx.env, actor.householdId) })
}, 'operator')

export const onRequestDelete = authed(async (ctx, actor) => {
  await clearSampleData(ctx.env, actor.householdId)
  return ok({ count: 0 })
}, 'operator')
