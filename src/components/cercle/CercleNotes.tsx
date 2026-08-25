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
import { useNotesAdvanced, setNotesAdvanced } from '../../lib/notesMode'
import { imgUrl } from '../../lib/image'
import { Icon, InlineIcon } from '../Icon'
import { Cluster } from '../Layout'
import { SearchField } from '../SearchField'
import { MemberSwitcher, type MemberFace } from '../MemberSwitcher'
import { FaceSelect } from '../FaceSelect'
import { NoteEditor } from './NoteEditor'
import { NoteQuickAdd } from './NoteQuickAdd'
import { NotesList } from './NotesList'
import { HelpTitle, type HelpMode } from '../../lib/helpMode'

// « Les notes » — iOS-Notes-style notes scoped to ONE household member (the "Moi" list)
// or the whole Maisonnée (family-wide). A picked face (the device profile) sees THEIR
// personal notes PLUS the Maisonnée notes always; "Maisonnée" sees only the family-wide
// ones (decision 3). The scope is resolved PURELY from the picked face.
//
// TWO FACES, one device flag (lib/notesMode) — the whole section leans on it:
//
//   SIMPLE (default) — maximum note per pixel. No section title/subtitle (the hub
//     header already says « Les notes »), a small face CHIP on every surface, a
//     collapsed 🔍 that expands on tap, one wide text box where Enter writes the note
//     (no mic, no 📎, no « Ajouter » button — those live in the ＋ FAB's composer,
//     bottom right), and the board card's COMPACT rows, keeping only the pencil/trash
//     so a note can still be edited or deleted from here.
//   AVANCÉ — what the tab used to be: the section header, the kiosk face ROW, the
//     mic + attachment in the composer, « Nouvelle note » into the rich editor, and
//     the roomy rows (grip + drag-reorder, tint dot, scope chip).
//
// The ROWS themselves are the shared NotesList — the board's « Notes (cercle) » card
// renders the same list. This component keeps what's section-only: the face row, the
// composer, the search box, the mode toggle, and hosting the NoteEditor.
export function CercleNotes({
  members,
  help,
  // A global-search hit deep-links to a specific note via ?item=<id> (§892): switch the
  // face so the note is visible; NotesList then expands + scrolls + pulses it and
  // onFocused lets the parent clear its one-shot focus.
  focusId,
  onFocused,
  // The « Nouvelle note » door (/notes?add=1): open the rich editor composing a NEW
  // note. A NONCE, not a boolean — every bump opens it once. A boolean read on mount
  // only would work the first time and then go dead, because landing on /notes?add=1
  // while already ON /notes is a same-route navigation: the search param changes, the
  // page never remounts. See the Notes page for the other half.
  composeNonce = 0,
}: {
  members: Member[]
  // Optional shared help mode (the page's) so the header + mode toggle are explainable.
  help?: HelpMode
  focusId?: string | null
  onFocused?: () => void
  composeNonce?: number
}) {
  const t = useT()
  const { surface } = useSurface()
  const ro = isGuest()
  // Device-local presentation flag — NOT a household write, so a guest may flip it
  // (CLAUDE.md: gating a localStorage pref on isGuest is what hid whole features
  // from the demo). See lib/notesMode.
  const advanced = useNotesAdvanced()

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
    <section className={'cercle-notes' + (advanced ? ' cercle-notes--advanced' : ' cercle-notes--lean')}>
      {/* ADVANCED only — the section header. In simple mode the hub header above
          already says « Les notes » with the same icon, and the subtitle repeated
          what the empty composer's placeholder says anyway. */}
      {advanced && (
        <header className="cercle-notes__head">
          <HelpTitle help={help} k="notes" className="cercle-notes__title">
            <InlineIcon name="file-text-bold" size={18} /> {fn.title}
          </HelpTitle>
          <p className="cercle-notes__sub mono">{fn.addHint}</p>
        </header>
      )}
      {advanced && help?.bubbleFor('notes')}

      {/* The one control bar: whose notes on the left, the tools on the right.
          A Cluster (never a hand-rolled flex row) so it wraps instead of bleeding
          off a narrow phone. */}
      <Cluster className="cercle-notes__bar" justify="between">
        {/* Whose notes — Maisonnée + each member, driving the SAME device profile as
            the board's « Aujourd'hui » row. Advanced keeps the always-in-view face ROW
            on a kiosk wall; simple is the small chip everywhere (Marc's ask: "only a
            small toggle with faces"). This one control also decides a new note's scope:
            a face → a personal note, Maisonnée → family-wide. */}
        {advanced && surface === 'kiosk' ? (
          <MemberSwitcher faces={faces} value={face} onChange={setFace} allLabel={fn.scopeFamily} ariaLabel={fn.title} />
        ) : (
          <div className="cercle-notes__face">
            <FaceSelect faces={faces} value={face} onChange={setFace} allLabel={fn.scopeFamily} ariaLabel={fn.title} />
          </div>
        )}

        <Cluster className="cercle-notes__tools">
          {/* The shared SearchField, in its COLLAPSIBLE face: a small loupe until
              it's asked for, then the field in place. Advanced keeps it open, which
              is what the tab always did. One primitive, not a second hand-rolled
              "magnifier + input + ✕" row. */}
          {searchable && (
            <SearchField
              className="cercle-notes__search"
              value={query}
              onChange={setQuery}
              collapsible={!advanced}
              placeholder={fn.search}
              ariaLabel={fn.search}
            />
          )}

          {/* SIMPLE ↔ AVANCÉ — icon only, like the loupe beside it: the mode is a
              rare, once-a-household choice, not a label worth a word on every visit.
              Its state is the lit pill (aria-pressed for AT), and the tooltip/aria
              name says which way the next tap goes. Device-local, so a guest gets it. */}
          <button
            type="button"
            className={'notes-mode' + (advanced ? ' is-on' : '')}
            onClick={help ? help.pick('mode', () => setNotesAdvanced(!advanced)) : () => setNotesAdvanced(!advanced)}
            aria-pressed={advanced}
            aria-label={advanced ? fn.modeToSimple : fn.modeToAdvanced}
            title={advanced ? fn.modeToSimple : fn.modeToAdvanced}
          >
            <Icon name="gear-six-bold" size={16} />
          </button>
        </Cluster>
      </Cluster>
      {help?.bubbleFor('mode')}

      {/* The composer. Simple: text only, Enter writes it — the quickest possible
          path from a thought to a note. The mic and the 📎 attachment moved to the
          ＋ FAB (bottom right), which opens this very same component un-leaned.
          Advanced keeps them inline, plus « Nouvelle note » into the rich editor. */}
      {!ro && (
        <NoteQuickAdd
          memberId={face}
          lean={!advanced}
          className={'cercle-notes__composer' + (advanced ? ' card' : '')}
        />
      )}
      {!ro && advanced && (
        <button type="button" className="btn btn--ghost cercle-notes__new" onClick={openNew}>
          <Icon name="plus-bold" size={16} /> {fn.newNote}
        </button>
      )}

      {/* The rows. Simple wears the board card's COMPACT face outright — no grip, no
          tint dot, no scope chip, and NO pencil/trash either: reading is the whole job,
          so the row spends every pixel on the note itself (several lines of it). Acting
          on a note — edit, delete, reorder — is what AVANCÉ is for, one tap away on the
          ⚙ beside the loupe. Grips drop while a search narrows the list: reordering a
          filtered subset would scramble what the drag pins. */}
      <NotesList
        notes={visible}
        faces={faces}
        readOnly={ro}
        compact={!advanced}
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
