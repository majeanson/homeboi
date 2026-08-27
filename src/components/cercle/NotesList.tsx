import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useT, useLang } from '../../i18n'
import { formatDay, formatDayTime } from '../../lib/format'
import { useWrite } from '../../lib/write'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { FAMILY_NOTES_KEY } from '../../lib/queryKeys'
import { type FamilyNote, sortNotes } from '../../lib/familyNotes'
import { reorderPatches } from '../../lib/reorder'
import { usePointerDnd, DragGhost, DND_HOLD_MS } from '../../lib/dnd'
import { imgUrl } from '../../lib/image'
import { InlineIcon } from '../Icon'
import { RowActions } from '../RowActions'
import { DragPill } from '../DragPill'
import { EditField } from '../EditField'
import { Modal } from '../Modal'
import { ZoomableImg } from '../ZoomableImg'
import type { MemberFace } from '../MemberSwitcher'
import { plainText, renderNoteBody, toggleCheckAt } from '../../lib/noteMarkdown'
import { scrollBehavior } from '../../lib/motion'

// The ONE cercle-notes ROW LIST (the iOS-grouped `.cnote-list` anatomy), extracted from
// CercleNotes so the board's « Notes (cercle) » card renders the SAME rows in the same
// way — expand-to-read in place, tap-to-play audio, tappable checklists, pencil/trash,
// and hold-to-drag reorder. The caller keeps what differs per surface: which notes
// (face/search filter), the composer, the empty copy, and hosting the NoteEditor.
//
//   • MULTI-EXPAND: several notes can be open at once (a Set, not a single id) — a
//     wall tablet showing two routines' notes side by side shouldn't close one to
//     read the other.
//   • REORDER: the shared hold-to-drag (usePointerDnd + DragPill grip, the itinerary /
//     La liste gesture). A drop renumbers the DISPLAYED list 0..n-1 via one position
//     PATCH per moved row (lib/reorder); the API's ORDER BY pins it. Manual order is
//     household-wide (migration 0111): a Maisonnée note keeps one position everywhere.
//     `canReorder` lets the caller drop the grips while a search narrows the list —
//     reordering a filtered subset would scramble what it pins.
//   • Deletion goes through useDeferredRemoval (undo toast, no poll flash-back);
//     an audio memo's pencil renames it here (caption = title), every other note's
//     pencil hands off to the caller's editor (onEdit).
export function NotesList({
  notes,
  faces,
  readOnly,
  canReorder = true,
  compact = false,
  onEdit,
  focusId,
  onFocused,
  empty,
}: {
  /** The notes to show (already face/search-filtered) — UNsorted; the list owns the
   *  one display order (sortNotes: manual position, then newest-first). */
  notes: FamilyNote[]
  /** Household faces — author tint + scope-chip names. */
  faces: MemberFace[]
  readOnly?: boolean
  /** Offer the drag grips (default true). Pass false while a search filters the list. */
  canReorder?: boolean
  /** The board-card GLANCE face (compact-rows pass): no grip, no tint dot, no scope
   *  chip, no pencil/trash — the row spends its whole width on the text ("who" is the
   *  title's author tint). Read-only affordances stay: expand-to-read, audio play,
   *  thumbnails, tappable checklists. Acting on a note lives in Le cercle ▸ Notes. */
  compact?: boolean
  /** Open the caller's full-screen NoteEditor on this note (non-audio pencil). */
  onEdit?: (n: FamilyNote) => void
  /** Deep-link focus (§892): when this note is in `notes`, expand + scroll + pulse it
   *  once, then signal onFocused so the caller clears its one-shot id. */
  focusId?: string | null
  onFocused?: () => void
  /** Rendered instead of the list when nothing is visible. */
  empty?: ReactNode
}) {
  const t = useT()
  const { lang } = useLang()
  const write = useWrite()
  const fn = t.cercle.familyNotes
  const ro = !!readOnly

  const sorted = useMemo(() => sortNotes(notes), [notes])
  const removal = useDeferredRemoval(FAMILY_NOTES_KEY)
  const shown = removal.visible(sorted)

  // A long note is read inline by EXPANDING it in place (tap the body to open/close);
  // SEVERAL can be open at once — each tap toggles its own row only.
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set())
  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Tiny rename dialog for an AUDIO memo (its caption is stored as the title); every
  // other note kind is edited in the caller's full editor.
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Deep-link focus: when the note lands in the visible list (the caller may first
  // switch the face so it becomes visible), expand it, scroll to it, and pulse it
  // once. `flashId` outlives the caller's one-shot focusId so the ring still plays.
  const noteRefs = useRef<Record<string, HTMLElement | null>>({})
  const [flashId, setFlashId] = useState<string | null>(null)
  useEffect(() => {
    if (!focusId) return
    const n = sorted.find((x) => x.id === focusId)
    if (!n) return // not visible yet (face switch / next poll) — wait
    setExpandedIds((prev) => new Set(prev).add(n.id))
    setFlashId(n.id)
    requestAnimationFrame(() => noteRefs.current[n.id]?.scrollIntoView({ block: 'center', behavior: scrollBehavior() }))
    onFocused?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, sorted])
  // Drop the highlight after the pulse so the ring doesn't linger permanently.
  useEffect(() => {
    if (!flashId) return
    const timer = setTimeout(() => setFlashId(null), 3000)
    return () => clearTimeout(timer)
  }, [flashId])

  // Reorder — the shared hold-to-drag. A drop renumbers the DISPLAYED rows 0..n-1
  // (lib/reorder skips rows already stored at their index — fewer writes).
  const dnd = usePointerDnd({
    onDrop: (fromId, toZone) => {
      for (const patch of reorderPatches(shown, Number(fromId), Number(toZone)))
        void write('family-notes', { method: 'PATCH', body: patch, affectedKeys: [FAMILY_NOTES_KEY] }).catch(() => {})
    },
    holdMs: DND_HOLD_MS,
  })
  const grips = !ro && !compact && canReorder && shown.length > 1
  // Pencil/trash ride the roomy rows only. Compact is a READING face — the board's
  // glance card and « Les notes » in its lean mode both hand acting off elsewhere
  // (the section, and AVANCÉ respectively), and both mirrors are real controls, not
  // touch-only gestures.
  const rowActions = !ro && !compact

  const colorOf = (id: string | null) => faces.find((f) => f.id === id)?.colour ?? null
  const nameOf = (id: string | null) => faces.find((f) => f.id === id)?.name ?? null

  function remove(n: FamilyNote) {
    removal.remove([n.id], fn.deleted, () =>
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

  if (shown.length === 0) return <>{empty ?? null}</>

  return (
    <>
      <ul className={'cnote-list' + (compact ? ' cnote-list--compact' : '')}>
        {shown.map((n, idx) => {
          const tint = colorOf(n.author_member_id) ?? 'var(--teal-deep, #2a8f85)'
          const css = { '--note-tint': tint } as React.CSSProperties
          const media = n.media_kind && n.media_key ? n.media_kind : null
          const scopeChip = n.member_id === null ? fn.forFamily : (nameOf(n.member_id) ?? fn.scopeSelf)
          // Collapsed the row stays calm with the day alone; expanded it IS the note's
          // detail view, so it reads the full moment (two notes of the same afternoon
          // are otherwise indistinguishable).
          //
          // A RUN of the same day says the date once. Notes arrive in bursts, so the
          // identical « mar. 14 nov. » was repeating down every row and eating the
          // front of each preview line — on the one page whose brief is "maximum note
          // per pixel" (LEAN.md pattern 6: repeated per-row furniture, said once). The
          // date still leads whenever the day CHANGES, which is the only place it
          // carried information. An expanded row is a detail view and stays
          // self-contained: it always prints its own full moment.
          const expandedNow = expandedIds.has(n.id)
          const sameDayAsAbove = idx > 0 && formatDay(shown[idx - 1].created_at, lang) === formatDay(n.created_at, lang)
          const when = expandedNow
            ? formatDayTime(n.created_at, lang)
            : sameDayAsAbove
              ? ''
              : formatDay(n.created_at, lang)
          // Join only the halves that exist — « date · aperçu », « date », « aperçu »,
          // or nothing. Never a dangling separator with nothing after it.
          const metaOf = (p: string) => [when, p].filter(Boolean).join(' · ')
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
          const expanded = expandedIds.has(n.id)

          return (
            <DragPill
              key={n.id}
              dnd={dnd}
              index={idx}
              label={title}
              showGrip={grips}
              nodeRef={(el: HTMLElement | null) => {
                noteRefs.current[n.id] = el
              }}
              className={'cnote' + (expanded ? ' cnote--expanded' : '') + (flashId === n.id ? ' is-focus' : '')}
              gripClassName="cnote__grip"
              style={css}
            >
              {/* Visual notes show a tappable thumbnail; text/audio show a tint dot.
                  Compact drops the text-note dot (the title tint already says whose it
                  is) but keeps the audio one — it's the row's only "this plays" cue. */}
              {media === 'drawing' || media === 'image' ? (
                <ZoomableImg className="cnote__thumb" src={imgUrl(n.media_key!)} alt={title} />
              ) : compact && media !== 'audio' ? null : (
                <span className="cnote__dot" aria-hidden="true">
                  {media === 'audio' ? <InlineIcon name="play-bold" size={14} /> : null}
                </span>
              )}

              {/* The body: tapping a text note expands/collapses it (to read long notes
                  in place); an audio note plays it. Editing is the pencil, not the tap. */}
              {media === 'audio' ? (
                <button type="button" className="cnote__main" onClick={() => playClip(n.media_key!)} aria-label={fn.memo}>
                  <span className="cnote__title">{title}</span>
                  {metaOf(preview) && <span className="cnote__meta mono">{metaOf(preview)}</span>}
                </button>
              ) : expandable ? (
                <button
                  type="button"
                  className="cnote__main"
                  onClick={() => toggleExpand(n.id)}
                  aria-expanded={expanded}
                  aria-label={expanded ? fn.collapse : fn.expand}
                >
                  <span className="cnote__titlerow">
                    <span className="cnote__title">{title}</span>
                    <span className="cnote__caret" aria-hidden="true">
                      <InlineIcon name={expanded ? 'caret-up-bold' : 'caret-down-bold'} size={14} />
                    </span>
                  </span>
                  {metaOf(expanded ? '' : preview) && (
                    <span className="cnote__meta mono">{metaOf(expanded ? '' : preview)}</span>
                  )}
                </button>
              ) : (
                <span className="cnote__main cnote__main--static">
                  <span className="cnote__title">{title}</span>
                  {metaOf(preview) && <span className="cnote__meta mono">{metaOf(preview)}</span>}
                </span>
              )}

              {!compact && <span className="cnote__chip mono">{scopeChip}</span>}

              {rowActions && (
                // THE shared ✏️/🗑 pair (44px targets — the hand-rolled `.cnote__act`
                // twins were 32px, under the touch-target rule). One pencil per note:
                // an audio memo renames (caption = title); every other note opens the
                // full editor (title + body + attachment).
                <RowActions
                  className="cnote__actions"
                  size={15}
                  onEdit={
                    media === 'audio'
                      ? () => { setRenameId(n.id); setRenameVal(n.title) }
                      : onEdit
                        ? () => onEdit(n)
                        : undefined
                  }
                  editLabel={media === 'audio' ? fn.rename : fn.edit}
                  onDelete={() => remove(n)}
                  deleteLabel={fn.delete}
                />
              )}

              {/* Expanded: the whole note rendered from Markdown, checklists tappable
                  (read-only surfaces render them inert — a guest write would 403). */}
              {expanded && (
                <div className="cnote__full note-md">
                  {renderNoteBody(n.text, ro ? undefined : { onToggleCheck: (i) => toggleCheck(n, i) })}
                </div>
              )}
            </DragPill>
          )
        })}
      </ul>
      <DragGhost ghost={dnd.ghost} />

      {/* Tiny rename dialog for an audio memo (its caption is the title). */}
      {(() => {
        const note = renameId ? notes.find((n) => n.id === renameId) : null
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
    </>
  )
}
