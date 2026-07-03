import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useT, useLang } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useRecordUndo } from '../../lib/toast'
import { useConfirm } from '../../lib/confirm'
import { formatDayLong, capitalize as cap } from '../../lib/format'
import { EmptyState } from '../EmptyState'
import { MemberSwitcher, type MemberFace } from '../MemberSwitcher'
import { TripNoteAdd } from './TripNoteAdd'
import { TripNoteCard } from './TripNoteCard'
import { tripDays, useVoyageApi, type Trip, type TripNote } from './voyage'

// « Voyage » → Itinéraire — the day-by-day plan. One section per day the trip spans
// (start_at..end_at inclusive); each shows that day's entries and a composer that
// writes a dated trip_note (category 'activity'). These dated notes are what the
// calendar band's days and the day-page "Voyage — Jour N" header surface, so the
// same info is there when you open that day. When the trip has no dates yet, prompt
// to set them (the date range is what makes an itinerary).
//
// A single "Pour qui" face row scopes the entries you add this session to a member
// ("the kids' museum visit") — the same optional member scope Infos + Bagages carry;
// each day's composer inherits it. Deleting an entry is held behind the undo toast
// (a compensating re-POST), matching VoyageInfos.

export function VoyageItinerary({ trip, notes, faces }: { trip: Trip; notes: TripNote[]; faces: MemberFace[] }) {
  const t = useT()
  const { lang } = useLang()
  const write = useWrite()
  const recordUndo = useRecordUndo()
  const confirm = useConfirm()
  const voyageApi = useVoyageApi()
  const [who, setWho] = useState<string | null>(null)
  const affectedKey = voyageApi.notesKey(trip.id)
  const days = tripDays(trip.start_at, trip.end_at)
  const memberName = (id: string | null) => (id ? faces.find((f) => f.id === id)?.name ?? '' : '')

  // Deep-link from a calendar day / day-page itinerary row: `?jour=N` (1-based
  // day-of-trip) scrolls that day's section into view, so tapping "Musée, 14h" on
  // the 12th lands on day 12 rather than the top of a long multi-day itinerary.
  const [params] = useSearchParams()
  const jour = Number(params.get('jour'))
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!jour || jour < 1) return
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-jour="${jour}"]`)
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [jour, days.length])

  if (days.length === 0) {
    return (
      <EmptyState tone="calm" guide={{ card: 'voyage' }}>
        {t.voyage.setDatesForItinerary}
      </EmptyState>
    )
  }

  function save(n: TripNote, text: string) {
    void write(voyageApi.notesEndpoint, { method: 'PATCH', body: { id: n.id, text }, affectedKeys: [affectedKey] }).catch(() => {})
  }

  async function del(n: TripNote) {
    // Media-bearing note (audio/drawing/photo): the DELETE frees its R2 blob, so an
    // undo re-POST would point at a freed blob. Confirm — no undo — like Documents.
    // Text-only entries keep the forgiving undo toast.
    if (n.media_kind != null) {
      if (!(await confirm({ message: t.voyage.deleteMediaNoteConfirm, tone: 'danger', confirmLabel: t.common.delete })))
        return
      await write(voyageApi.notesEndpoint, { method: 'DELETE', body: { id: n.id }, affectedKeys: [affectedKey] }).catch(() => {})
      return
    }
    await write(voyageApi.notesEndpoint, { method: 'DELETE', body: { id: n.id }, affectedKeys: [affectedKey] }).catch(() => {})
    recordUndo({
      message: t.voyage.planRemoved,
      onUndo: () =>
        void write(voyageApi.notesEndpoint, {
          method: 'POST',
          body: {
            tripId: trip.id,
            category: n.category,
            text: n.text,
            label: n.label,
            member_id: n.member_id,
            date: n.date,
            media_kind: n.media_kind,
            media_key: n.media_key,
            scene_key: n.scene_key,
          },
          affectedKeys: [affectedKey],
        }).catch(() => {}),
    })
  }

  return (
    <div className="voyage-itin" ref={rootRef}>
      {/* Whose plan — optional member scope for new entries. Maisonnée = whole trip. */}
      {faces.length > 0 && (
        <MemberSwitcher
          faces={faces}
          value={who}
          onChange={setWho}
          allLabel={t.voyage.everyone}
          ariaLabel={t.voyage.forWhom}
          className="voyage-itin__who"
        />
      )}
      {days.map((d, i) => {
        const dayNotes = notes.filter((n) => n.date === d)
        return (
          <section key={d} className="voyage-itin__day" data-jour={i + 1}>
            <div className="sec-label">
              <b>{t.voyage.dayN(i + 1)}</b>
              <span className="voyage-itin__date mono">{cap(formatDayLong(d, lang))}</span>
              <span className="ln" />
            </div>
            {dayNotes.map((n) => (
              <TripNoteCard
                key={n.id}
                note={n}
                who={memberName(n.member_id)}
                onSave={(text) => save(n, text)}
                onDelete={() => del(n)}
              />
            ))}
            <TripNoteAdd tripId={trip.id} category="activity" date={d} memberId={who} placeholder={t.voyage.addDayPlan} />
          </section>
        )
      })}
    </div>
  )
}
