import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { ApiError, isStatus } from '../lib/api'
import { imgUrl } from '../lib/image'
import { uploadMedia, MediaUnavailableError } from '../lib/uploadMedia'
import { Icon } from './Icon'
import { Cluster } from './Layout'
import { StatusMessage } from './StatusMessage'
import { DrawPad } from './DrawPad'
import { useDrawingToRoutine } from '../lib/drawingToRoutine'
import { useKeepInGalleryToast } from '../lib/drawingGallery'

// « Joindre » — the ONE way to hang a voice memo (#38), a drawing (#14) or a photo
// (#13) onto whatever you're writing. It replaces `MemoControls`, which rendered a
// row of full-width buttons BESIDE the text field and, on capture, threw the typed
// text away (it POSTed `text: ''`). Two problems that fix each other:
//
//   • The three buttons read as peers of the field's dictation mic, but the mic
//     turns speech INTO the text while « Mémo vocal » recorded a clip INSTEAD of it.
//     Same microphone glyph, opposite meanings. The clip now wears `waveform-bold`,
//     lives behind one 📎 inside the field box, and the mic keeps the mic.
//   • Every endpoint that takes a memo (notes, family-notes, mots, trip-notes)
//     already accepts text AND media on one row — `if (!text && !(kind && mediaKey))`.
//     So there was never a reason to discard the text.
//
// STAGE-ONLY, on purpose. MemoControls had a POST mode (it wrote the note itself)
// and a STAGE mode (Postbox: upload, hand the key back, let the host submit). Only
// the second composes with a text field, so it is now the only mode: this hook
// uploads the blob, holds the resulting R2 key as a draft, and exposes `body` for
// the host's single POST. The host owns the write — which also means it keeps
// useWrite's offline outbox instead of MemoControls' bare `api()` call.
//
// Wiring (all four composers do exactly this):
//     const memo = useMemoAttach({ mediaEndpoint: 'note-media' })
//     <EditField … allowEmpty={!!memo.draft} boxActions={memo.attachButton}>
//       {memo.panel}
//     </EditField>
//     await write('notes', { body: { text, ...memo.body } }); memo.reset()
//
// R2 unbound → `uploadMedia` 503s → `hidden` goes true and BOTH the 📎 and the panel
// render nothing, so the text-only path keeps working (the long-standing contract).
const MAX_REC_MS = 30_000

/** An uploaded-but-not-yet-committed memo. `body` turns this into POST fields. */
export type StagedMemo =
  | { kind: 'audio'; key: string }
  | { kind: 'drawing'; key: string; sceneKey?: string }
  | { kind: 'image'; key: string }

export interface MemoAttachOptions {
  /** Which endpoint the media BLOB uploads to. Default the board's `note-media`. */
  mediaEndpoint?: string
  /** DrawPad autosave-draft slot; distinct per surface so drafts don't collide. */
  drawDraftId?: string
  /** The photo action: draw OVER a chosen photo (the board default), or attach the
   *  file straight (a guest's photo message, where there's no pad to open). */
  photoMode?: 'draw' | 'direct'
  /** Offer a photo chip at all. Voyage says no: its « Joindre un document » chip
   *  (DocUploadButton) already takes images, so a second photo door would duplicate it. */
  photo?: boolean
  /** Offer « Épingler dans mes dessins » / « En faire une routine » on the pad.
   *  Household surfaces only — a guest's drawing is headed for a message. */
  gallery?: boolean
  /** Label override for the record chip (Postbox says « Enregistrer un mot »). */
  recordLabel?: string
  /** Label override for the photo chip. */
  photoLabel?: string
}

export interface MemoAttachment {
  /** R2 is unbound — render no attach affordance at all. */
  hidden: boolean
  /** The staged memo, or null. Feed into EditField's `allowEmpty`. */
  draft: StagedMemo | null
  /** Uploading / recording — hosts disable their submit on this. */
  busy: boolean
  /** POST fields for the host's single write. `{}` when nothing is attached. */
  body: Record<string, unknown>
  /** Drop the staged memo (after a successful submit, or on « Retirer »). */
  reset: () => void
  /** The 📎, for EditField's `boxActions`. */
  attachButton: ReactNode
  /** Chips + the attached preview + the pad, for EditField's children. */
  panel: ReactNode
}

export function useMemoAttach({
  mediaEndpoint = 'note-media',
  drawDraftId = 'memo',
  photoMode = 'draw',
  photo = true,
  gallery = true,
  recordLabel,
  photoLabel,
}: MemoAttachOptions = {}): MemoAttachment {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<StagedMemo | null>(null)
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draw, setDraw] = useState(false)
  const [drawPhoto, setDrawPhoto] = useState(false) // pad opened straight into the photo flow (#14b)
  const [hidden, setHidden] = useState(false) // R2 unbound (503) → no media here
  const [micDenied, setMicDenied] = useState(false) // getUserMedia rejected → say so, don't fail silent
  const toRoutine = useDrawingToRoutine()
  const keepInGallery = useKeepInGalleryToast()
  const recRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  // While recording, flag the body so the shell drops the ＋ FAB: it floats
  // bottom-right OVER the composer, and you can't quick-add mid-record anyway.
  // Mirrors how `.kb-open` hides the FAB while typing. Cleared on stop + unmount.
  useEffect(() => {
    if (!recording) return
    document.body.classList.add('is-recording')
    return () => document.body.classList.remove('is-recording')
  }, [recording])

  // Stop a still-open mic if the composer unmounts mid-record (a sheet closed, a
  // route changed). Without this the track stays hot and the OS keeps the mic
  // indicator lit — the same "under a finger only" rule AskSheet enforces.
  useEffect(
    () => () => {
      try {
        streamRef.current?.getTracks().forEach((tr) => tr.stop())
      } catch {
        /* already stopped */
      }
    },
    [],
  )

  // Upload one captured blob (images resized, audio/drawings raw) through the
  // canonical uploadMedia path and hold the key. Nothing is POSTed here — the host
  // commits it, so the write rides useWrite's offline outbox.
  async function capture(kind: StagedMemo['kind'], blob: Blob, scene = '') {
    setBusy(true)
    try {
      const key = await uploadMedia(mediaEndpoint, blob, { resize: kind === 'image' })
      // A drawing also persists its editable scene (#1) so it can be re-opened and
      // added to losslessly — best-effort; the PNG stands on its own if it fails.
      let sceneKey: string | undefined
      if (scene) {
        try {
          sceneKey = await uploadMedia(mediaEndpoint, new Blob([scene], { type: 'application/json' }), { resize: false })
        } catch {
          /* scene optional */
        }
      }
      setDraft(kind === 'drawing' ? { kind, key, sceneKey } : { kind, key })
      setOpen(false)
    } catch (e) {
      if (e instanceof MediaUnavailableError || isStatus(e, 503)) setHidden(true)
      else if (!(e instanceof ApiError)) throw e
    } finally {
      setBusy(false)
    }
  }

  async function onPhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0]
    e.currentTarget.value = ''
    if (file) await capture('image', file)
  }

  function stopStream() {
    try {
      streamRef.current?.getTracks().forEach((tr) => tr.stop())
    } catch {
      /* already stopped */
    }
    streamRef.current = null
  }

  async function startRec() {
    if (busy || recording) return
    setMicDenied(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const rec = new MediaRecorder(stream)
      const chunks: BlobPart[] = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      rec.onstop = () => {
        stopStream()
        setRecording(false)
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
        if (blob.size > 0) void capture('audio', blob)
      }
      recRef.current = rec
      rec.start()
      setRecording(true)
      window.setTimeout(() => {
        if (recRef.current?.state === 'recording') recRef.current.stop()
      }, MAX_REC_MS)
    } catch {
      // Mic denied / unavailable — say so (a written note still works) rather than
      // swallowing it: this control is shared by every composer (#554).
      setMicDenied(true)
    }
  }

  function stopRec() {
    if (recRef.current?.state === 'recording') recRef.current.stop()
  }

  const canRecord =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

  // Dropping a staged memo leaves its blob in R2 unreferenced. That's the same
  // trade Postbox has always made: the alternative is a delete round-trip on a
  // draft the user may re-attach a second later. Orphans are swept with the note.
  const reset = () => {
    setDraft(null)
    setOpen(false)
  }

  const body: Record<string, unknown> = draft
    ? {
        media_kind: draft.kind,
        media_key: draft.key,
        scene_key: draft.kind === 'drawing' ? draft.sceneKey ?? null : null,
      }
    : {}

  const attachButton = hidden ? null : (
    <button
      type="button"
      className={'edit-field__icon-btn memo-attach__btn' + (draft ? ' is-on' : '')}
      onClick={() => setOpen((o) => !o)}
      // The 📎 governs the chip row below the field; when a memo is already
      // attached it's the chip's own ✕ that removes it, so this stays a disclosure.
      aria-expanded={open}
      aria-label={t.memo.attach}
      title={t.memo.attach}
      disabled={busy || recording}
    >
      <Icon name="paperclip-bold" size={17} />
    </button>
  )

  const panel = hidden ? null : (
    <div className="memo-attach">
      {/* The three ways to record something. One line of chips, wrapped by Cluster —
          never a bespoke flex row (a fixed flex-basis here would overflow a 360px
          phone instead of wrapping). Hidden once a memo is attached: one per note. */}
      {open && !draft && (
        <Cluster className="memo-attach__picks">
          {canRecord &&
            (recording ? (
              <button type="button" className="btn btn--sm memo-attach__rec" onClick={stopRec}>
                <span className="memo-attach__dot" aria-hidden="true" /> {t.memo.stop}
              </button>
            ) : (
              <button type="button" className="btn btn--sm" onClick={startRec} disabled={busy}>
                <Icon name="waveform-bold" size={16} /> {recordLabel ?? t.memo.record}
              </button>
            ))}
          <button type="button" className="btn btn--sm" onClick={() => setDraw(true)} disabled={busy || recording}>
            <Icon name="pencil-simple-bold" size={16} /> {t.memo.draw}
          </button>
          {photo &&
            (photoMode === 'direct' ? (
              <>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => photoRef.current?.click()}
                  disabled={busy || recording}
                >
                  <Icon name="camera-bold" size={16} /> {photoLabel ?? t.memo.drawPhoto}
                </button>
                <input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => void onPhotoFile(e)} />
              </>
            ) : (
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => setDrawPhoto(true)}
                disabled={busy || recording}
              >
                <Icon name="image-square-bold" size={16} /> {photoLabel ?? t.memo.drawPhoto}
              </button>
            ))}
        </Cluster>
      )}

      {recording && <StatusMessage tone="info">{t.memo.recording}</StatusMessage>}
      {micDenied && <StatusMessage tone="error">{t.memo.micDenied}</StatusMessage>}

      {/* What's attached, and the one way off it. Reads as a chip under the field —
          the note being composed is still the text box, not this. */}
      {draft && (
        <div className="memo-attach__chip">
          {draft.kind === 'audio' ? (
            <button
              type="button"
              className="memo-attach__play"
              onClick={() => void new Audio(imgUrl(draft.key)).play()}
              aria-label={t.memo.playAttached}
              title={t.memo.playAttached}
            >
              <Icon name="play-bold" size={14} />
            </button>
          ) : (
            <img className="memo-attach__thumb" src={imgUrl(draft.key)} alt="" />
          )}
          <span className="memo-attach__label">{t.memo.attached[draft.kind]}</span>
          <button
            type="button"
            className="edit-field__icon-btn edit-field__icon-btn--danger"
            onClick={reset}
            aria-label={t.memo.remove}
            title={t.memo.remove}
          >
            <Icon name="x-bold" size={15} />
          </button>
        </div>
      )}

      <DrawPad
        open={draw || drawPhoto}
        draftId={drawDraftId}
        pickPhotoOnOpen={drawPhoto}
        onCancel={() => {
          setDraw(false)
          setDrawPhoto(false)
        }}
        onSave={(png, scene) => {
          setDraw(false)
          setDrawPhoto(false)
          void capture('drawing', png, scene)
        }}
        // Keeping to the gallery / promoting to a routine are household actions; a
        // guest's staged drawing is headed for a message and does neither.
        onKeep={
          gallery
            ? (png, scene) => {
                setDraw(false)
                setDrawPhoto(false)
                void keepInGallery(png, scene)
              }
            : undefined
        }
        onMakeRoutine={
          gallery
            ? (png, scene) => {
                setDraw(false)
                setDrawPhoto(false)
                void toRoutine(png, scene)
              }
            : undefined
        }
      />
    </div>
  )

  return { hidden, draft, busy: busy || recording, body, reset, attachButton, panel }
}
