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
  try {
    // `imageOrientation: 'from-image'` honours phone EXIF rotation so portraits
    // don't land sideways on the wall.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    return blob ?? file
  } catch {
    return file
  }
}
