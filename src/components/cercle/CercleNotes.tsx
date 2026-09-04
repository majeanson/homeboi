import { useEffect, useMemo, useState } from 'react'
import { facesFromCercleMembers } from '../../lib/faces'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { useProfile } from '../../lib/profile'
import { FAMILY_NOTES_KEY } from '../../lib/queryKeys'
import { type FamilyNote, type NoteScope, visibleNotes } from '../../lib/familyNotes'
import type { Member } from '../../lib/cercle'
import { isGuest } from '../../lib/device'
import { useSurface } from '../../lib/surface'
import { Cluster } from '../Layout'
import { SearchField } from '../SearchField'
import { MemberSwitcher, type MemberFace } from '../MemberSwitcher'
import { FaceSelect } from '../FaceSelect'
import { NoteEditor } from './NoteEditor'
import { NotesList } from './NotesList'

// « Les notes » — iOS-Notes-style notes scoped to ONE household member (the "Moi" list)
// or the whole Maisonnée (family-wide). A picked face (the device profile) sees THEIR
// personal notes PLUS the Maisonnée notes always; "Maisonnée" sees only the family-wide
// ones (decision 3). The scope is resolved PURELY from the picked face.
//
// ONE face — no Simple/Avancé toggle any more. It used to fork into a lean reading
// face and a roomy managing one; once the ＋ always opens the real editor, "..." lives
// on every row and tapping a note opens it directly, the only things the split still
// bought were density (grip/tint dot/scope chip) and an always-open search box — and
// the density need is already served by the board's own compact "Notes (cercle)" card
// (`CercleNotesCard`, unchanged). So the page is just iOS Notes: kiosk gets the
// always-visible face row (it's a wall tablet), mobile gets the compact chip; the
// loupe stays collapsible everywhere (LEAN.md); rows are roomy with a "..." menu.
//
// NEITHER face carries a section title/subtitle: the hub header already says
// « Les notes » with the same icon, and the old subtitle just restated the composer's
// placeholder.
//
// Creating a note is always via the ＋ FAB, which opens NoteEditor directly (see
// FORM_ROUTES['cnote'] in lib/addSheet.tsx) — no inline composer on this page any
// more. Voice capture isn't lost: a LONG-press on the ＋ still opens the quick
// NoteQuickAdd sheet with the mic armed (VOICE_MODES.notes, untouched); photo/drawing
// attachment lives inside the editor itself.
//
// The ROWS themselves are the shared NotesList — the board's « Notes (cercle) » card
// renders the same list. This component keeps what's section-only: the face row, the
// search box, and hosting the NoteEditor.
export function CercleNotes({
  members,
  // A global-search hit deep-links to a specific note via ?item=<id> (§892): switch the
  // face so the note is visible; NotesList then scrolls + pulses it and onFocused
  // lets the parent clear its one-shot focus.
  focusId,
  onFocused,
  // The ＋ FAB's door (/notes?add=1): open the rich editor composing a NEW note. A
  // NONCE, not a boolean — every bump opens it once. A boolean read on mount only
  // would work the first time and then go dead, because landing on /notes?add=1
  // while already ON /notes is a same-route navigation: the search param changes, the
  // page never remounts. See the Notes page for the other half.
  composeNonce = 0,
}: {
  members: Member[]
  focusId?: string | null
  onFocused?: () => void
  composeNonce?: number
}) {
  const t = useT()
  const { surface } = useSurface()
  const ro = isGuest()

  // The acting face for the section: whose notes to show, and the scope for a new note.
  // It IS the device profile (lib/profile), shared with the board's « Aujourd'hui » row
  // and Maison's focus lens — "who am I today" is picked once and remembered
  // everywhere, not re-answered per surface. null = Maisonnée. A specific face also
  // surfaces the Maisonnée notes beneath their own (visibleNotes). The note scope
  // follows the face — a member → a personal ('self') note, Maisonnée → a family-wide
  // one (no toggle).
  const { memberId: face, setMemberId: setFace } = useProfile()
  const effScope: NoteScope = face ? 'self' : 'family'

  // iOS-Notes-style live search across the visible list (title + body + author name).
  // Simple mode keeps it COLLAPSED to a small magnifier until asked for — a permanently
  // open field is a row of furniture above notes you can usually just see.
  const [query, setQuery] = useState('')
  // The full-screen editor (new + edit). editorNote null = compose a new note.
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorNote, setEditorNote] = useState<FamilyNote | null>(null)

  const { data } = useQuery({
    queryKey: FAMILY_NOTES_KEY,
    queryFn: () => api<{ notes: FamilyNote[] }>('family-notes'),
    ...live,
  })
  const all = useMemo(() => data?.notes ?? [], [data])

  // ONE resolved face list feeds the face control, the rows' tints/names (NotesList)
  // and the editor's "Pour qui" picker.
  const faces: MemberFace[] = useMemo(
    () =>
      facesFromCercleMembers(members),
    [members],
  )

  // Face filter, then narrow by the search box (the display ORDER lives in NotesList —
  // manual drag position, then newest-first). Search matches the title, body, OR author
  // name so "find Léa's note" works.
  const visible = useMemo(() => {
    const base = visibleNotes(all, face)
    const q = query.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.text.toLowerCase().includes(q) ||
        (members.find((m) => m.id === n.author_member_id)?.displayName.toLowerCase().includes(q) ?? false),
    )
  }, [all, face, query, members])

  // Deep-link focus (§892): a search hit lands on ONE note that may live under another
  // face — switch to its scope so it becomes visible; NotesList does the rest.
  useEffect(() => {
    if (!focusId) return
    const n = all.find((x) => x.id === focusId)
    if (!n) return // not loaded yet (or gone) — wait for the next poll
    // The face is the device profile now, so only move it when the note is genuinely
    // out of reach: a Maisonnée note already shows under any picked face, and switching
    // for it would silently re-answer "who am I today" (and re-attribute writes).
    if (visibleNotes(all, face).some((x) => x.id === focusId)) return
    setFace(n.member_id) // null → Maisonnée (family-wide); a member → their list
  }, [focusId, all, face, setFace])

  const openNew = () => {
    setEditorNote(null)
    setEditorOpen(true)
  }
  const openEdit = (n: FamilyNote) => {
    setEditorNote(n)
    setEditorOpen(true)
  }

  // The rich-editor door: each new nonce opens the composer exactly once. Keyed on the
  // nonce (not mount), so asking again — a same-route navigation that never remounts
  // this component — opens it again. 0 is the "never asked" seed.
  useEffect(() => {
    // `ro` too: every composer entry point on this page is behind {!ro}, and
    // /notes?add=1 is reachable by URL — a read-only guest was handed the full
    // editor and a save that authed() would only 403 at the end.
    if (!composeNonce || ro) return
    // Opening a dialog IS the effect here — the URL door (?add=1) is an external
    // event, not derived state, so there's nothing to compute during render instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    openNew()
  }, [composeNonce, ro])

  const fn = t.cercle.familyNotes
  // The search box is worth offering only once there's something to search (or a
  // query already narrowed the list to nothing).
  const searchable = visible.length > 0 || query.trim() !== ''

  return (
    <section className="cercle-notes">
      {/* No section header. The hub header above already says « Les notes » with the
          same icon. (The explanation isn't lost: the guide card « notes » still
          carries it, reachable from the page's SectionIntro / HubHead.) */}

      {/* The one control bar: whose notes, then the loupe right beside it — the face
          and the search are the same "narrow what I'm looking at" pair, so they read
          as one group instead of being pushed to opposite edges. A Cluster (never a
          hand-rolled flex row) so it wraps instead of bleeding off a narrow phone. */}
      <Cluster className="cercle-notes__bar">
        {/* Whose notes — Maisonnée + each member, driving the SAME device profile as
            the board's « Aujourd'hui » row. Kiosk (a wall tablet) gets the always-
            visible face ROW; mobile gets the small chip. This one control also
            decides a new note's scope: a face → a personal note, Maisonnée →
            family-wide. */}
        {/* Named « Pour qui » (the existing key, same words the editor's scope picker
            uses), not the old section title: with the header gone, that title was
            still being announced here — and "Notes & recommandations" never described
            a face picker anyway. */}
        {surface === 'kiosk' ? (
          <MemberSwitcher faces={faces} value={face} onChange={setFace} allLabel={fn.scopeFamily} ariaLabel={fn.forWhom} />
        ) : (
          <div className="cercle-notes__face">
            <FaceSelect faces={faces} value={face} onChange={setFace} allLabel={fn.scopeFamily} ariaLabel={fn.forWhom} />
          </div>
        )}

        {/* The shared SearchField, COLLAPSIBLE: a small loupe until it's asked for,
            then the field in place — a permanently open field is a row of furniture
            above notes you can usually just see (LEAN.md). */}
        {searchable && (
          <SearchField
            className="cercle-notes__search"
            value={query}
            onChange={setQuery}
            collapsible
            placeholder={fn.search}
            ariaLabel={fn.search}
          />
        )}
      </Cluster>

      {/* The rows. iOS-Notes style: tapping a note opens it straight in the editor
          (`openOnTap`) — no expand-in-place, no separate pencil, the editor IS the
          detail view. "..." (in NotesList) offers Supprimer. Grips drop while a
          search narrows the list: reordering a filtered subset would scramble what
          the drag pins. */}
      <NotesList
        notes={visible}
        faces={faces}
        readOnly={ro}
        openOnTap
        canReorder={query.trim() === ''}
        onEdit={openEdit}
        focusId={focusId}
        onFocused={onFocused}
        empty={<p className="cercle-notes__empty mono">{query.trim() ? fn.noMatch : face ? fn.emptyMine : fn.empty}</p>}
      />

      {/* The full-screen editor — one component, reused for new + modify. */}
      <NoteEditor open={editorOpen} note={editorNote} scope={effScope} memberId={face} faces={faces} onClose={() => setEditorOpen(false)} />
    </section>
  )
}
