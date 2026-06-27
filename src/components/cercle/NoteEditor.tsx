import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useOnline } from '../../lib/online'
import { useModal } from '../../lib/useModal'
import { imgUrl } from '../../lib/image'
import { uploadMedia, MediaUnavailableError } from '../../lib/uploadMedia'
import { FAMILY_NOTES_KEY } from '../../lib/queryKeys'
import { type FamilyNote, type NoteScope } from '../../lib/familyNotes'
import { applyFormat, renderNoteBody, type FormatKind } from '../../lib/noteMarkdown'
import { Icon, type IconName } from '../Icon'
import { DrawPad } from '../DrawPad'

// Full-screen iOS-Notes-style editor for « Le cercle » → Notes, reused for BOTH a new
// note and modifying an existing one (#richnotes). Mirrors DrawPad's shell: a portal to
// <body>, `useModal` for Esc/scroll-lock/focus-trap, and a flex column sized to the
// viewport. The body is lightweight Markdown (see lib/noteMarkdown) — a toolbar wraps /
// line-prefixes the textarea selection, and an « Aperçu » toggle renders it.
//
// AUTO-SAVE (iOS-style): closing — back arrow, Esc, or the OS back gesture — commits the
// current { title, body, attachment } via useWrite (so a text note still queues offline);
// a brand-new note left entirely empty is discarded, and clearing an existing note to
// empty deletes it. There is no Cancel.
//
// One optional ATTACHMENT per note (the existing single-media invariant): a photo
// (uploadMedia) or a drawing (DrawPad → png + editable scene). Audio memos stay a
// quick-add on the list, not editable here. R2 unbound (503) → the media controls hide.
type AttachKind = 'image' | 'drawing'

type Fmt = { kind: FormatKind; label: string } & ({ glyph: string; mod?: string } | { icon: IconName })

export function NoteEditor({
  open,
  note,
  scope,
  memberId,
  onClose,
}: {
  open: boolean
  /** null = compose a new note; otherwise edit this one in place. */
  note: FamilyNote | null
  /** Scope for a NEW note (follows the picked face); ignored when editing. */
  scope: NoteScope
  memberId: string | null
  onClose: () => void
}) {
  const t = useT()
  const fn = t.cercle.familyNotes
  const write = useWrite()
  const online = useOnline()

  const rootRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [mediaKind, setMediaKind] = useState<AttachKind | null>(null)
  const [mediaKey, setMediaKey] = useState<string | null>(null)
  const [sceneKey, setSceneKey] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mediaOff, setMediaOff] = useState(false) // R2 unbound → hide attach controls
  const [drawOpen, setDrawOpen] = useState(false)

  // Seed from the note each time the editor opens (or the target note changes).
  useEffect(() => {
    if (!open) return
    setTitle(note?.title ?? '')
    setBody(note?.text ?? '')
    const mk = note && (note.media_kind === 'image' || note.media_kind === 'drawing') ? note.media_kind : null
    setMediaKind(mk)
    setMediaKey(mk ? note!.media_key : null)
    setSceneKey(mk === 'drawing' ? (note?.scene_key ?? null) : null)
    setPreview(false)
  }, [open, note])

  // Commit on close (auto-save). Held in a ref so the stable handleClose passed to
  // useModal always runs the latest state without re-subscribing the Esc handler.
  const commitRef = useRef<() => void>(() => {})
  commitRef.current = () => {
    const ti = title.trim()
    const bo = body.trim()
    const empty = !ti && !bo && !mediaKey
    if (!note) {
      if (empty) return // discard a brand-new, untouched note
      void write('family-notes', {
        method: 'POST',
        body: { title: ti, text: bo, scope, member_id: scope === 'self' ? memberId : null, media_kind: mediaKind, media_key: mediaKey, scene_key: sceneKey },
        affectedKeys: [FAMILY_NOTES_KEY],
      }).catch(() => {})
      return
    }
    if (empty) {
      void write('family-notes', { method: 'DELETE', body: { id: note.id }, affectedKeys: [FAMILY_NOTES_KEY] }).catch(() => {})
      return
    }
    void write('family-notes', {
      method: 'PATCH',
      body: { id: note.id, title: ti, text: bo, media_kind: mediaKind, media_key: mediaKey, scene_key: sceneKey },
      affectedKeys: [FAMILY_NOTES_KEY],
    }).catch(() => {})
  }

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const handleClose = useRef(() => {
    commitRef.current()
    onCloseRef.current()
  }).current

  useModal(rootRef, handleClose, { open })

  if (!open) return null

  // Apply a toolbar action to the textarea selection, then restore the cursor.
  function format(kind: FormatKind) {
    const ta = taRef.current
    if (!ta) return
    const r = applyFormat(body, ta.selectionStart, ta.selectionEnd, kind)
    setBody(r.value)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(r.selStart, r.selEnd)
    })
  }

  async function onPhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0]
    e.currentTarget.value = ''
    if (!file) return
    setBusy(true)
    try {
      const key = await uploadMedia('note-media', file, { resize: true })
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
      // PNG + JSON scene ride note-media as-is (no resize — keep transparency / the raw scene).
      const key = await uploadMedia('note-media', png, { resize: false, filename: 'drawing.png' })
      let sk: string | null = null
      if (scene) {
        try {
          sk = await uploadMedia('note-media', new Blob([scene], { type: 'application/json' }), { resize: false })
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

  const FORMATS: Fmt[] = [
    { kind: 'bold', glyph: 'B', mod: 'b', label: fn.fmtBold },
    { kind: 'italic', glyph: 'I', mod: 'i', label: fn.fmtItalic },
    { kind: 'strike', glyph: 'S', mod: 's', label: fn.fmtStrike },
    { kind: 'heading', glyph: 'H', mod: 'h', label: fn.fmtHeading },
    { kind: 'bullet', glyph: '•', label: fn.fmtBullet },
    { kind: 'numbered', glyph: '1.', label: fn.fmtNumbered },
    { kind: 'check', icon: 'check-square-bold', label: fn.fmtCheck },
    { kind: 'quote', glyph: '❝', label: fn.fmtQuote },
  ]

  return createPortal(
    <div ref={rootRef} className="note-editor" role="dialog" aria-modal="true" aria-label={note ? fn.editorEdit : fn.editorNew}>
      <header className="note-editor__head">
        <button type="button" className="note-editor__back" onClick={handleClose} aria-label={fn.done}>
          <Icon name="caret-left-bold" size={20} />
        </button>
        <span className="note-editor__heading">{note ? fn.editorEdit : fn.editorNew}</span>
        <button type="button" className={'note-editor__toggle' + (preview ? ' is-on' : '')} onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
          {preview ? fn.writeTab : fn.preview}
        </button>
      </header>

      <input
        className="input note-editor__title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={fn.titlePlaceholder}
        aria-label={fn.titlePlaceholder}
        maxLength={120}
        autoFocus={!note}
      />

      {!preview && (
        <div className="note-editor__toolbar" role="group" aria-label={fn.format}>
          {FORMATS.map((f) => (
            <button key={f.kind} type="button" className="note-editor__fmt" onClick={() => format(f.kind)} aria-label={f.label} title={f.label}>
              {'icon' in f ? <Icon name={f.icon} size={18} /> : <span className={'note-editor__glyph' + (f.mod ? ' note-editor__glyph--' + f.mod : '')} aria-hidden="true">{f.glyph}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="note-editor__stage">
        {preview ? (
          <div className="note-editor__previewbody note-md">{body.trim() ? renderNoteBody(body) : <p className="note-editor__empty mono">{fn.empty}</p>}</div>
        ) : (
          <textarea
            ref={taRef}
            className="note-editor__body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={fn.placeholder}
            aria-label={fn.editorNew}
            maxLength={2000}
          />
        )}
      </div>

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
