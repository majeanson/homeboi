// Household "share info" — the few free-text facts a typed read-only share link
// surfaces (wifi to join, house rules, bin day). Migration 0072. Read here in one
// place so both /api/household (the operator editor) and /api/guest/window (what a
// sitter/welcome link actually sees) agree on shape. See functions/_lib/auth.ts
// GuestKind for the share-mode model.

import type { Env } from './env'
import type { GuestKind } from './auth'

// Per-kind TTL window for a share link (functions/api/guest/start.ts). Curated
// handoff links stay short (they leak today's plan, wifi, etc.); a Démo link may
// live up to a week so it can be pasted in a portfolio — still expiring, never
// permanent. Kept here (pure, no Env) so it's unit-testable without the handler.
const MIN_TTL = 30 * 60 // 30 min — floor for every kind
const DAY = 24 * 60 * 60
const TTL_BY_KIND: Record<GuestKind, { max: number; def: number }> = {
  welcome: { max: DAY, def: 4 * 60 * 60 },
  sitter: { max: DAY, def: 12 * 60 * 60 },
  showcase: { max: 7 * DAY, def: DAY },
  // The grandparents' window is a standing pane they glance at over days — longest
  // allowed (still expiring, never permanent), defaulting to the full week.
  family: { max: 7 * DAY, def: 7 * DAY },
  // An intake form link: a relative needs a few days to get around to filling it,
  // so it matches the family window (a week, still expiring).
  intake: { max: 7 * DAY, def: 7 * DAY },
  // « La boîte aux lettres » — an open link relatives keep handy to drop a word over
  // several days; same window as intake (a week, still expiring).
  postbox: { max: 7 * DAY, def: 7 * DAY },
}

// Clamp a requested TTL into the kind's window, or fall back to the kind default
// when the request is absent/non-finite.
export function clampShareTtl(kind: GuestKind, requested: unknown): number {
  const { max, def } = TTL_BY_KIND[kind]
  if (requested == null) return def // absent → the kind's default (Number(null) is 0, so guard first)
  const raw = Number(requested)
  return Number.isFinite(raw) ? Math.min(max, Math.max(MIN_TTL, Math.floor(raw))) : def
}

export interface ShareInfo {
  wifiSsid: string | null
  wifiPassword: string | null
  houseRules: string | null
  binDay: string | null
}

export async function householdShareInfo(env: Env, householdId: string): Promise<ShareInfo> {
  const row = await env.DB.prepare(
    'SELECT wifi_ssid, wifi_password, house_rules, bin_day FROM households WHERE id = ?',
  )
    .bind(householdId)
    .first<{ wifi_ssid: string | null; wifi_password: string | null; house_rules: string | null; bin_day: string | null }>()
  return {
    wifiSsid: row?.wifi_ssid ?? null,
    wifiPassword: row?.wifi_password ?? null,
    houseRules: row?.house_rules ?? null,
    binDay: row?.bin_day ?? null,
  }
}

// Trim + cap a free-text share field; empty becomes NULL (clears the column, hides
// the field). Caps are generous but bounded so a paste can't bloat the row.
export function cleanShareField(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim().slice(0, max)
  return t === '' ? null : t
}
