import { useRef, useState } from 'react'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useOnline } from '../../lib/online'
import { imgUrl } from '../../lib/image'
import { uploadMedia, MediaUnavailableError } from '../../lib/uploadMedia'
import { warmImageCache } from '../../lib/cacheWarm'
import { TRIP_NOTES_KEY } from '../../lib/queryKeys'
import { CarnetDocs } from '../cercle/CarnetDocs'
import { EmptyState } from '../EmptyState'
import { Icon } from '../Icon'
import type { Trip, TripNote } from './voyage'

// « Voyage » → Documents — the reservations / boarding passes / passports a trip
// needs ON HAND (image or PDF). Each is a trip_note with category 'document' carrying
// an R2 key. Upload reuses uploadMedia (a PDF uploads as-is, no resize); the tiles +
// the inline PDF reader reuse CarnetDocs verbatim. "Préparer pour le voyage" warms
// the SW image cache so every document is readable OFFLINE on the road (the cache-
// first /api/img rule), the only reliable path on an iOS PWA. R2 unbound → the whole
// tab degrades to a calm note (text info still lives under Infos).
export function VoyageDocuments({ trip, notes }: { trip: Trip; notes: TripNote[] }) {
  const t = useT()
  const write = useWrite()
  const online = useOnline()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [off, setOff] = useState(false) // R2 unbound (503)
  const [warmed, setWarmed] = useState(false)
  const affectedKey = [...TRIP_NOTES_KEY, trip.id]

  const docs = notes.filter((n) => n.category === 'document' && n.media_key)
  const docKeys = docs.map((n) => n.media_key as string)
  const docLabel = (key: string) => docs.find((d) => d.media_key === key)?.label ?? undefined

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    try {
      for (const file of Array.from(files)) {
        const isPdf = file.type === 'application/pdf'
        try {
          // PDFs upload as-is (no image resize); photos resize down like any media.
          const key = await uploadMedia('trip-doc-media', file, { resize: !isPdf })
          await write('trip-notes', {
            method: 'POST',
            body: { tripId: trip.id, category: 'document', media_kind: 'image', media_key: key, label: file.name },
            affectedKeys: [affectedKey],
          })
        } catch (e) {
          if (e instanceof MediaUnavailableError) {
            setOff(true)
            break
          }
          /* skip this file, keep going */
        }
      }
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function removeDoc(key: string) {
    const n = docs.find((d) => d.media_key === key)
    if (!n) return
    await write('trip-notes', { method: 'DELETE', body: { id: n.id }, affectedKeys: [affectedKey] }).catch(() => {})
  }

  async function prepareOffline() {
    setWarmed(false)
    await warmImageCache([...docKeys, ...(trip.media_key ? [trip.media_key] : [])].map(imgUrl))
    setWarmed(true)
  }

  if (off) return <EmptyState tone="calm">{t.voyage.docsUnavailable}</EmptyState>

  return (
    <div className="voyage-docs">
      <div className="voyage-docs__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => fileRef.current?.click()}
          disabled={busy || !online}
        >
          <Icon name="image-square-bold" size={18} /> {busy ? t.voyage.uploading : t.voyage.addDocument}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          hidden
          onChange={(e) => void onFiles(e.target.files)}
        />
        {docKeys.length > 0 && (
          <button type="button" className="btn btn--ghost mono" onClick={() => void prepareOffline()} disabled={!online}>
            <Icon name="download-simple-bold" size={16} /> {warmed ? t.voyage.offlineReady : t.voyage.prepareOffline}
          </button>
        )}
      </div>
      {!online && <p className="voyage-docs__hint mono">{t.voyage.uploadOnlineOnly}</p>}

      {docs.length === 0 ? (
        <EmptyState tone="calm">{t.voyage.noDocs}</EmptyState>
      ) : (
        <CarnetDocs
          keys={docKeys}
          variant="list"
          labelFor={docLabel}
          onRemove={(k) => void removeDoc(k)}
          className="voyage-docs__strip"
        />
      )}
    </div>
  )
}
