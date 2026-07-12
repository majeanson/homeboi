// « Enregistrer sur l'appareil » — hand an image the app is holding back to the
// PHONE's own photo library.
//
// The gap this closes: a picture snapped INSIDE Babillard (`<input capture>`) never
// lands in iOS/Android Photos. The bytes go straight to R2 and the shot is gone from
// your camera roll — so "I take a quick pic and put it on the fridge" quietly costs
// you the photo. Two paths, in order:
//
//   1. Web Share with a file — iOS/Android surface « Enregistrer l'image » / "Save to
//      Photos" in the share sheet. This is the only way a web app reaches the camera
//      roll, and it MUST be called inside the user's tap (a gesture-gated API).
//   2. A plain download — desktop and any browser that won't share files.
//
// A cancelled share sheet is a decision, not a failure: it resolves 'shared' rather
// than silently falling through to a download the user didn't ask for.

export type SaveOutcome = 'shared' | 'downloaded'

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** `babillard-1720713600000.jpg` — stable, sortable, no user data in the name. */
export function photoFilename(type: string, stamp: number): string {
  return `babillard-${stamp}.${EXT[type] ?? 'jpg'}`
}

/** Can this browser put a real file into the OS share sheet (→ "Save image")? */
export function canShareFile(file: File): boolean {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [file] })
  } catch {
    // Some engines throw from canShare on an unsupported payload rather than
    // returning false — treat a throw as "no".
    return false
  }
}

export async function saveToDevice(blob: Blob, filename = photoFilename(blob.type, Date.now())): Promise<SaveOutcome> {
  const file = new File([blob], filename, { type: blob.type || 'image/jpeg' })
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (e) {
      // The user dismissed the sheet → done. Anything else (a browser that lied
      // about canShare, a transient failure) falls through to the download.
      if ((e as Error)?.name === 'AbortError') return 'shared'
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke late: Safari reads the blob url asynchronously after the click.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
