import { useState } from 'react'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useVoiceInput } from '../../lib/useVoiceInput'
import { EditField } from '../EditField'
import { useMemoAttach } from '../MemoAttach'
import { DocUploadButton } from '../DocUploadButton'
import { useVoyageApi, type TripCategory } from './voyage'

// The « Voyage » capture composer — the SAME "write it, clip something to it" field the
// fridge + family notes use, bound to a fixed slot: a category, an optional itinerary
// date, and an optional member ("kids/parents stuff"). ONE write through useWrite
// (offline-queued) carries the text AND any attachment, since /api/trip-notes takes both
// on one row.
//
// « Joindre un document » is deliberately NOT behind that 📎: it takes SEVERAL files at
// once and files each as its OWN note (a boarding pass is a file you have, not a doodle
// you make), so it rides DocUploadButton in the secondary chip row. Its `category:
// 'document'` overrides the slot's so the file ALSO shows under the Documents tab, while
// the date/member scope stick. That chip already accepts images, so the memo's own photo
// door is switched off here rather than offering the same thing twice.
export function TripNoteAdd({
  tripId,
  category,
  date,
  memberId,
  placeholder,
}: {
  tripId: string
  category: TripCategory
  date?: number | null
  memberId?: string | null
  placeholder?: string
}) {
  const t = useT()
  const write = useWrite()
  const voyageApi = useVoyageApi()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const affectedKey = voyageApi.notesKey(tripId)
  const extraBody = { tripId, category, date: date ?? null, member_id: memberId ?? null }
  const voice = useVoiceInput((v) => setText((prev) => (prev ? prev + ' ' + v : v)))
  // Blobs upload to the TRIP media endpoint (trip-doc-media / shared-trip-media).
  const memo = useMemoAttach({ mediaEndpoint: voyageApi.mediaEndpoint, drawDraftId: 'trip', photo: false })

  async function submit(v: string) {
    const value = v.trim()
    if ((!value && !memo.draft) || busy) return
    setBusy(true)
    try {
      await write(voyageApi.notesEndpoint, {
        method: 'POST',
        body: { ...extraBody, text: value, ...memo.body },
        affectedKeys: [affectedKey],
      })
      setText('')
      memo.reset()
    } catch {
      /* keep the typed text so it can be retried (offline → it queued) */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="trip-note-add">
      <EditField
        value={text}
        onChange={setText}
        onSubmit={submit}
        submitLabel={t.common.add}
        submitLeadingIcon="plus-bold"
        submitVariant="primary"
        voice={voice}
        placeholder={placeholder ?? t.voyage.addInfo}
        ariaLabel={placeholder ?? t.voyage.addInfo}
        busy={busy || memo.busy}
        allowEmpty={!!memo.draft}
        boxActions={memo.attachButton}
        secondaryActions={
          <DocUploadButton
            label={t.voyage.addDocument}
            endpoint={voyageApi.notesEndpoint}
            mediaEndpoint={voyageApi.mediaEndpoint}
            affectedKey={affectedKey}
            extraBody={{ ...extraBody, category: 'document' }}
          />
        }
      >
        {memo.panel}
      </EditField>
    </div>
  )
}
