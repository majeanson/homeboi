// « Partager une famille » — the family-specific snapshot materialize, extracted from
// the old functions/api/family-share.ts so BOTH the legacy /api/family-share route and
// the generic /api/share {kind:'family'} path build the identical payload.
//
// A family isn't a stored row — it's a subgraph derived at read time (src/lib/cercle.ts)
// — so the sender's CLIENT materializes an IntakeSubmission-shaped snapshot and POSTs it.
// Unlike the content kinds (recipe/event/routine), which the server snapshots from a
// household-scoped DB row, here the payload is client-supplied, so we KEEP the
// anti-exfiltration guard: only photo keys the sender actually owns are copied into the
// share-owned `fs_` blobs; any other key is dropped. Media freeing on revoke/expire is
// handled generically by shareStore (snapshotBlobKeys → intakeMediaKeys).

import type { Env } from './env'
import { copyR2Blob } from './r2'
import { sanitizeIntake, type IntakeSubmission, type SanitizeCaps } from './intake'

// A shared family is built by a TRUSTED operator (not an anonymous intake guest), so it
// gets far higher count ceilings than the intake form — enough for any real extended
// family — while the per-field length caps still bound total size. 60 people = self + 59.
const SHARE_CAPS: SanitizeCaps = { maxHousehold: 59, maxPets: 40, maxLinks: 300 }

// The photo keys this household actually OWNS (its contacts / member faces / pets /
// gallery). A crafted POST could otherwise name an arbitrary R2 key to smuggle it into
// a share; we only copy keys the sender owns and drop the rest.
async function ownedPhotoKeys(db: D1Database, hh: string): Promise<Set<string>> {
  const rows = await db
    .prepare(
      `SELECT media_key AS k FROM contacts WHERE household_id = ? AND media_key IS NOT NULL
       UNION SELECT avatar_ref FROM members WHERE household_id = ? AND avatar_kind = 'photo' AND avatar_ref != ''
       UNION SELECT media_key FROM pets WHERE household_id = ? AND media_key IS NOT NULL
       UNION SELECT media_key FROM contact_photos WHERE household_id = ? AND media_key IS NOT NULL`,
    )
    .bind(hh, hh, hh, hh)
    .all<{ k: string | null }>()
  return new Set(rows.results.map((r) => r.k).filter((k): k is string => !!k))
}

// Copy each OWNED photo into a share-owned `fs_` blob so the snapshot is self-contained;
// drop any key the sender doesn't own (anti-exfiltration). Returns the rewritten payload.
async function snapshotPhotos(
  photos: R2Bucket | undefined,
  s: IntakeSubmission,
  owned: Set<string>,
): Promise<IntakeSubmission> {
  const copy = async <T extends { photoKey: string | null }>(p: T): Promise<T> => {
    if (!p.photoKey) return p
    if (!owned.has(p.photoKey)) return { ...p, photoKey: null }
    return { ...p, photoKey: await copyR2Blob(photos, p.photoKey, 'fs') }
  }
  const self = await copy(s.self)
  const household = await Promise.all(s.household.map(copy))
  const pets = await Promise.all(s.pets.map(copy))
  return { self, household, links: s.links, pets }
}

export interface FamilySnapshot {
  payloadJson: string
  sharedPeople: number
  totalPeople: number
}

// Materialize a client-supplied family payload into a stored snapshot (sanitize → copy
// owned photos → JSON). Returns null when the payload is unusable (no named self), so the
// caller answers 400 « Famille vide ». Does NOT touch the shares table — the caller
// inserts (via shareStore.insertShare) so the count-cap + row shape stay in one place.
export async function materializeFamilyShare(env: Env, hh: string, rawPayload: unknown): Promise<FamilySnapshot | null> {
  // No field-scope: a share carries the whole family (all sections). sanitizeIntake
  // still bounds it (≤60 people, ≤300 links) and rejects a payload with no named self.
  const submission = sanitizeIntake(rawPayload, undefined, SHARE_CAPS)
  if (!submission) return null

  // How many people the sender sent vs how many survived the cap — so the share sheet
  // can say "shared N of M" if a huge family was clipped (rather than dropping silently).
  const rawHousehold = Array.isArray((rawPayload as { household?: unknown })?.household)
    ? (rawPayload as { household: unknown[] }).household.length
    : 0
  const totalPeople = 1 + rawHousehold
  const sharedPeople = 1 + submission.household.length

  const owned = await ownedPhotoKeys(env.DB, hh)
  const snapshot = await snapshotPhotos(env.PHOTOS, submission, owned)
  return { payloadJson: JSON.stringify(snapshot), sharedPeople, totalPeople }
}
