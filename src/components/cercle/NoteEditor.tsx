import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useNotice } from '../../lib/toast'
import { api } from '../../lib/api'
import { useOnline } from '../../lib/online'
import { useModal } from '../../lib/useModal'
import { imgUrl } from '../../lib/image'
import { uploadMedia, MediaUnavailableError } from '../../lib/uploadMedia'
import { FAMILY_NOTES_KEY } from '../../lib/queryKeys'
import { type FamilyNote, type NoteScope, seedMd } from '../../lib/familyNotes'
import type { MemberFace } from '../MemberSwitcher'
import { FaceSelect } from '../FaceSelect'
import { Icon } from '../Icon'
import { DrawPad } from '../DrawPad'

// Full-screen iOS-Notes-style editor for « Le cercle » → Notes, reused for BOTH a new
// note and modifying an existing one (#richnotes). Mirrors DrawPad's shell: a portal to
// <body> + `useModal` (Esc/scroll-lock/focus-trap), flex column sized to the viewport.
//
// The body is the ProseMirror-backed NoteEditorTiptap (lazy-loaded — a real dependency,
// only paid for when a note is actually opened). No title field: the first line IS the
// title (iOS style) — the row list already derives its heading that way, and this
// editor never writes one. Storage stays Markdown (lib/noteTiptap converts on seed/save)
// so the row list + search keep working unchanged.
//
// AUTO-SAVE (iOS-style): closing — back arrow, Esc, OS back gesture — commits the current
// { body, scope, attachment }; a brand-new empty note is discarded, an emptied existing
// note is deleted. No Cancel. One optional photo/drawing attachment (uploadMedia /
// DrawPad); audio memos stay a quick-add (the ＋ FAB's long-press).
//
// "POUR QUI" (re-scope): a face picker lets you choose who the note is FOR — a member
// (a personal "Moi" note) or the whole Maisonnée — seeded from the picked face for a new
// note and from the note's own scope when editing. Changing it moves the note between
// lists on save (POST/PATCH carry scope + member_id); the author is never rewritten.
type AttachKind = 'image' | 'drawing'

const NoteEditorTiptap = lazy(() => import('./NoteEditorTiptap'))

export function NoteEditor({
  open,
  note,
  scope,
  memberId,
  faces,
  onClose,
}: {
  open: boolean
  /** null = compose a new note; otherwise edit this one in place. */
  note: FamilyNote | null
  /** Initial scope for a NEW note (follows the picked face); the "Pour qui" picker can change it. */
  scope: NoteScope
  memberId: string | null
  /** Household faces for the "Pour qui" picker — pre-resolved (photoUrl included), so
   *  BOTH member shapes can host the editor (the cercle's camelCase Member and the
   *  board's snake_case row map to the same MemberFace). */
  faces: MemberFace[]
  onClose: () => void
}) {
  const t = useT()
  const fn = t.cercle.familyNotes
  const write = useWrite()
  const notice = useNotice()
  const online = useOnline()

  const rootRef = useRef<HTMLDivElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  // Every R2 key we UPLOADED during this editing session. On close we free any that
  // the saved note won't reference — an in-editor replace/remove/discard would
  // otherwise orphan the superseded blob in R2 (it was never written into a row, so
  // no server-side row-delete ever frees it). Reset each time the editor (re)opens.
  const sessionKeysRef = useRef<Set<string>>(new Set())

  // "Pour qui" — who the note is FOR: a member id (personal "Moi" note) or null = Maisonnée.
  const [forMember, setForMember] = useState<string | null>(null)
  const [mediaKind, setMediaKind] = useState<AttachKind | null>(null)
  const [mediaKey, setMediaKey] = useState<string | null>(null)
  const [sceneKey, setSceneKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mediaOff, setMediaOff] = useState(false)
  const [drawOpen, setDrawOpen] = useState(false)

  // The body's live Markdown serializer, handed to us by NoteEditorTiptap.
  const bodyMdRef = useRef<(() => string) | null>(null)
  function currentMd(): string {
    return bodyMdRef.current?.() ?? note?.text ?? ''
  }

  // Snapshot of an EXISTING note's opening state, so closing without a real edit can
  // skip the write entirely — see `commitRef` below.
  const initialRef = useRef<{ md: string; forMember: string | null; mediaKind: AttachKind | null; mediaKey: string | null; sceneKey: string | null } | null>(null)

  // Seed from the note each time the editor opens (or the target note changes).
  useEffect(() => {
    if (!open) return
    // Editing → the note's own scope; new note → the picked face (scope/memberId props).
    const initForMember = note ? note.member_id : scope === 'self' ? memberId : null
    const mk = note && (note.media_kind === 'image' || note.media_kind === 'drawing') ? note.media_kind : null
    const initMediaKey = mk ? note!.media_key : null
    const initSceneKey = mk === 'drawing' ? (note?.scene_key ?? null) : null
    setForMember(initForMember)
    setMediaKind(mk)
    setMediaKey(initMediaKey)
    setSceneKey(initSceneKey)
    sessionKeysRef.current = new Set() // fresh editing session — nothing uploaded yet
    initialRef.current = note
      ? { md: seedMd(note).trim(), forMember: initForMember, mediaKind: mk, mediaKey: initMediaKey, sceneKey: initSceneKey }
      : null
  }, [open, note, scope, memberId])

  // Commit on close (auto-save). Held in a ref so the stable handleClose passed to
  // useModal always runs the latest state without re-subscribing the Esc handler.
  const commitRef = useRef<() => void>(() => {})
  commitRef.current = () => {
    // Auto-save used to be entirely silent: no "enregistré", and — worse — the
    // `.catch(() => {})` on each branch swallowed a REAL server rejection too, so a
    // note could close and simply not exist, with nothing said. These two say which
    // happened, and name the offline case as kept rather than sent.
    //
    // The toast bar is the only channel left because the editor is CLOSING as this
    // runs — and that is also why it is reachable: a notice raised from INSIDE a
    // full-screen scene would be painted underneath it (.undo-toast is z-index 40),
    // the trap cook mode and the recipe sheet both hit.
    const said = (r: { queued?: boolean }) => notice(r.queued ? fn.savedQueued : fn.saved)
    const failed = () => notice(fn.saveFailed)
    // The title is always DERIVED (the rows fall back to the body's first line), so
    // it saves empty — the words you typed are the heading.
    const bo = currentMd().trim()
    const empty = !bo && !mediaKey
    // The "Pour qui" pick → wire scope: a member id = a personal note, null = Maisonnée.
    const effScope: NoteScope = forMember ? 'self' : 'family'

    // Free any blob we uploaded this session that the saved note won't reference —
    // a replace/remove/discard leaves the superseded upload orphaned in R2 (it was
    // never written into a row, so no server-side row-delete frees it). The note's
    // OWN persisted keys aren't in this set, so the server still owns those (it frees
    // them on PATCH/DELETE). Best-effort, fire-and-forget — a leak beats a failed save.
    const keptKeys = new Set<string>()
    if (!empty && mediaKind && mediaKey) {
      keptKeys.add(mediaKey)
      if (sceneKey) keptKeys.add(sceneKey)
    }
    sessionKeysRef.current.forEach((k) => {
      if (!keptKeys.has(k)) void api('note-media', { method: 'DELETE', body: { key: k } }).catch(() => {})
    })
    // Opening a note to READ it must not act on it. Auto-save used to write
    // unconditionally, and the server always stamps `updated_at` — so merely tapping
    // a note open and closing it again (no edit at all) silently bumped it to the
    // top of the list on the next sort, with nothing to explain why.
    if (note && !empty) {
      const init = initialRef.current
      if (init && bo === init.md && forMember === init.forMember && mediaKind === init.mediaKind && mediaKey === init.mediaKey && sceneKey === init.sceneKey) {
        return
      }
    }
    if (!note) {
      if (empty) return // discard a brand-new, untouched note
      void write('family-notes', {
        method: 'POST',
        body: { title: '', text: bo, scope: effScope, member_id: forMember, media_kind: mediaKind, media_key: mediaKey, scene_key: sceneKey },
        affectedKeys: [FAMILY_NOTES_KEY],
      })
        .then(said)
        .catch(failed)
      return
    }
    if (empty) {
      // Emptied to nothing = deleted. Deliberately NOT announced as "saved" — the
      // row is gone, and saying so would read as a confirmation of the opposite.
      void write('family-notes', { method: 'DELETE', body: { id: note.id }, affectedKeys: [FAMILY_NOTES_KEY] }).catch(() => {})
      return
    }
    void write('family-notes', {
      method: 'PATCH',
      body: { id: note.id, title: '', text: bo, scope: effScope, member_id: forMember, media_kind: mediaKind, media_key: mediaKey, scene_key: sceneKey },
      affectedKeys: [FAMILY_NOTES_KEY],
    })
      .then(said)
      .catch(failed)
  }

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const handleClose = useRef(() => {
    commitRef.current()
    onCloseRef.current()
  }).current

  useModal(rootRef, handleClose, { open })

  if (!open) return null

  async function onPhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0]
    e.currentTarget.value = ''
    if (!file) return
    setBusy(true)
    try {
      const key = await uploadMedia('note-media', file, { resize: true })
      sessionKeysRef.current.add(key) // track for cleanup if later replaced/removed/discarded
      setMediaKind('image')
      setMediaKey(key)
      setSceneKey(null)
    } catch (err) {
      if (err instanceof MediaUnavailableError) setMediaOff(true)
    } finally {
      setBusy(false)
    }
  }
  async function onDrawSave(png: Blob, scene: string) {
    setDrawOpen(false)
    setBusy(true)
    try {
      const key = await uploadMedia('note-media', png, { resize: false, filename: 'drawing.png' })
      sessionKeysRef.current.add(key) // track for cleanup if later replaced/removed/discarded
      let sk: string | null = null
      if (scene) {
        try {
          sk = await uploadMedia('note-media', new Blob([scene], { type: 'application/json' }), { resize: false })
          sessionKeysRef.current.add(sk)
        } catch {
          /* scene optional — the PNG stands alone */
        }
      }
      setMediaKind('drawing')
      setMediaKey(key)
      setSceneKey(sk)
    } catch (err) {
      if (err instanceof MediaUnavailableError) setMediaOff(true)
    } finally {
      setBusy(false)
    }
  }
  function removeMedia() {
    setMediaKind(null)
    setMediaKey(null)
    setSceneKey(null)
  }

  return createPortal(
    <div ref={rootRef} className="note-editor" role="dialog" aria-modal="true" aria-label={note ? fn.editorEdit : fn.editorNew}>
      <header className="note-editor__head">
        <button type="button" className="note-editor__back" onClick={handleClose} aria-label={fn.done}>
          <Icon name="caret-left-bold" size={20} />
        </button>
        <span className="note-editor__heading">{note ? fn.editorEdit : fn.editorNew}</span>
      </header>

      {/* "Pour qui" — re-scope the note to a member ("Moi") or the whole Maisonnée. */}
      <div className="note-editor__scope">
        <span className="note-editor__scopelabel mono">{fn.forWhom}</span>
        <FaceSelect
          faces={faces}
          value={forMember}
          onChange={setForMember}
          allLabel={fn.scopeFamily}
          ariaLabel={fn.forWhom}
        />
      </div>

      {/* The body's own chrome slots (a .note-editor__toolbar row + .note-editor__stage
          scroller) so the keyboard-fit CSS (core.css « Keyboard fit ») and the global
          caret-follow apply unchanged. While the lazy chunk loads, an empty stage keeps
          the shell's layout stable. */}
      <Suspense fallback={<div className="note-editor__stage" />}>
        <NoteEditorTiptap
          initialMd={seedMd(note)}
          getMdRef={bodyMdRef}
          autoFocus={!note}
          ariaLabel={note ? fn.editorEdit : fn.editorNew}
        />
      </Suspense>

      {!mediaOff && (
        <div className="note-editor__media">
          {mediaKey ? (
            <div className="note-editor__attach">
              <img src={imgUrl(mediaKey)} alt="" className="note-editor__attachimg" />
              <button type="button" className="btn btn--ghost" onClick={() => (mediaKind === 'drawing' ? setDrawOpen(true) : photoInputRef.current?.click())} disabled={busy || (mediaKind === 'image' && !online)}>
                <Icon name="pencil-simple-bold" size={16} /> {mediaKind === 'drawing' ? fn.attachDrawing : fn.attachPhoto}
              </button>
              <button type="button" className="btn btn--ghost note-editor__attachdel" onClick={removeMedia} disabled={busy}>
                <Icon name="trash-bold" size={16} /> {fn.attachRemove}
              </button>
            </div>
          ) : (
            <>
              <button type="button" className="btn btn--ghost" onClick={() => photoInputRef.current?.click()} disabled={busy || !online}>
                <Icon name="image-square-bold" size={18} /> {fn.attachPhoto}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setDrawOpen(true)} disabled={busy}>
                <Icon name="pencil-simple-bold" size={18} /> {fn.attachDrawing}
              </button>
            </>
          )}
        </div>
      )}

      <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={onPhotoFile} aria-hidden="true" tabIndex={-1} />

      {drawOpen && (
        <DrawPad
          open
          onCancel={() => setDrawOpen(false)}
          onSave={onDrawSave}
          initial={mediaKind === 'drawing' && mediaKey ? imgUrl(mediaKey) : undefined}
          initialSceneUrl={mediaKind === 'drawing' && sceneKey ? imgUrl(sceneKey) : undefined}
        />
      )}
    </div>,
    document.body,
  )
}
