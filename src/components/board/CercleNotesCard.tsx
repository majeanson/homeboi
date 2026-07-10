import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { useProfile } from '../../lib/profile'
import { isGuest } from '../../lib/device'
import { imgUrl } from '../../lib/image'
import { FAMILY_NOTES_KEY } from '../../lib/queryKeys'
import { type FamilyNote, visibleNotes } from '../../lib/familyNotes'
import type { Member } from '../../lib/members'
import type { MemberFace } from '../MemberSwitcher'
import { InlineIcon } from '../Icon'
import { Section } from './Act'
import { useReportEmpty } from '../../lib/useReportEmpty'
import { NotesList } from '../cercle/NotesList'
import { NoteEditor } from '../cercle/NoteEditor'

// « Notes (cercle) » — the durable Le cercle ▸ Notes, brought to the board's Grille and
// LENSED BY THE PICKED FACE (the « Aujourd'hui » MemberSwitcher): a face sees THEIR
// personal notes + the Maisonnée ones; « Maisonnée » sees only the family-wide list —
// the exact visibleNotes rule the cercle section uses, driven by the board's own face
// instead of a local picker. Same information, same place you'd look for the rest of
// that face's day. The rows ARE the shared NotesList (multi-expand, drag-reorder,
// pencil into the full NoteEditor); what stays in Le cercle is composing (the board's
// door is the quiet footer link). Self-hides when the face has no notes (calm) — the
// show/hide + order setting lives in Réglages ▸ Affichage ▸ Disposition like every
// Grille card. NOT the fridge notes band (`notes` table) — these are the durable
// family_notes.
export function CercleNotesCard({ members }: { members: Member[] }) {
  const t = useT()
  const { memberId: profileId } = useProfile()
  const ro = isGuest()

  // Non-polling (like CarnetsCard): durable notes change over days, a write anywhere
  // invalidates FAMILY_NOTES_KEY and realtime nudges it — so this default-on card
  // doesn't add /api/family-notes to the board's poll cadence for every household.
  const { data } = useQuery({
    queryKey: FAMILY_NOTES_KEY,
    queryFn: () => api<{ notes: FamilyNote[] }>('family-notes'),
    staleTime: 5 * 60_000,
  })
  const all = data?.notes
  const notes = useMemo(() => visibleNotes(all ?? [], profileId), [all, profileId])

  // The board's snake_case member rows → the shared face shape (tints, scope chips,
  // the editor's "Pour qui" picker).
  const faces: MemberFace[] = useMemo(
    () =>
      members.map((m) => ({
        id: m.id,
        name: m.display_name,
        colour: m.colour,
        photoUrl: m.avatar_kind === 'photo' && m.avatar_ref ? imgUrl(m.avatar_ref) : null,
      })),
    [members],
  )

  // The full-screen editor for a row's pencil (same one the cercle section hosts).
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorNote, setEditorNote] = useState<FamilyNote | null>(null)

  // Nothing for this face → no card (calm, like Mots / Voyage / Carnets). Composing
  // lives in Le cercle, so an empty list has nothing to offer on the glance surface.
  const empty = notes.length === 0
  useReportEmpty(empty)
  if (empty) return null

  return (
    <Section
      label={t.boardCard.cercleNotes}
      icon="file-text-bold"
      tint="var(--teal-deep, #2a8f85)"
      // Compact: the same heading `NotesList` shows — the explicit title, else the body's
      // first line, else « Sans titre » (a media memo). Never filtered: one row per note,
      // so the tile can't quietly name fewer things than the card holds.
      compactItems={notes.map(
        (n) => n.title.trim() || n.text.split('\n')[0]!.trim() || t.cercle.familyNotes.untitled,
      )}
      compactHint={String(notes.length)}
    >
      <NotesList
        notes={notes}
        faces={faces}
        readOnly={ro}
        onEdit={(n) => {
          setEditorNote(n)
          setEditorOpen(true)
        }}
      />
      {/* The door to the full section (composer, search, per-face browsing). */}
      <Link to="/cercle?section=notes" className="cnotes-card__more mono">
        {t.cercle.familyNotes.seeAll} <InlineIcon name="caret-right-bold" size={12} />
      </Link>
      <NoteEditor
        open={editorOpen}
        note={editorNote}
        scope={profileId ? 'self' : 'family'}
        memberId={profileId}
        faces={faces}
        onClose={() => setEditorOpen(false)}
      />
    </Section>
  )
}
