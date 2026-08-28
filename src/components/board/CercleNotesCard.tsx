import { useMemo } from 'react'
import { facesFromMembers } from '../../lib/faces'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { useProfile } from '../../lib/profile'
import { isGuest } from '../../lib/device'
import { FAMILY_NOTES_KEY } from '../../lib/queryKeys'
import { type FamilyNote, visibleNotes } from '../../lib/familyNotes'
import type { Member } from '../../lib/members'
import type { MemberFace } from '../MemberSwitcher'
import { InlineIcon } from '../Icon'
import { SectionAdd, useSectionAdd } from '../SectionAdd'
import { Section } from './Act'
import { useReportEmpty } from '../../lib/useReportEmpty'
import { NotesList } from '../cercle/NotesList'
import { NoteQuickAdd } from '../cercle/NoteQuickAdd'

// « Notes (cercle) » — the durable Les notes tab, brought to the board's Grille and
// LENSED BY THE PICKED FACE (the « Aujourd'hui » MemberSwitcher): a face sees THEIR
// personal notes + the Maisonnée ones; « Maisonnée » sees only the family-wide list —
// the exact visibleNotes rule the Notes tab uses, driven by the board's own face
// instead of a local picker. Same information, same place you'd look for the rest of
// that face's day. The rows ARE the shared NotesList in its COMPACT glance face
// (compact-rows pass): reading only — expand in place, play a memo, tap a checklist —
// with no grip / tint dot / chip / pencil / trash, so the card's width goes to the
// text. The ONE thing the card also DOES is add: the header ＋ opens the shared
// `NoteQuickAdd` in place (same field, same 📎 memo attachment, same write as the
// section's composer), scoped to the picked face — a quick note without leaving the
// glance surface. Everything else that acts on a note (edit, delete, reorder, the
// rich editor) still lives in Les notes, behind the quiet footer link. Self-hides when the face has no
// notes (calm) — the show/hide + order setting lives in Réglages ▸ Affichage ▸
// Disposition like every Grille card. NOT the fridge notes band (`notes` table) —
// these are the durable family_notes.
export function CercleNotesCard({ members }: { members: Member[] }) {
  const t = useT()
  const { memberId: profileId } = useProfile()
  // Still needed in compact: a guest's expanded checklists render INERT (a tick
  // would 403), even though the action buttons are gone for everyone here.
  const ro = isGuest()
  // The header ＋: opens the quick composer in place (the shared SectionAdd, the
  // same affordance the garde-manger's lists and « À faire » wear). Transient
  // (never persisted) — a card that reloads is a card at rest.
  const compose = useSectionAdd()

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
      facesFromMembers(members),
    [members],
  )

  // Nothing for this face → no card (calm, like Mots / Voyage / Carnets). The ＋ goes
  // with it: on an empty board the ＋ FAB (mode 'cnote') is the door, and a card that
  // shows nothing but its own add button is exactly the furniture the glance surface
  // is meant to drop. « Toujours afficher » still holds the slot via CardSlot.
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
      // The quick add — hidden for a read-only guest (the write would 403) and, like
      // every other write affordance here, absent from the compact mini face: that tile
      // is a glance, and it grows to this one with a tap.
      action={<SectionAdd open={compose.open} onToggle={compose.toggle} label={t.cercle.familyNotes.quickAdd} />}
    >
      {/* Opened in place, closed once the note is written — the card goes back to
          being a glance. The scope follows the board's picked face (`profileId`):
          a face → their own note, « Maisonnée » → a family-wide one. */}
      {compose.open && (
        <NoteQuickAdd
          memberId={profileId}
          className="cnotes-card__composer"
          drawDraftId="board-cnote"
          autoFocus
          onSubmitted={compose.close}
        />
      )}
      <NotesList notes={notes} faces={faces} readOnly={ro} compact />
      {/* The door to the full section (composer, search, per-face browsing — and
          every per-note action the compact rows deliberately don't carry). */}
      <Link to="/notes" className="cnotes-card__more mono">
        {t.cercle.familyNotes.seeAll} <InlineIcon name="caret-right-bold" size={12} />
      </Link>
    </Section>
  )
}
