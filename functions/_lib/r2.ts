// Shared R2 helpers. `deleteR2Blob` is the one "free the blob, best-effort" path
// every delete/cleanup handler needs: a cleared note's audio, a removed gallery
// photo, a pruned board photo, a deleted recipe's image. R2 may be UNSET (optional
// binding — see _lib/env.ts) and the delete may fail; neither must block the DB
// write, so this no-ops when the bucket/key is missing and swallows delete errors.
export async function deleteR2Blob(bucket: R2Bucket | undefined, key: string | null | undefined): Promise<void> {
  if (!bucket || !key) return
  await bucket.delete(key).catch(() => {
    /* leave the orphan blob rather than fail the DB write that frees it */
  })
}
