import { useState } from 'react'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useVoiceInput } from '../../lib/useVoiceInput'
import { EditField } from '../EditField'
import { MemoControls } from '../MemoControls'
import { useVoyageApi, type TripCategory } from './voyage'

// The « Voyage » capture composer — the SAME "type / speak / draw / photo" input the
// fridge + family notes use, bound to a fixed slot: a category, an optional itinerary
// date, and an optional member ("kids/parents stuff"). The text path writes through
// useWrite (offline-queued); the media path reuses MemoControls verbatim (audio memo /
// drawing / photo), pointed at /api/trip-notes via endpoint + extraBody. Exactly the
// reuse Marc asked for: one Notes composer for everything a trip holds.
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
  const affectedKey = voyageApi.notesKey(tripId)
  const extraBody = { tripId, category, date: date ?? null, member_id: memberId ?? null }
  const voice = useVoiceInput((v) => setText((prev) => (prev ? prev + ' ' + v : v)))

  async function submit(v: string) {
    const value = v.trim()
    if (!value) return
    try {
      await write(voyageApi.notesEndpoint, { method: 'POST', body: { ...extraBody, text: value }, affectedKeys: [affectedKey] })
      setText('')
    } catch {
      /* keep the typed text so it can be retried (offline → it queued) */
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
      />
      {/* Voice memo / drawing / document — the shared fridge-note controls, writing a
          media trip_note instead of a board note (endpoint + extraBody override).
          Blobs upload to the TRIP media endpoint (trip-doc-media / shared-trip-media),
          and docUpload swaps the draw-over-photo button for a direct image/PDF attach:
          category 'document' overrides the slot's category so the file ALSO shows
          under the Documents tab (offline-warmable), while date/member scope stick. */}
      <MemoControls
        endpoint={voyageApi.notesEndpoint}
        mediaEndpoint={voyageApi.mediaEndpoint}
        affectedKey={affectedKey}
        extraBody={extraBody}
        docUpload={{ label: t.voyage.addDocument, body: { category: 'document' } }}
        onDone={() => {}}
      />
    </div>
  )
}
