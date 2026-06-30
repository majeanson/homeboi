import { useState } from 'react'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { TRIP_NOTES_KEY } from '../../lib/queryKeys'
import { useRecordUndo } from '../../lib/toast'
import { EmptyState } from '../EmptyState'
import { Chip, ChipGroup } from '../Chip'
import { MemberSwitcher, type MemberFace } from '../MemberSwitcher'
import { TripNoteAdd } from './TripNoteAdd'
import { TripNoteCard } from './TripNoteCard'
import { TRIP_CATEGORIES, type Trip, type TripCategory, type TripNote } from './voyage'

// « Voyage » → Infos — the categorized info the user types/speaks at the rendez-vous
// (flights, hôtel, auto, contacts, divers…). A category chip row picks the active
// bucket; below it the shared Notes composer (text/voice/photo) adds into that bucket,
// and the bucket's existing entries list. A "Pour qui" face row optionally scopes an
// entry to a member — that's the "kids stuff / parents stuff" the user asked for.
// Atemporal only (date IS NULL); dated entries live under Itinéraire.
export function VoyageInfos({ trip, notes, faces }: { trip: Trip; notes: TripNote[]; faces: MemberFace[] }) {
  const t = useT()
  const write = useWrite()
  const recordUndo = useRecordUndo()
  // `cat === null` = no bucket picked → « voir toutes les notes » (every category,
  // each card showing its own glyph). Tapping the active chip again deselects it.
  const [cat, setCat] = useState<TripCategory | null>('flight')
  const [who, setWho] = useState<string | null>(null)
  const affectedKey = [...TRIP_NOTES_KEY, trip.id]
  const memberName = (id: string | null) => (id ? faces.find((f) => f.id === id)?.name ?? '' : '')

  const infoNotes = notes.filter((n) => n.date == null)
  const shown = cat == null ? infoNotes : infoNotes.filter((n) => n.category === cat)

  function save(n: TripNote, text: string) {
    void write('trip-notes', { method: 'PATCH', body: { id: n.id, text }, affectedKeys: [affectedKey] }).catch(() => {})
  }

  async function del(n: TripNote) {
    await write('trip-notes', { method: 'DELETE', body: { id: n.id }, affectedKeys: [affectedKey] }).catch(() => {})
    recordUndo({
      message: t.voyage.infoRemoved,
      onUndo: () =>
        void write('trip-notes', {
          method: 'POST',
          body: {
            tripId: trip.id,
            category: n.category,
            text: n.text,
            label: n.label,
            member_id: n.member_id,
            media_kind: n.media_kind,
            media_key: n.media_key,
            scene_key: n.scene_key,
          },
          affectedKeys: [affectedKey],
        }).catch(() => {}),
    })
  }

  return (
    <div className="voyage-infos">
      <ChipGroup label={t.voyage.categories}>
        {TRIP_CATEGORIES.map((c) => (
          <Chip
            key={c.key}
            icon={c.icon}
            selected={cat === c.key}
            onClick={() => setCat((prev) => (prev === c.key ? null : c.key))}
          >
            {t.voyage.cat[c.key]}
          </Chip>
        ))}
      </ChipGroup>

      {/* A bucket must be picked to add into; with none picked we just show all notes. */}
      {cat != null ? (
        <>
          {/* Whose info — optional member scope. Maisonnée = whole trip. */}
          {faces.length > 0 && (
            <MemberSwitcher
              faces={faces}
              value={who}
              onChange={setWho}
              allLabel={t.voyage.everyone}
              ariaLabel={t.voyage.forWhom}
              className="voyage-infos__who"
            />
          )}

          <TripNoteAdd
            tripId={trip.id}
            category={cat}
            memberId={who}
            placeholder={t.voyage.addInfoIn(t.voyage.cat[cat])}
          />
        </>
      ) : (
        <p className="voyage-infos__allhint mono">{t.voyage.allCatsHint}</p>
      )}

      <div className="voyage-infos__list">
        {shown.length === 0 ? (
          <EmptyState tone="calm" guide={{ card: 'voyage' }}>
            {t.voyage.noInfo}
          </EmptyState>
        ) : (
          shown.map((n) => (
            <TripNoteCard
              key={n.id}
              note={n}
              who={memberName(n.member_id)}
              showCategory={cat == null}
              onSave={(text) => save(n, text)}
              onDelete={() => del(n)}
            />
          ))
        )}
      </div>
    </div>
  )
}
