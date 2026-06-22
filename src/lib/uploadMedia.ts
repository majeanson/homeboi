import { useCallback, useState } from 'react'
import { api, isStatus } from './api'
import { resizeImage, PHOTO_MAX } from './image'

// The ONE client media-upload path. Every photo/audio/drawing control used to
// hand-roll the same flow — resize the image small, POST the blob to its
// /api/<endpoint>, read back the stored R2 `{key}`, and special-case a 503 (R2
// unbound → hide the whole feature). uploadMedia folds that into one place;
// useMediaUpload wraps it with busy/error state for the simple single-shot case.
//
// These are NOT offline-queueable (a blob can't ride the outbox), so they go
// through `api()` directly like the originals — callers disable the control when
// offline (`useOnline`). Mirrors the writeWith/useWrite split in lib/write.ts.

/** The upload endpoint 503'd — R2 is unbound, so the whole media feature should
 *  hide. Callers catch this to flip their "…Off" switch (audio/photo/step). */
export class MediaUnavailableError extends Error {
  constructor() {
    super('media storage unavailable')
    this.name = 'MediaUnavailableError'
  }
}

/** A resized blob is still over the server cap — a format no decoder could shrink.
 *  Callers skip it (show a soft note) rather than hard-rejecting. */
class MediaTooLargeError extends Error {
  constructor() {
    super('media too large')
    this.name = 'MediaTooLargeError'
  }
}

export interface UploadMediaOpts {
  /** Resize an image before upload: `true` → PHOTO_MAX, a number → that max dim,
   *  `false` → upload the blob as-is (audio clips, already-small blobs). Default true. */
  resize?: boolean | number
  /** Throw MediaTooLargeError if the (resized) blob exceeds this many bytes. */
  maxBytes?: number
  /** Filename when promoting a raw Blob to a File before resize (e.g. a drawing PNG). */
  filename?: string
}

// POST one media blob to /api/<endpoint> and return its stored R2 key. Throws
// MediaUnavailableError on a 503 (R2 unbound) and MediaTooLargeError when an
// un-shrinkable blob is over `maxBytes`; any other failure rethrows.
export async function uploadMedia(endpoint: string, input: File | Blob, opts: UploadMediaOpts = {}): Promise<string> {
  const { resize = true, maxBytes, filename } = opts
  let blob: Blob = input
  if (resize !== false) {
    const file =
      input instanceof File ? input : new File([input], filename ?? 'upload', { type: input.type || 'image/jpeg' })
    blob = await resizeImage(file, resize === true ? PHOTO_MAX : resize)
  }
  if (maxBytes != null && blob.size > maxBytes) throw new MediaTooLargeError()
  try {
    const { key } = await api<{ key: string }>(endpoint, { method: 'POST', body: blob })
    return key
  } catch (e) {
    if (isStatus(e, 503)) throw new MediaUnavailableError()
    throw e
  }
}

export interface UseMediaUploadOpts extends UploadMediaOpts {
  endpoint: string
  /** Fired when the endpoint 503s (R2 unbound) — hide the whole control. */
  onUnavailable?: () => void
}

// Single-shot wrapper for a control whose busy/error map 1:1 to one upload (e.g.
// ContactPhotos). Tracks `busy`, sets `error` on a soft failure, and routes a 503
// to `onUnavailable`. `upload` resolves to the R2 key, or null on ANY failure — so
// the caller writes `const key = await upload(file); if (key) …`. For controls with
// their own progress/per-item state (batch uploads, per-step indices), call the
// pure `uploadMedia` directly instead.
export function useMediaUpload(opts: UseMediaUploadOpts) {
  const { endpoint, onUnavailable, resize = true, maxBytes, filename } = opts
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const upload = useCallback(
    async (input: File | Blob): Promise<string | null> => {
      setBusy(true)
      setError(false)
      try {
        return await uploadMedia(endpoint, input, { resize, maxBytes, filename })
      } catch (e) {
        if (e instanceof MediaUnavailableError) onUnavailable?.()
        else setError(true)
        return null
      } finally {
        setBusy(false)
      }
    },
    [endpoint, onUnavailable, resize, maxBytes, filename],
  )
  return { upload, busy, error }
}
