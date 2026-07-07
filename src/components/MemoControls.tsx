import { useEffect, useRef, useState } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api, ApiError, isStatus } from '../lib/api'
import { uploadMedia, MediaUnavailableError } from '../lib/uploadMedia'
import { BOARD_KEY } from '../lib/queryKeys'
import { Icon } from './Icon'
import { StatusMessage } from './StatusMessage'
import { DrawPad } from './DrawPad'
import { useDrawingToRoutine } from '../lib/drawingToRoutine'
import { useKeepInGalleryToast } from '../lib/drawingGallery'

// Audio-memo (#38) + drawn-note (#14) controls inside the ＋ "Note rapide" sheet.
// Both create a fridge NOTE carrying an R2 media key (note-media → notes), so they
// ride the same board card + clear flow as a text note — general-audience, tinted
// by the active face but seen by everyone. R2 unbound → 503 → the controls hide
// (typing a note still works). Recording reuses the MediaRecorder pattern from the
// routine voice clips (CardDeckEditor), capped at 30 s for calm.
//
// The same controls are REUSED two ways, so the Record/Draw/(Photo) + MediaRecorder
// + upload plumbing lives in exactly one place:
//   • POST mode (default) — « Le cercle » → Famille "Notes" (CercleNotes) overrides
//     `endpoint`/`affectedKey`/`extraBody`: a media memo POSTs to /api/family-notes
//     with { scope, member_id } and invalidates that list. The board is the default.
//   • STAGE mode — « La boîte aux lettres » (Postbox) passes `onStaged`: a guest can't
//     write the real note, so a memo is only UPLOADED (to `mediaEndpoint`) and its key
//     handed back; the parent holds it as a draft and sends it later with the sender's
//     name. `withPhoto` adds a direct photo-attach button for that flow.
const MAX_REC_MS = 30_000

/** A staged (uploaded-but-not-yet-committed) memo handed back in STAGE mode. */
export type StagedMemo =
  | { kind: 'audio'; key: string }
  | { kind: 'drawing'; key: string; sceneKey?: string }
  | { kind: 'image'; key: string }

export function MemoControls({
  onDone,
  endpoint = 'notes',
  mediaEndpoint = 'note-media',
  affectedKey = BOARD_KEY,
  extraBody,
  onStaged,
  withPhoto = false,
  docUpload,
  recordLabel,
  photoLabel,
  drawDraftId = 'memo',
}: {
  onDone: () => void
  /** POST mode: which endpoint the note POSTs to. Default the board `notes`. */
  endpoint?: string
  /** Which endpoint the media BLOB is uploaded to. Default `note-media`. */
  mediaEndpoint?: string
  /** Query key to invalidate after a successful post. Default BOARD_KEY. */
  affectedKey?: QueryKey
  /** Extra fields merged into the POST body (e.g. { scope, member_id } for family notes). */
  extraBody?: Record<string, unknown>
  /** STAGE mode: when set, a captured memo is only uploaded and handed back here (no
   *  note POST) — the parent owns the draft + eventual submit (e.g. Postbox). */
  onStaged?: (memo: StagedMemo) => void
  /** STAGE mode: also show a direct photo-attach button (a guest photo message). */
  withPhoto?: boolean
  /** POST mode: REPLACE the draw-over-photo button with a direct "attach a
   *  document" picker (image OR PDF — a boarding pass is a file you have, not a
   *  photo you draw over; the « Voyage » composers use this). Each file uploads
   *  via `mediaEndpoint` (a PDF as-is, no resize) and POSTs a media_kind 'image'
   *  note with the file name as its label; `body` merges over `extraBody`
   *  (e.g. { category: 'document' } so it also shows under the Documents tab). */
  docUpload?: { label: string; body?: Record<string, unknown> }
  /** Label override for the record button (default t.memo.record). */
  recordLabel?: string
  /** Label for the photo button when `withPhoto` (default t.memo.drawPhoto). */
  photoLabel?: string
  /** DrawPad autosave-draft slot; distinct per surface so drafts don't collide. */
  drawDraftId?: string
}) {
  const t = useT()
  const qc = useQueryClient()
  const staging = !!onStaged
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draw, setDraw] = useState(false)
  const [drawPhoto, setDrawPhoto] = useState(false) // opened straight into the photo flow (#14b)
  const [hidden, setHidden] = useState(false) // R2 unbound (503) → no media notes here
  const [micDenied, setMicDenied] = useState(false) // getUserMedia rejected → say so, don't fail silent
  const toRoutine = useDrawingToRoutine()
  // Keep into « Mes dessins » with a calm, undoable confirming toast (best-effort).
  const keepInGallery = useKeepInGalleryToast()
  const recRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const docRef = useRef<HTMLInputElement>(null)

  // While recording, flag the body so the shell can drop the ＋ FAB: it floats
  // bottom-right OVER the Record/Stop + Draw/Photo row (esp. on a phone, where the
  // memo controls sit in the FAB's band), and you can't quick-add mid-record anyway.
  // Mirrors how `.kb-open` hides the FAB while typing. Cleared on stop + unmount.
  useEffect(() => {
    if (!recording) return
    document.body.classList.add('is-recording')
    return () => document.body.classList.remove('is-recording')
  }, [recording])

  // Upload one captured memo (image resized, audio/drawing raw) via the canonical
  // uploadMedia path, then either hand it back (STAGE mode) or POST it as a note
  // (POST mode). R2 unbound → the whole control hides; both files shared this exact
  // flow before, so it lives here once.
  async function capture(kind: StagedMemo['kind'], blob: Blob, scene = '') {
    setBusy(true)
    try {
      const key = await uploadMedia(mediaEndpoint, blob, { resize: kind === 'image' })
      // A drawing also persists its editable scene (#1) so it can be re-opened and
      // added to losslessly — best-effort, the PNG stands on its own if it fails.
      let sceneKey: string | undefined
      if (scene) {
        try {
          sceneKey = await uploadMedia(mediaEndpoint, new Blob([scene], { type: 'application/json' }), { resize: false })
        } catch {
          /* scene optional */
        }
      }
      if (onStaged) {
        onStaged(kind === 'drawing' ? { kind, key, sceneKey } : { kind, key })
      } else {
        await api(endpoint, { method: 'POST', body: { media_kind: kind, media_key: key, scene_key: sceneKey, text: '', ...extraBody } })
        qc.invalidateQueries({ queryKey: affectedKey })
        onDone()
      }
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

  // Direct document attach (docUpload, POST mode): image or PDF, several at once —
  // the VoyageDocuments flow, riding this composer's endpoint/extraBody so the file
  // lands in the right slot (a dated itinerary day, a member scope…). A PDF uploads
  // as-is (no image resize); the file NAME becomes the note's label so the row stays
  // legible. R2 unbound → hide, like every other media control here.
  async function onDocFiles(e: React.ChangeEvent<HTMLInputElement>) {
    // Snapshot the FileList BEFORE resetting the input — clearing `value` empties
    // the live list, so iterating it afterwards would see zero files.
    const files = Array.from(e.currentTarget.files ?? [])
    e.currentTarget.value = ''
    if (!docUpload || files.length === 0) return
    setBusy(true)
    try {
      for (const file of files) {
        try {
          const key = await uploadMedia(mediaEndpoint, file, { resize: file.type !== 'application/pdf' })
          await api(endpoint, {
            method: 'POST',
            body: { media_kind: 'image', media_key: key, label: file.name, text: '', ...extraBody, ...docUpload.body },
          })
        } catch (err) {
          if (err instanceof MediaUnavailableError || isStatus(err, 503)) {
            setHidden(true)
            break
          }
          if (!(err instanceof ApiError)) throw err
          /* skip this file, keep going */
        }
      }
      qc.invalidateQueries({ queryKey: affectedKey })
      onDone()
    } finally {
      setBusy(false)
    }
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
      // Mic denied / unavailable — say so (a written note still works) instead of the
      // old silent swallow; this control is shared by the board memo + Postbox (#554).
      setMicDenied(true)
    }
  }

  function stopRec() {
    if (recRef.current?.state === 'recording') recRef.current.stop()
  }

  const canRecord =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
  if (hidden) return null

  return (
    <>
      <div className="memo-row">
        {canRecord &&
          (recording ? (
            <button type="button" className="btn memo-row__rec" onClick={stopRec}>
              <span className="memo-row__dot" aria-hidden="true" /> {t.memo.stop}
            </button>
          ) : (
            <button type="button" className="btn" onClick={startRec} disabled={busy}>
              <Icon name="microphone-bold" size={18} /> {recordLabel ?? t.memo.record}
            </button>
          ))}
        <button type="button" className="btn" onClick={() => setDraw(true)} disabled={busy || recording}>
          <Icon name="pencil-simple-bold" size={18} /> {t.memo.draw}
        </button>
        {staging && withPhoto ? (
          // STAGE mode: a direct photo attach (a guest photo message).
          <>
            <button type="button" className="btn" onClick={() => photoRef.current?.click()} disabled={busy || recording}>
              <Icon name="camera-bold" size={18} /> {photoLabel ?? t.memo.drawPhoto}
            </button>
            <input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => void onPhotoFile(e)} />
          </>
        ) : !staging && docUpload ? (
          // POST mode + docUpload: a direct "attach a document" picker (image/PDF)
          // in place of draw-over-a-photo — trips attach files, they don't doodle
          // on boarding passes.
          <>
            <button type="button" className="btn" onClick={() => docRef.current?.click()} disabled={busy || recording}>
              <Icon name="file-text-bold" size={18} /> {docUpload.label}
            </button>
            <input
              ref={docRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              hidden
              onChange={(e) => void onDocFiles(e)}
            />
          </>
        ) : !staging ? (
          // POST mode: draw-over-a-photo (#14b), plus keep/make-routine on the pad.
          <button type="button" className="btn" onClick={() => setDrawPhoto(true)} disabled={busy || recording}>
            <Icon name="image-square-bold" size={18} /> {t.memo.drawPhoto}
          </button>
        ) : null}
      </div>
      {micDenied && <StatusMessage tone="error">{t.memo.micDenied}</StatusMessage>}
      <DrawPad
        open={draw || drawPhoto}
        draftId={drawDraftId}
        pickPhotoOnOpen={drawPhoto}
        onCancel={() => { setDraw(false); setDrawPhoto(false) }}
        onSave={(png, scene) => {
          setDraw(false)
          setDrawPhoto(false)
          void capture('drawing', png, scene)
        }}
        // The board pad keeps to the gallery / promotes to a routine; a guest's staged
        // drawing does neither (it's headed for the message), so those are POST-mode only.
        onKeep={staging ? undefined : (png, scene) => {
          setDraw(false)
          setDrawPhoto(false)
          void keepInGallery(png, scene)
        }}
        onMakeRoutine={staging ? undefined : (png, scene) => {
          setDraw(false)
          setDrawPhoto(false)
          void toRoutine(png, scene)
        }}
      />
    </>
  )
}
