import { describe, it, expect, vi } from 'vitest'
import { deleteR2Blob } from './r2'

// A minimal stand-in for the R2Bucket binding — only .delete() is exercised.
const fakeBucket = (impl: (key: string) => Promise<void>) => ({ delete: vi.fn(impl) }) as unknown as R2Bucket

describe('deleteR2Blob', () => {
  it('no-ops when the bucket is unset (R2 not bound)', async () => {
    await expect(deleteR2Blob(undefined, 'nm_abc')).resolves.toBeUndefined()
  })

  it('no-ops when there is no key', async () => {
    const bucket = fakeBucket(async () => {})
    await deleteR2Blob(bucket, null)
    await deleteR2Blob(bucket, undefined)
    await deleteR2Blob(bucket, '')
    expect((bucket.delete as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })

  it('deletes the blob when both are present', async () => {
    const bucket = fakeBucket(async () => {})
    await deleteR2Blob(bucket, 'nm_abc')
    expect(bucket.delete).toHaveBeenCalledWith('nm_abc')
  })

  it('swallows a failed delete (best-effort — never blocks the DB write)', async () => {
    const bucket = fakeBucket(async () => {
      throw new Error('R2 down')
    })
    await expect(deleteR2Blob(bucket, 'nm_abc')).resolves.toBeUndefined()
  })
})
