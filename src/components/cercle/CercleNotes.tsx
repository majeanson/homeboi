import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT, useLang } from '../../i18n'
import { formatDay } from '../../lib/format'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { useWrite } from '../../lib/write'
import { useProfile } from '../../lib/profile'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { FAMILY_NOTES_KEY } from '../../lib/queryKeys'
import { type FamilyNote, type NoteScope, visibleNotes } from '../../lib/familyNotes'
import type { Member } from '../../lib/cercle'
import { isGuest } from '../../lib/device'
import { useSurface } from '../../lib/surface'
import { imgUrl } from '../../lib/image'
import { Icon, InlineIcon } from '../Icon'
import { MemberSwitcher } from '../MemberSwitcher'
import { FaceSelect } from '../FaceSelect'
import { EditField } from '../EditField'
import { Modal } from '../Modal'
import { MemoControls } from '../MemoControls'
import { ZoomableImg } from '../ZoomableImg'
import { NoteEditor } from './NoteEditor'
import { plainText, renderNoteBody, toggleCheckAt } from '../../lib/noteMarkdown'
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
// photo/drawing attachment. Quick media memos (audio/draw/photo) still ride MemoControls +
// /api/note-media; an audio memo is renamed with a tiny dialog (its caption = the title).
export function CercleNotes({
  members,
  help,
}: {
  members: Member[]
  // Optional shared help mode (the Cercle page's) so the section header is explainable.
  help?: HelpMode
}) {
  const t = useT()
  const { lang } = useLang()
  const write = useWrite()
  const { memberId: profileId } = useProfile()
  const { surface } = useSurface()
  const ro = isGuest()

  // The acting face for the section: whose notes to show, and the scope for a new note.
  // Seeded from the device profile (null = Maisonnée). A specific face also surfaces the
  // Maisonnée notes beneath their own (visibleNotes). The note scope follows the face —
  // a member → a personal ('self') note, Maisonnée → a family-wide one (no toggle).
  const [face, setFace] = useState<string | null>(profileId)
  const effScope: NoteScope = face ? 'self' : 'family'

  // iOS-Notes-style live search across the visible list (title + body + author name).
  const [query, setQuery] = useState('')
  // A long note is read inline by EXPANDING it in place (tap the body to open/close);
  // it is edited in the full-screen NoteEditor. The two are separate: tapping reads.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // The full-screen editor (new + edit). editorNote null = compose a new note.
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorNote, setEditorNote] = useState<FamilyNote | null>(null)
  // Tiny rename dialog for an AUDIO memo (its caption is stored as the title); every
  // other note kind is edited in the full editor.
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const { data } = useQuery({
    queryKey: FAMILY_NOTES_KEY,
    queryFn: () => api<{ notes: FamilyNote[] }>('family-notes'),
    ...live,
  })
  const all = useMemo(() => data?.notes ?? [], [data])
  const removal = useDeferredRemoval(FAMILY_NOTES_KEY)

  const colorOf = (id: string | null) => members.find((m) => m.id === id)?.colour ?? null
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.displayName ?? null

  // Newest first (iOS Notes orders by most-recent), then narrow by the search box.
  // Search matches the title, body, OR author name so "find Léa's note" works.
  const visible = useMemo(() => {
    const base = visibleNotes(all, face)
      .slice()
      .sort((a, b) => (b.updated_at ?? b.created_at) - (a.updated_at ?? a.created_at))
    const q = query.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.text.toLowerCase().includes(q) ||
        (members.find((m) => m.id === n.author_member_id)?.displayName.toLowerCase().includes(q) ?? false),
    )
  }, [all, face, query, members])
  const shown = removal.visible(visible)

  const scopeBody = useMemo(
    () => (s: NoteScope) => ({ scope: s, member_id: s === 'self' ? face : null }),
    [face],
  )

  const openNew = () => {
    setEditorNote(null)
    setEditorOpen(true)
  }
  const openEdit = (n: FamilyNote) => {
    setEditorNote(n)
    setEditorOpen(true)
  }

  function remove(n: FamilyNote) {
    removal.remove([n.id], t.cercle.familyNotes.deleted, () =>
      write('family-notes', { method: 'DELETE', body: { id: n.id }, affectedKeys: [FAMILY_NOTES_KEY] }),
    )
  }

  // Rename an audio memo — its caption is the note's title.
  function saveRename(id: string, v: string) {
    setRenameId(null)
    void write('family-notes', { method: 'PATCH', body: { id, title: v.trim() }, affectedKeys: [FAMILY_NOTES_KEY] }).catch(() => {})
  }

  // Tick / untick one checklist item from the read view → rewrite the body line + PATCH.
  function toggleCheck(n: FamilyNote, lineIndex: number) {
    const next = toggleCheckAt(n.text, lineIndex)
    if (next === n.text) return
    void write('family-notes', { method: 'PATCH', body: { id: n.id, text: next }, affectedKeys: [FAMILY_NOTES_KEY] }).catch(() => {})
  }

  function playClip(key: string) {
    try {
      audioRef.current?.pause()
      const a = new Audio(imgUrl(key))
      audioRef.current = a
      void a.play()
    } catch {
      /* autoplay blocked — harmless */
    }
  }

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
      {(() => {
        const faces = members.map((m) => ({
          id: m.id,
          name: m.displayName,
          colour: m.colour,
          photoUrl: m.avatarKind === 'photo' && m.avatarRef ? imgUrl(m.avatarRef) : null,
        }))
        return surface === 'kiosk' ? (
          <MemberSwitcher faces={faces} value={face} onChange={setFace} allLabel={fn.scopeFamily} ariaLabel={fn.title} />
        ) : (
          <div className="cercle-notes__face">
            <FaceSelect faces={faces} value={face} onChange={setFace} allLabel={fn.scopeFamily} ariaLabel={fn.title} />
          </div>
        )
      })()}

      {/* Composer — "Nouvelle note" opens the full editor (the new note's scope follows the
          picked face above). Quick media memos sit below. Hidden for guests. */}
      {!ro && (
        <div className="cercle-notes__composer card">
          <button type="button" className="cercle-notes__new" onClick={openNew}>
            <Icon name="plus-bold" size={18} /> {fn.newNote}
          </button>
          <MemoControls onDone={() => {}} endpoint="family-notes" affectedKey={FAMILY_NOTES_KEY} extraBody={scopeBody(effScope)} />
        </div>
      )}

      {/* Search — iOS-Notes style: one always-there field so any note is a couple of
          keystrokes away (title, body or author name). */}
      {(shown.length > 0 || query.trim() !== '') && (
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

      {shown.length === 0 ? (
        <p className="cercle-notes__empty mono">{query.trim() ? fn.noMatch : face ? fn.emptyMine : fn.empty}</p>
      ) : (
        <ul className="cnote-list">
          {shown.map((n) => {
            const tint = colorOf(n.author_member_id) ?? 'var(--teal-deep, #2a8f85)'
            const css = { '--note-tint': tint } as React.CSSProperties
            const media = n.media_kind && n.media_key ? n.media_kind : null
            const scopeChip = n.member_id === null ? fn.forFamily : (nameOf(n.member_id) ?? fn.scopeSelf)
            const when = formatDay(n.created_at, lang)
            const mediaLabel = media === 'audio' ? fn.memo : media === 'image' ? fn.photo : media === 'drawing' ? fn.drawing : ''

            // iOS row anatomy: a bold title line, then a quieter "date · preview" line.
            // Title = the explicit title, else the body's first line, else the media kind.
            const bodyText = plainText(n.text)
            const explicitTitle = n.title.trim()
            const derivedFirst = bodyText.split('\n').find((l) => l.trim()) ?? ''
            const title = explicitTitle || derivedFirst || mediaLabel || fn.untitled
            // Preview = the body minus whatever already shows as the title line.
            const rest = (explicitTitle
              ? bodyText
              : bodyText.slice(derivedFirst ? bodyText.indexOf(derivedFirst) + derivedFirst.length : 0)
            )
              .replace(/\n+/g, ' ')
              .trim()
            const preview = rest

            // A note with body beyond its title can be read in place (tap to expand);
            // audio plays instead. Media thumbnails always show alongside.
            const expandable = media !== 'audio' && (rest.length > 0 || (!explicitTitle && derivedFirst.length > 48))
            const expanded = expandedId === n.id

            return (
              <li key={n.id} className={'cnote' + (expanded ? ' cnote--expanded' : '')} style={css}>
                {/* Visual notes show a tappable thumbnail; text/audio show a tint dot. */}
                {media === 'drawing' || media === 'image' ? (
                  <ZoomableImg className="cnote__thumb" src={imgUrl(n.media_key!)} alt={title} />
                ) : (
                  <span className="cnote__dot" aria-hidden="true">
                    {media === 'audio' ? <InlineIcon name="play-bold" size={14} /> : null}
                  </span>
                )}

                {/* The body: tapping a text note expands/collapses it (to read long notes
                    in place); an audio note plays it. Editing is the pencil, not the tap. */}
                {media === 'audio' ? (
                  <button type="button" className="cnote__main" onClick={() => playClip(n.media_key!)} aria-label={fn.memo}>
                    <span className="cnote__title">{title}</span>
                    <span className="cnote__meta mono">{when}{preview ? ` · ${preview}` : ''}</span>
                  </button>
                ) : expandable ? (
                  <button
                    type="button"
                    className="cnote__main"
                    onClick={() => setExpandedId(expanded ? null : n.id)}
                    aria-expanded={expanded}
                    aria-label={expanded ? fn.collapse : fn.expand}
                  >
                    <span className="cnote__titlerow">
                      <span className="cnote__title">{title}</span>
                      <span className="cnote__caret" aria-hidden="true">
                        <InlineIcon name={expanded ? 'caret-up-bold' : 'caret-down-bold'} size={14} />
                      </span>
                    </span>
                    <span className="cnote__meta mono">{when}{!expanded && preview ? ` · ${preview}` : ''}</span>
                  </button>
                ) : (
                  <span className="cnote__main cnote__main--static">
                    <span className="cnote__title">{title}</span>
                    <span className="cnote__meta mono">{when}{preview ? ` · ${preview}` : ''}</span>
                  </span>
                )}

                <span className="cnote__chip mono">{scopeChip}</span>

                {!ro && (
                  <span className="cnote__actions">
                    {/* One pencil per note: an audio memo renames (caption = title); every
                        other note opens the full editor (title + body + attachment). */}
                    {media === 'audio' ? (
                      <button type="button" className="cnote__act" onClick={() => { setRenameId(n.id); setRenameVal(n.title) }} aria-label={fn.rename}>
                        <Icon name="pencil-simple-bold" size={15} />
                      </button>
                    ) : (
                      <button type="button" className="cnote__act" onClick={() => openEdit(n)} aria-label={fn.edit}>
                        <Icon name="pencil-simple-bold" size={15} />
                      </button>
                    )}
                    <button type="button" className="cnote__act cnote__act--del" onClick={() => remove(n)} aria-label={fn.delete}>
                      <Icon name="trash-bold" size={15} />
                    </button>
                  </span>
                )}

                {/* Expanded: the whole note rendered from Markdown, checklists tappable. */}
                {expanded && (
                  <div className="cnote__full note-md">{renderNoteBody(n.text, { onToggleCheck: (i) => toggleCheck(n, i) })}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Tiny rename dialog for an audio memo (its caption is the title). */}
      {(() => {
        const note = renameId ? all.find((n) => n.id === renameId) : null
        if (!note) return null
        return (
          <Modal open onClose={() => setRenameId(null)} title={fn.rename} className="cnote-memo">
            <EditField
              value={renameVal}
              onChange={setRenameVal}
              onSubmit={(v) => saveRename(note.id, v)}
              onCancel={() => setRenameId(null)}
              autoFocus
              placeholder={fn.rename}
              submitLabel={t.common.save}
              submitLeadingIcon="check-bold"
              submitVariant="primary"
              ariaLabel={fn.rename}
            />
          </Modal>
        )
      })()}

      {/* The full-screen editor — one component, reused for new + modify. */}
      <NoteEditor open={editorOpen} note={editorNote} scope={effScope} memberId={face} onClose={() => setEditorOpen(false)} />
    </section>
  )
}
