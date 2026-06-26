import { deleteR2Blob } from './r2'
import { newId, nowSec } from './ids'

// staged_media — the ONE quarantine table for a guest submission's uploaded blobs
// (migration 0091). « La boîte aux lettres » (postbox) and the intake forms each had a
// byte-for-byte identical `*_media` table + write + 7-day-orphan-sweep + resolve-delete;
// they're unified here behind a `submission_kind` discriminator. A guest can't write the
// real entity (a not-yet-created contact, a board note), so the bytes land in R2 and the
// key is recorded 'staged'; the submission payload carries the key, and the operator's
// review either MATERIALIZES it onto the real entity (keep the blob, drop the staging
// row) or DISMISSES it (free the blob + the row). Anything never resolved is swept after
// a week. The submission tables stay separate (their payloads genuinely differ) — only
// this media-staging layer is shared. No FK to the submission tables (a guest's blob must
// never cascade): the sweep reconciles by age + an explicit referenced-key set instead.

export type SubmissionKind = 'intake' | 'postbox'
const STALE_AFTER = 7 * 86400 // a staged blob no submission claims is swept after a week

// Record one uploaded blob as 'staged' for a submission kind (the second/last write a
// guest link may make). Mirrors the old intake_media / postbox_media INSERT exactly.
export async function insertStagedMedia(
  db: D1Database,
  householdId: string,
  guestId: string,
  kind: SubmissionKind,
  mediaKey: string,
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO staged_media (id, household_id, guest_id, submission_kind, media_key, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(newId(), householdId, guestId, kind, mediaKey, 'staged', nowSec())
    .run()
}

// Drop the staging rows for the given keys once a submission is resolved — the blobs are
// now either owned by a real entity (merged/accepted) or already freed (dismissed), so
// they must no longer look like orphans to the sweep. (Freeing the R2 bytes on dismiss
// stays in the handler — it's conditional on the review outcome, not on the staging row.)
export async function deleteStagedMediaByKeys(
  db: D1Database,
  householdId: string,
  kind: SubmissionKind,
  keys: string[],
): Promise<void> {
  for (const k of keys) {
    await db
      .prepare('DELETE FROM staged_media WHERE household_id = ? AND submission_kind = ? AND media_key = ?')
      .bind(householdId, kind, k)
      .run()
  }
}

// The 7-day orphan sweep — best-effort, never blocks the operator's review read. Frees
// staged blobs older than a week that NO still-pending submission references; the caller
// passes the referenced-key set, since building it means reading the kind's own
// submission table (the one part that isn't shared).
export async function sweepAbandonedStagedMedia(
  db: D1Database,
  photos: R2Bucket | undefined,
  householdId: string,
  kind: SubmissionKind,
  referenced: Set<string>,
): Promise<void> {
  const cutoff = nowSec() - STALE_AFTER
  const stale = await db
    .prepare(
      "SELECT id, media_key FROM staged_media WHERE household_id = ? AND submission_kind = ? AND status = 'staged' AND created_at < ?",
    )
    .bind(householdId, kind, cutoff)
    .all<{ id: string; media_key: string }>()
  for (const m of stale.results) {
    if (referenced.has(m.media_key)) continue // a still-pending submission needs it
    await deleteR2Blob(photos, m.media_key)
    await db.prepare('DELETE FROM staged_media WHERE id = ? AND household_id = ?').bind(m.id, householdId).run()
  }
}
