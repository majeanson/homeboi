import { badRequest } from './json'
import { newId } from './ids'

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

// The one "validate the body + store it" path every media UPLOAD handler shared
// (note-media, routine-audio, recipe-image, recipe-step-image, photos, cercle
// photo, members/avatar, routine-card-photo): read the raw request body, reject an
// empty/oversize blob or the wrong content-type, then `put` it under an opaque
// `<prefix>_<id>` key with its contentType. Pairs with `deleteR2Blob`.
//
// The caller still owns the bits that genuinely vary per endpoint: the `env.PHOTOS`
// presence guard (each has its own 503 copy + degrade story) is checked BEFORE
// calling this (so `bucket` is definite), and the `{ key }`/`{ key, kind }` return
// shape stays at the call site. Everything else — prefix, size cap, the
// accept-predicate and its two error messages — comes in as options, with sane
// image defaults so an image-only handler is a one-liner.
//
// Returns the new `key` (+ the resolved `contentType`), or `{ error }` holding the
// ready-to-return 400 Response so the handler can `if ('error' in r) return r.error`.
export interface UploadR2Opts {
  /** Key prefix/folder convention, e.g. `rc` (recipe), `av` (avatar), `nm` (note). */
  prefix: string
  /** Reject `byteLength === 0 || > maxBytes`. */
  maxBytes: number
  /** Which content-types to accept. Default: `image/*` only. */
  accept?: (contentType: string) => boolean
  /** 400 message when `accept` rejects the type. Default: "Image requise." */
  typeError?: string
  /** 400 message when the body is empty or too large. Default: "Image vide ou trop grande." */
  sizeError?: string
}
export async function uploadR2Media(
  bucket: R2Bucket,
  request: Request,
  opts: UploadR2Opts,
): Promise<{ key: string; contentType: string } | { error: Response }> {
  const accept = opts.accept ?? ((t) => t.startsWith('image/'))
  const contentType = request.headers.get('content-type') ?? ''
  if (!accept(contentType)) return { error: badRequest(opts.typeError ?? 'Image requise.') }
  const buf = await request.arrayBuffer()
  if (buf.byteLength === 0 || buf.byteLength > opts.maxBytes)
    return { error: badRequest(opts.sizeError ?? 'Image vide ou trop grande.') }
  const key = await putR2Blob(bucket, buf, contentType, opts.prefix)
  return { key, contentType }
}

// Store bytes we ALREADY hold (not an incoming Request) under an opaque
// `<prefix>_<id>` key — e.g. a place photo the server fetched from Google's CDN for
// the « Le cercle » business import. Returns the new key.
export async function putR2Blob(bucket: R2Bucket, buf: ArrayBuffer, contentType: string, prefix: string): Promise<string> {
  const key = `${prefix}_${newId()}`
  await bucket.put(key, buf, { httpMetadata: { contentType } })
  return key
}
