import { useRef, useState } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { api, ApiError, isStatus } from '../lib/api'
import { uploadMedia, MediaUnavailableError } from '../lib/uploadMedia'
import { Icon } from './Icon'

// « Joindre un document » — the ONE control that is deliberately NOT a memo
// attachment (useMemoAttach). A trip's boarding passes are FILES you have, not a
// doodle you make: you pick several at once, each becomes its OWN note labelled
// with its filename, and they post immediately rather than riding a text field's
// submit. That plurality is why it can't share the single-draft attach model, and
// why it lived as MemoControls' `docUpload` branch before.
//
// A PDF uploads as-is (no image resize); an image is resized like any photo.
// R2 unbound → the chip hides, exactly like the attach 📎.
export function DocUploadButton({
  label,
  endpoint,
  mediaEndpoint,
  affectedKey,
  extraBody,
  onDone,
}: {
  label: string
  /** Where each note POSTs (e.g. `trip-notes`). */
  endpoint: string
  /** Where each blob uploads (e.g. `trip-doc-media`). */
  mediaEndpoint: string
  /** Invalidated once, after the whole batch. */
  affectedKey: QueryKey
  /** Merged into every note body (tripId, category, date, member scope…). */
  extraBody?: Record<string, unknown>
  onDone?: () => void
}) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [hidden, setHidden] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    // Snapshot the FileList BEFORE resetting the input — clearing `value` empties
    // the live list, so iterating it afterwards would see zero files.
    const files = Array.from(e.currentTarget.files ?? [])
    e.currentTarget.value = ''
    if (files.length === 0) return
    setBusy(true)
    try {
      for (const file of files) {
        try {
          const key = await uploadMedia(mediaEndpoint, file, { resize: file.type !== 'application/pdf' })
          await api(endpoint, {
            method: 'POST',
            body: { media_kind: 'image', media_key: key, label: file.name, text: '', ...extraBody },
          })
        } catch (err) {
          if (err instanceof MediaUnavailableError || isStatus(err, 503)) {
            setHidden(true)
            break
          }
          if (!(err instanceof ApiError)) throw err
          /* skip this file, keep going */
        }
      }
      qc.invalidateQueries({ queryKey: affectedKey })
      onDone?.()
    } finally {
      setBusy(false)
    }
  }

  if (hidden) return null
  return (
    <>
      <button type="button" className="btn btn--sm" onClick={() => ref.current?.click()} disabled={busy}>
        <Icon name="file-text-bold" size={16} /> {label}
      </button>
      <input ref={ref} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => void onFiles(e)} />
    </>
  )
}
