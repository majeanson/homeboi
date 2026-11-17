import { describe, it, expect, vi } from 'vitest'
import { deleteR2Blob, mediaHeaders, safeMediaType } from './r2'

// Minimal stand-ins: the bucket (only .delete()) and the ownership ledger, whose
// DELETE reports `changes` — 1 when the row was this household's, 0 otherwise.
const fakeBucket = (impl: (key: string) => Promise<void>) => ({ delete: vi.fn(impl) }) as unknown as R2Bucket

const ledger = (owned: boolean) =>
  ({ prepare: () => ({ bind: () => ({ run: async () => ({ meta: { changes: owned ? 1 : 0 } }) }) }) }) as unknown as D1Database

describe('deleteR2Blob', () => {
  it('no-ops when the bucket is unset (R2 not bound)', async () => {
    await expect(deleteR2Blob({ DB: ledger(true) }, 'nm_abc', 'hh1')).resolves.toBeUndefined()
  })

  it('no-ops when there is no key, or no household to own it', async () => {
    const bucket = fakeBucket(async () => {})
    for (const key of [null, undefined, '']) await deleteR2Blob({ DB: ledger(true), PHOTOS: bucket }, key, 'hh1')
    await deleteR2Blob({ DB: ledger(true), PHOTOS: bucket }, 'nm_abc', undefined) // outside a request
    expect(bucket.delete as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
  })

  it('frees a blob this household owns', async () => {
    const bucket = fakeBucket(async () => {})
    await deleteR2Blob({ DB: ledger(true), PHOTOS: bucket }, 'nm_abc', 'hh1')
    expect(bucket.delete).toHaveBeenCalledWith('nm_abc')
  })

  // P0 #4 (review 2026-11-17): a key it only SAW — another family's photo, a backup.
  it('leaves a blob it does not own where it is', async () => {
    const bucket = fakeBucket(async () => {})
    await deleteR2Blob({ DB: ledger(false), PHOTOS: bucket }, 'backup/hh2/2026-11-16.json', 'hh1')
    expect(bucket.delete as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
  })

  it('swallows a failed delete (best-effort — never blocks the DB write)', async () => {
    const bucket = fakeBucket(async () => {
      throw new Error('R2 down')
    })
    await expect(deleteR2Blob({ DB: ledger(true), PHOTOS: bucket }, 'nm_abc', 'hh1')).resolves.toBeUndefined()
  })
})

// P0 #1 (review 2026-11-17): a same-origin SVG/HTML blob was stored XSS.
describe('safeMediaType / mediaHeaders', () => {
  it('keeps raster, audio, PDF and the drawing scene; normalises parameters and case', () => {
    expect(safeMediaType('image/JPEG')).toBe('image/jpeg')
    expect(safeMediaType('audio/webm;codecs=opus')).toBe('audio/webm')
    expect(safeMediaType('application/pdf')).toBe('application/pdf')
    expect(safeMediaType('application/json; charset=utf-8')).toBe('application/json')
  })

  it('refuses anything that can carry script when opened as a page', () => {
    for (const t of ['image/svg+xml', 'text/html', 'application/xhtml+xml', 'text/xml', 'application/javascript', 'image/svg', '', null, undefined])
      expect(safeMediaType(t)).toBeNull()
  })

  it('serves an unsafe stored type as a sandboxed, unsniffed download', () => {
    const h = mediaHeaders('image/svg+xml')
    expect(h.get('content-type')).toBe('application/octet-stream')
    expect(h.get('content-disposition')).toBe('attachment')
    expect(h.get('x-content-type-options')).toBe('nosniff')
    expect(h.get('content-security-policy')).toMatch(/^sandbox;/)
  })

  it('serves an image inline, sandboxed; a PDF inline without the sandbox Chrome would refuse', () => {
    const img = mediaHeaders('image/png')
    expect(img.get('content-disposition')).toBeNull()
    expect(img.get('content-security-policy')).toMatch(/sandbox/)
    const pdf = mediaHeaders('application/pdf')
    expect(pdf.get('content-disposition')).toBeNull()
    expect(pdf.get('content-security-policy')).toBeNull()
    expect(pdf.get('x-content-type-options')).toBe('nosniff')
  })
})
