// « Partager » — the generic store over the `shares` table (migration 0102). One
// place that knows how a snapshot row is inserted, listed (with the expiry sweep),
// read by id, and revoked — reused by the generic /api/share endpoint, the public
// /api/share-public reader, AND the legacy /api/family-share adapter (which is now a
// thin wrapper over these so its wire shape stays byte-identical for the cercle UI).
//
// Media inside a payload is share-owned (see shareSnapshots.snapshotBlobKeys); this
// module frees those blobs on revoke/expire. Env-typed (touches D1 + R2), so it lives
// beside the handlers; the PURE per-kind shaping is in shareSnapshots.ts.

import type { Env } from './env'
import { newId, nowSec } from './ids'
import { deleteR2Blob } from './r2'
import { snapshotBlobKeys, type ShareKind } from './shareSnapshots'

export const MAX_SHARES = 100 // bound how many live shares one household can pile up (all kinds)
export const LABEL_CAP = 80

export interface ShareLedgerRow {
  id: string
  kind: ShareKind
  label: string
  createdAt: number
  expiresAt: number | null
}

export interface LiveShare {
  kind: ShareKind
  label: string
  payload: string // raw JSON (caller parses per kind)
  sourceName: string | null
  expiresAt: number | null
}

// Free every share-owned R2 blob a stored snapshot holds (best-effort; no-ops when R2
// is unset). Tolerates a malformed payload. Called on revoke + the expiry sweep.
export async function freeShareBlobs(env: Env, kind: ShareKind, payloadJson: string): Promise<void> {
  let payload: unknown
  try {
    payload = JSON.parse(payloadJson)
  } catch {
    return
  }
  for (const k of snapshotBlobKeys(kind, payload)) await deleteR2Blob(env.PHOTOS, k)
}

// How many live (un-revoked, un-expired-at-write-time) shares this household holds —
// the create-time ceiling. Cheap COUNT; the sweep in listLiveShares does the real GC.
export async function countLiveShares(env: Env, hh: string): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM shares WHERE source_household_id = ? AND revoked_at IS NULL',
  )
    .bind(hh)
    .first<{ n: number }>()
  return row?.n ?? 0
}

// Insert a share row (caller has already built + copied the payload). Returns the id +
// resolved expiry. The label is trimmed/capped here so every create path agrees.
export async function insertShare(
  env: Env,
  hh: string,
  kind: ShareKind,
  label: string,
  payloadJson: string,
  ttlSeconds: number,
): Promise<{ id: string; expiresAt: number }> {
  const id = newId()
  const ts = nowSec()
  const expiresAt = ts + ttlSeconds
  const clean = typeof label === 'string' ? label.trim().slice(0, LABEL_CAP) : ''
  await env.DB.prepare(
    'INSERT INTO shares (id, source_household_id, kind, label, payload, expires_at, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)',
  )
    .bind(id, hh, kind, clean, payloadJson, expiresAt, ts)
    .run()
  return { id, expiresAt }
}

// The sender's live shares, newest first, sweeping any that expired since (frees their
// blobs + marks them revoked so R2 can't accumulate). `kinds` optionally filters (the
// legacy family adapter passes ['family']; the generic ledger passes nothing = all).
export async function listLiveShares(env: Env, hh: string, kinds?: ShareKind[]): Promise<ShareLedgerRow[]> {
  const now = nowSec()
  const rows = await env.DB.prepare(
    'SELECT id, kind, label, payload, expires_at, created_at FROM shares WHERE source_household_id = ? AND revoked_at IS NULL ORDER BY created_at DESC',
  )
    .bind(hh)
    .all<{ id: string; kind: string; label: string; payload: string; expires_at: number | null; created_at: number }>()

  const out: ShareLedgerRow[] = []
  for (const r of rows.results) {
    const kind = r.kind as ShareKind
    if (kinds && !kinds.includes(kind)) continue
    if (r.expires_at != null && r.expires_at < now) {
      await freeShareBlobs(env, kind, r.payload)
      await env.DB.prepare('UPDATE shares SET revoked_at = ? WHERE id = ? AND source_household_id = ?')
        .bind(now, r.id, hh)
        .run()
      continue
    }
    out.push({ id: r.id, kind, label: r.label, createdAt: r.created_at, expiresAt: r.expires_at })
  }
  return out
}

// Read a share by id IF it's still live (not revoked, not expired). Returns null for a
// dead/unknown id — the caller answers 404 « Ce partage n'existe plus. ». The id IS the
// capability, so this needs no household scope (used by both the authed import read and
// the public reader).
export async function readLiveShare(env: Env, id: string): Promise<LiveShare | null> {
  const now = nowSec()
  const row = await env.DB.prepare(
    `SELECT s.kind, s.label, s.payload, s.expires_at, s.revoked_at, h.name AS source_name
       FROM shares s JOIN households h ON h.id = s.source_household_id
      WHERE s.id = ?`,
  )
    .bind(id)
    .first<{ kind: string; label: string; payload: string; expires_at: number | null; revoked_at: number | null; source_name: string | null }>()
  if (!row || row.revoked_at != null || (row.expires_at != null && row.expires_at < now)) return null
  return {
    kind: row.kind as ShareKind,
    label: row.label,
    payload: row.payload,
    sourceName: row.source_name ?? null,
    expiresAt: row.expires_at,
  }
}

// Revoke a share early (frees its share-owned blobs). Scoped to the owner household so
// one household can't revoke another's. Returns false when the id isn't theirs.
export async function revokeShareById(env: Env, hh: string, id: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT kind, payload FROM shares WHERE id = ? AND source_household_id = ?')
    .bind(id, hh)
    .first<{ kind: string; payload: string }>()
  if (!row) return false
  await freeShareBlobs(env, row.kind as ShareKind, row.payload)
  await env.DB.prepare('UPDATE shares SET revoked_at = ? WHERE id = ? AND source_household_id = ?')
    .bind(nowSec(), id, hh)
    .run()
  return true
}
