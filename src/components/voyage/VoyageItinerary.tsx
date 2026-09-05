import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useT, useLang } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useRecordUndo } from '../../lib/toast'
import { useConfirm } from '../../lib/confirm'
import { formatDayLong, capitalize as cap } from '../../lib/format'
import { isGuest } from '../../lib/device'
import { usePointerDnd, DragGhost, DND_HOLD_MS, dropCueOf } from '../../lib/dnd'
import { DragPill } from '../DragPill'
import { EmptyState } from '../EmptyState'
import { MemberSwitcher, type MemberFace } from '../MemberSwitcher'
import { TripNoteAdd } from './TripNoteAdd'
import { SectionAdd } from '../SectionAdd'
import { TripNoteCard } from './TripNoteCard'
import { reorderPatches, tripDays, useVoyageApi, type Trip, type TripNote } from './voyage'
import { scrollBehavior } from '../../lib/motion'

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
  // Which day's composer is open (its local-midnight stamp), or null. ONE at a time,
  // like `useSingleOpen` — the itinerary is a thing you READ; writing into it is a
  // deliberate act on one day. See the ＋ in each day header below.
  const [addDay, setAddDay] = useState<number | null>(null)
  const affectedKey = voyageApi.notesKey(trip.id)
  const days = tripDays(trip.start_at, trip.end_at)
  const memberName = (id: string | null) => (id ? faces.find((f) => f.id === id)?.name ?? '' : '')

  // Reorder within a day — the shared hold-to-drag (usePointerDnd + DragPill grip,
  // same gesture as La liste / the aisle order). ONE dnd instance serves every day
  // section, so zone ids are day-scoped ("«day»:«index»"); canDrop pins a drag to
  // its own day (moving an entry to ANOTHER day stays a deliberate edit, not a
  // slip of the finger). A drop renumbers the day's rows 0..n-1 via one position
  // PATCH per moved row (reorderPatches, pure) — the GET's ORDER BY picks it up.
  const dayOf = (zone: string) => zone.slice(0, zone.lastIndexOf(':'))
  // Shared by the drop handler and each day section's ↑/↓ keyboard mirror below.
  function moveInDay(d: number, from: number, to: number) {
    const dayNotes = notes.filter((n) => n.date === d)
    for (const patch of reorderPatches(dayNotes, from, to))
      void write(voyageApi.notesEndpoint, { method: 'PATCH', body: patch, affectedKeys: [affectedKey] }).catch(() => {})
  }
  const dnd = usePointerDnd({
    onDrop: (fromId, toZone) => {
      if (dayOf(fromId) !== dayOf(toZone)) return
      moveInDay(
        Number(dayOf(fromId)),
        Number(fromId.slice(fromId.lastIndexOf(':') + 1)),
        Number(toZone.slice(toZone.lastIndexOf(':') + 1)),
      )
    },
    canDrop: (id, zone) => dayOf(id) === dayOf(zone),
    holdMs: DND_HOLD_MS,
  })
  const canReorder = !isGuest()

  // Deep-link from a calendar day / day-page itinerary row: `?jour=N` (1-based
  // day-of-trip) scrolls that day's section into view, so tapping "Musée, 14h" on
  // the 12th lands on day 12 rather than the top of a long multi-day itinerary.
  const [params] = useSearchParams()
  const jour = Number(params.get('jour'))
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!jour || jour < 1) return
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-jour="${jour}"]`)
    el?.scrollIntoView({ block: 'start', behavior: scrollBehavior() })
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
              {/* One ＋ per day, in its header — the shared SectionAdd, same as every
                  other section in the app. The composer used to be OPEN under every
                  single day: field + a full-width « ＋ Ajouter » + « Ajouter un
                  document », ~180px each, so an 8-day trip opened as roughly 1400px
                  of empty add boxes with the itinerary hiding between them (LEAN #2,
                  at its worst anywhere in the app). One day at a time now, opened
                  focused, folded away the moment something is written. */}
              <span className="sec-label__act">
                <SectionAdd
                  open={addDay === d}
                  onToggle={() => setAddDay(addDay === d ? null : d)}
                  label={t.voyage.addDayPlan}
                />
              </span>
            </div>
            {dayNotes.map((n, j) => {
              const zone = `${d}:${j}`
              return (
              <DragPill
                key={n.id}
                dnd={dnd}
                index={j}
                zone={zone}
                label={n.label || n.text || t.voyage.dayN(i + 1)}
                as="div"
                className="voyage-itin__row"
                showGrip={canReorder && dayNotes.length > 1}
                onMove={
                  canReorder && dayNotes.length > 1 ? (dir) => moveInDay(d, j, dir === 'up' ? j - 1 : j + 1) : undefined
                }
                edge={canReorder && dayNotes.length > 1 ? dropCueOf(dnd, zone) : undefined}
              >
                <TripNoteCard
                  note={n}
                  who={memberName(n.member_id)}
                  onSave={(text) => save(n, text)}
                  onDelete={() => del(n)}
                />
              </DragPill>
              )
            })}
            {addDay === d && (
              <TripNoteAdd
                tripId={trip.id}
                category="activity"
                date={d}
                memberId={who}
                placeholder={t.voyage.addDayPlan}
                autoFocus
                onAdded={() => setAddDay(null)}
              />
            )}
          </section>
        )
      })}
      <DragGhost ghost={dnd.ghost} />
    </div>
  )
}
