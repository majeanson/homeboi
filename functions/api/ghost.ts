import type { Env } from '../_lib/env'
import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { normalizeItem } from '../_lib/normalize'
import { resolveLang } from '../_lib/ai'
import { rankGhosts, learnedCadence, trackCandidates, type PurchaseRow, type OverrideRow } from '../_lib/ghost'
import { staples } from '../_lib/ghostStaples'

// Ghost list — predictive grocery suggestions (see _lib/ghost for the logic and
// _lib/ghostStaples for the base "renew" set). Three reads merged: the purchase
// history (purchase_log), the operator's overrides (ghost_items), and the open
// list (so we never suggest what's already there). Suggest-only and capped —
// never auto-adds, never notifies (NFR-CALM).
//
//   GET /api/ghost            -> ranked suggestions for the list strip
//   GET /api/ghost?view=manage-> full editable set for Settings (incl. muted)
//   PATCH /api/ghost          -> upsert an override (tune cadence / mute / add)
//   DELETE /api/ghost         -> drop an override row (un-customize / remove)

interface OverrideDbRow {
  item_key: string
  label: string
  cadence_days: number | null
  muted: number
  source: string
}

async function readState(env: Env, hh: string) {
  const [log, overrides, open] = await Promise.all([
    env.DB.prepare('SELECT item_key, text, purchased_at FROM purchase_log WHERE household_id = ?')
      .bind(hh)
      .all<PurchaseRow>(),
    env.DB.prepare('SELECT item_key, label, cadence_days, muted, source FROM ghost_items WHERE household_id = ?')
      .bind(hh)
      .all<OverrideDbRow>(),
    // Every current line — checked or not — is "on the list" (a checked item is
    // about to be bought, not gone), so we don't re-suggest what's already there.
    env.DB.prepare('SELECT text FROM list_items WHERE household_id = ?')
      .bind(hh)
      .all<{ text: string }>(),
  ])
  return { log: log.results, overrides: overrides.results, open: open.results }
}

const toOverride = (r: OverrideDbRow): OverrideRow => ({
  item_key: r.item_key,
  label: r.label,
  cadence_days: r.cadence_days,
  muted: !!r.muted,
})

export const onRequestGet = authed(async (ctx, actor) => {
  const lang = resolveLang(ctx.env, ctx.request)
  const { log, overrides, open } = await readState(ctx.env, actor.householdId)
  const stapleList = staples(lang)

  if (new URL(ctx.request.url).searchParams.get('view') === 'manage') {
    // What the operator can tune: each staple and each row they added — and
    // ONLY those. Buying something never lands it here (tracking is a conscious
    // step); the purchase history just informs cadence/count for tracked keys,
    // and feeds the opt-in `candidates` block below.
    const agg = new Map<string, { count: number; lastAt: number; lastText: string; ts: number[] }>()
    for (const r of log) {
      const a = agg.get(r.item_key)
      if (!a) agg.set(r.item_key, { count: 1, lastAt: r.purchased_at, lastText: r.text, ts: [r.purchased_at] })
      else {
        a.count++
        a.ts.push(r.purchased_at)
        if (r.purchased_at >= a.lastAt) { a.lastAt = r.purchased_at; a.lastText = r.text }
      }
    }
    const stapleByKey = new Map(stapleList.map((s) => [s.key, s]))
    const ovByKey = new Map(overrides.map((o) => [o.item_key, o]))
    const keys = new Set<string>([...stapleByKey.keys(), ...ovByKey.keys()])

    const items = [...keys].map((key) => {
      const ov = ovByKey.get(key)
      const staple = stapleByKey.get(key)
      const a = agg.get(key)
      const cadenceDays = ov?.cadence_days ?? learnedCadence(a?.ts ?? []) ?? staple?.cadenceDays ?? null
      return {
        key,
        label: ov?.label ?? staple?.label ?? a?.lastText ?? key,
        cadenceDays,
        source: staple ? 'staple' : 'manual',
        muted: !!ov?.muted,
        count: a?.count ?? 0,
        lastAt: a?.lastAt ?? null,
      }
    })
    // Staples first, then most-bought, then alphabetical — a stable admin order.
    items.sort((x, y) =>
      (x.source === 'staple' ? 0 : 1) - (y.source === 'staple' ? 0 : 1) ||
      y.count - x.count ||
      x.label.localeCompare(y.label),
    )
    // Frequent untracked buys, offered for a one-tap deliberate opt-in.
    const candidates = trackCandidates(log, overrides.map(toOverride), stapleList)
    return ok({ items, candidates })
  }

  const openKeys = new Set(open.map((r) => normalizeItem(r.text)).filter(Boolean))
  // includeLater: the strip also gets the tracked items that aren't near renewal
  // ('later'), folded behind its "+N" — so the ghost list is always reachable
  // from the list page, not only on the days something happens to be due.
  const ghosts = rankGhosts({
    log,
    overrides: overrides.map(toOverride),
    staples: stapleList,
    openKeys,
    now: nowSec(),
    includeLater: true,
  })
  return ok({ ghosts })
})

// Clamp a cadence to a sane whole-day range, or null to clear it (fall back to
// the learned/seed default). Rejects nonsense without failing the whole call.
function cadence(value: unknown): number | null {
  if (value == null) return null
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return null
  return Math.min(365, Math.max(1, n))
}

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ key?: string; label?: string; cadenceDays?: number | null; muted?: boolean }>(ctx.request)
  const label = body?.label?.trim()
  // Tuning an existing staple/learned item sends its key; adding a custom one
  // sends a label we normalize into a key.
  const key = (body?.key?.trim() || (label ? normalizeItem(label) : '')).trim()
  if (!key) return badRequest('key ou label requis.')

  const stapleKeys = new Set(staples('fr').map((s) => s.key))
  const source = stapleKeys.has(key) ? 'override' : 'manual'
  const ts = nowSec()
  await ctx.env.DB.prepare(
    `INSERT INTO ghost_items (id, household_id, item_key, label, cadence_days, muted, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(household_id, item_key) DO UPDATE SET
       label = excluded.label,
       cadence_days = excluded.cadence_days,
       muted = excluded.muted,
       updated_at = excluded.updated_at`,
  )
    .bind(newId(), actor.householdId, key, label || key, cadence(body?.cadenceDays), body?.muted ? 1 : 0, source, ts, ts)
    .run()
  return ok({ ok: true, key })
}, 'operator')

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ key?: string }>(ctx.request)
  const key = body?.key?.trim()
  if (!key) return badRequest('key requis.')
  await ctx.env.DB.prepare('DELETE FROM ghost_items WHERE household_id = ? AND item_key = ?')
    .bind(actor.householdId, key)
    .run()
  return ok({ ok: true })
}, 'operator')
