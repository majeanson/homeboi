import { useEffect, useMemo, useState } from 'react'
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
import { imgUrl } from '../../lib/image'
import { Icon, InlineIcon } from '../Icon'
import { MemberSwitcher, type MemberFace } from '../MemberSwitcher'
import { FaceSelect } from '../FaceSelect'
import { NoteEditor } from './NoteEditor'
import { NoteQuickAdd } from './NoteQuickAdd'
import { NotesList } from './NotesList'
import { HelpTitle, type HelpMode } from '../../lib/helpMode'

// « Le cercle » → Famille → "Notes & recommandations". iOS-Notes-style notes scoped to
// ONE household member (the "Moi" list) or the whole Maisonnée (family-wide). A picked
// face (defaulting to the device profile) sees THEIR personal notes PLUS the Maisonnée
// notes always; "Maisonnée" sees only the family-wide notes (decision 3). The scope is
// resolved PURELY from the picked face — the same subtle face row as the board's
// "Aujourd'hui" header (the shared MemberSwitcher).
//
// A note now has an optional TITLE and a rich Markdown BODY (#richnotes): "Nouvelle note"
// and the row pencil open the full-screen NoteEditor (one editor, reused for add + edit)
// with bold/italic/strike, headings, bullets/numbered/checklists, quote, and one optional
// photo/drawing attachment. The composer above the list is the shared `NoteQuickAdd`
// (EditField + useMemoAttach): write a quick note and/or clip a voice memo / drawing /
// photo onto it via the 📎, in ONE write — the SAME component the board's « Notes
// (cercle) » card opens behind its header ＋, so a note written from the glance surface
// is written identically. « Nouvelle note » stays as the door to the rich editor.
//
// The ROWS themselves (expand-to-read, multi-open, drag-reorder, pencil/trash, the audio
// rename dialog) are the shared NotesList — the board's « Notes (cercle) » card renders
// the same list. This component keeps what's cercle-only: the face row, the composer,
// the search box, and hosting the NoteEditor.
export function CercleNotes({
  members,
  help,
  // A global-search hit deep-links to a specific note via ?item=<id> (§892): switch the
  // face so the note is visible; NotesList then expands + scrolls + pulses it and
  // onFocused lets the parent clear its one-shot focus.
  focusId,
  onFocused,
  // The ＋-FAB door (/notes?add=1): open the rich editor composing a NEW note.
  // A NONCE, not a boolean — every bump opens it once. A boolean read on mount
  // only would work the first time and then go dead, because tapping ＋ while
  // already ON /notes is a same-route navigation: the search param changes, the
  // page never remounts. See the Notes page for the other half.
  composeNonce = 0,
}: {
  members: Member[]
  // Optional shared help mode (the Cercle page's) so the section header is explainable.
  help?: HelpMode
  focusId?: string | null
  onFocused?: () => void
  composeNonce?: number
}) {
  const t = useT()
  const { surface } = useSurface()
  const ro = isGuest()

  // The acting face for the section: whose notes to show, and the scope for a new note.
  // It IS the device profile (lib/profile), shared with the board's « Aujourd'hui » row
  // and the cercle's focus lens — "who am I today" is picked once and remembered
  // everywhere, not re-answered per surface. null = Maisonnée. A specific face also
  // surfaces the Maisonnée notes beneath their own (visibleNotes). The note scope
  // follows the face — a member → a personal ('self') note, Maisonnée → a family-wide
  // one (no toggle).
  const { memberId: face, setMemberId: setFace } = useProfile()
  const effScope: NoteScope = face ? 'self' : 'family'

  // iOS-Notes-style live search across the visible list (title + body + author name).
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

  // ONE resolved face list feeds the face row, the rows' tints/names (NotesList) and
  // the editor's "Pour qui" picker.
  const faces: MemberFace[] = useMemo(
    () =>
      members.map((m) => ({
        id: m.id,
        name: m.displayName,
        colour: m.colour,
        photoUrl: m.avatarKind === 'photo' && m.avatarRef ? imgUrl(m.avatarRef) : null,
      })),
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

  // The ＋ door: each new nonce opens the composer exactly once. Keyed on the
  // nonce (not mount), so tapping ＋ again — a same-route navigation that never
  // remounts this component — opens it again. 0 is the "never asked" seed.
  useEffect(() => {
    // `ro` too: every other composer entry point on this page is behind {!ro},
    // and /notes?add=1 is reachable by URL — a read-only guest was handed the full
    // editor and a save that authed() would only 403 at the end.
    if (!composeNonce || ro) return
    openNew()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeNonce, ro])

  const fn = t.cercle.familyNotes

  return (
    <section className="cercle-group cercle-notes">
      <header className="cercle-notes__head">
        <HelpTitle help={help} k="notes" className="cercle-notes__title">
          <InlineIcon name="file-text-bold" size={18} /> {fn.title}
        </HelpTitle>
        <p className="cercle-notes__sub mono">{fn.addHint}</p>
      </header>
      {help?.bubbleFor('notes')}

      {/* Whose notes — Maisonnée + each member. The SAME pick-a-face control as the
          board's "Aujourd'hui" header, surface-for-surface: the always-in-view face ROW
          on a kiosk wall, and the collapsed tap-to-open chip on mobile (FaceSelect).
          Seeded from the device profile, but this picks LOCALLY. This one control also
          decides the new note's scope: a face → a personal note, Maisonnée → family-wide. */}
      {surface === 'kiosk' ? (
        <MemberSwitcher faces={faces} value={face} onChange={setFace} allLabel={fn.scopeFamily} ariaLabel={fn.title} />
      ) : (
        <div className="cercle-notes__face">
          <FaceSelect faces={faces} value={face} onChange={setFace} allLabel={fn.scopeFamily} ariaLabel={fn.title} />
        </div>
      )}

      {/* Composer — one line to write, plus a 📎 to clip a voice memo / drawing / photo
          onto it. The new note's scope follows the picked face above. Hidden for guests.
          The full rich editor is the tab's ＋ FAB (addSheet mode 'cnote' → ?add=1 →
          composeNonce → openNew): this used to carry its OWN « Nouvelle note » button
          firing the very same openNew, so the page offered two identically-named
          buttons for one action once « Les notes » got its own tab and its own ＋. */}
      {!ro && <NoteQuickAdd memberId={face} className="cercle-notes__composer card" />}

      {/* Search — iOS-Notes style: one always-there field so any note is a couple of
          keystrokes away (title, body or author name). */}
      {(visible.length > 0 || query.trim() !== '') && (
        <div className="cnote-search">
          <InlineIcon name="magnifying-glass-bold" size={16} />
          <input
            className="cnote-search__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={fn.search}
            aria-label={fn.search}
          />
          {query && (
            <button type="button" className="cnote-search__clear" onClick={() => setQuery('')} aria-label={t.common.close}>
              <Icon name="x-bold" size={14} />
            </button>
          )}
        </div>
      )}

      {/* The rows — the shared list (multi-expand, drag-reorder, pencil/trash). Grips
          drop while a search narrows the list: reordering a filtered subset would
          scramble what the drag pins. */}
      <NotesList
        notes={visible}
        faces={faces}
        readOnly={ro}
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
