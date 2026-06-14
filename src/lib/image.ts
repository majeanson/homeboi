// Resize + compress an image File to a small JPEG Blob in the browser BEFORE
// upload, so stored images stay tiny — a phone photo is often several MB; a
// board photo at 1600px is ~100–300 KB, an avatar at 256px a few KB. This is
// what keeps R2 usage in the free tier (the brief's "never pay"). Falls back to
// the original file if the canvas path isn't available, so upload never blocks.

export const AVATAR_MAX = 256 // px — a face on the pick screen / member list
export const PHOTO_MAX = 1600 // px — a family photo on the wall frame

// URL for a stored image, by its R2 key (served by functions/api/img/[key]).
export const imgUrl = (key: string): string => `/api/img/${key}`

export async function resizeImage(file: File, maxDim: number, quality = 0.82): Promise<Blob> {
  // Decode to drawable pixels, scale, and re-encode as JPEG. We try TWO decoders:
  // createImageBitmap (fast, honours EXIF) and an <img> element (slower, but
  // Safari decodes HEIC here even when createImageBitmap can't). This matters on
  // iPhone: library/camera shots are HEIC, and createImageBitmap on iOS often
  // throws or is missing — without the <img> fallback we'd ship raw HEIC bytes
  // that the vision model / R2 viewer can't read ("photo illisible").
  const src = await decodeImage(file)
  if (!src) return file // no decoder could read it — send original, never block
  const { width, height, draw, done } = src
  try {
    const scale = Math.min(1, maxDim / Math.max(width, height))
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    draw(ctx, w, h)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    // Guard against iOS's blank-canvas / null-toBlob quirks: if we somehow got
    // nothing, fall back to the original rather than an empty blob.
    return blob && blob.size > 0 ? blob : file
  } finally {
    done()
  }
}

type DecodedImage = {
  width: number
  height: number
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
  done: () => void
}

// Try createImageBitmap first (fast, applies EXIF rotation). If it throws or is
// unavailable (older/iOS Safari, HEIC), fall back to an <img> + object URL — which
// Safari CAN decode for HEIC. Returns null only if both decoders fail.
async function decodeImage(file: File): Promise<DecodedImage | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      // `imageOrientation: 'from-image'` honours phone EXIF rotation so portraits
      // don't land sideways on the wall.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        done: () => bitmap.close?.(),
      }
    } catch {
      /* fall through to the <img> decoder */
    }
  }
  try {
    const url = URL.createObjectURL(file)
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('img decode failed'))
      img.src = url
    })
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      done: () => URL.revokeObjectURL(url),
    }
  } catch {
    return null
  }
}
