import { useEffect, useRef, useState } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api, ApiError, isStatus } from '../lib/api'
import { BOARD_KEY } from '../lib/queryKeys'
import { Icon } from './Icon'
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
// The same controls are REUSED by « Le cercle » → Famille → "Notes & recommandations"
// (CercleNotes) by overriding `endpoint`/`affectedKey`/`extraBody`: a media memo then
// POSTs to /api/family-notes with { scope, member_id } and invalidates that list —
// the board behaviour is the default, so nothing there changes.
const MAX_REC_MS = 30_000

export function MemoControls({
  onDone,
  endpoint = 'notes',
  affectedKey = BOARD_KEY,
  extraBody,
}: {
  onDone: () => void
  /** Which endpoint a media memo POSTs to. Default the board `notes`. */
  endpoint?: string
  /** Query key to invalidate after a successful post. Default BOARD_KEY. */
  affectedKey?: QueryKey
  /** Extra fields merged into the POST body (e.g. { scope, member_id } for family notes). */
  extraBody?: Record<string, unknown>
}) {
  const t = useT()
  const qc = useQueryClient()
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draw, setDraw] = useState(false)
  const [drawPhoto, setDrawPhoto] = useState(false) // opened straight into the photo flow (#14b)
  const [hidden, setHidden] = useState(false) // R2 unbound (503) → no media notes here
  const toRoutine = useDrawingToRoutine()
  // Keep into « Mes dessins » with a calm, undoable confirming toast (best-effort).
  const keepInGallery = useKeepInGalleryToast()
  const recRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // While recording, flag the body so the shell can drop the ＋ FAB: it floats
  // bottom-right OVER the Record/Stop + Draw/Photo row (esp. on a phone, where the
  // memo controls sit in the FAB's band), and you can't quick-add mid-record anyway.
  // Mirrors how `.kb-open` hides the FAB while typing. Cleared on stop + unmount.
  useEffect(() => {
    if (!recording) return
    document.body.classList.add('is-recording')
    return () => document.body.classList.remove('is-recording')
  }, [recording])

  async function postMemo(kind: 'audio' | 'drawing', blob: Blob, scene = '') {
    setBusy(true)
    try {
      const { key } = await api<{ key: string }>('note-media', { method: 'POST', body: blob })
      // A drawing also persists its editable scene (#1) so it can be re-opened and
      // added to losslessly — best-effort, the PNG stands on its own if it fails.
      let sceneKey: string | undefined
      if (scene) {
        try {
          const r = await api<{ key: string }>('note-media', { method: 'POST', body: new Blob([scene], { type: 'application/json' }) })
          sceneKey = r.key
        } catch {
          /* scene optional */
        }
      }
      await api(endpoint, { method: 'POST', body: { media_kind: kind, media_key: key, scene_key: sceneKey, text: '', ...extraBody } })
      qc.invalidateQueries({ queryKey: affectedKey })
      onDone()
    } catch (e) {
      if (isStatus(e, 503)) setHidden(true)
      else if (!(e instanceof ApiError)) throw e
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
        if (blob.size > 0) void postMemo('audio', blob)
      }
      recRef.current = rec
      rec.start()
      setRecording(true)
      window.setTimeout(() => {
        if (recRef.current?.state === 'recording') recRef.current.stop()
      }, MAX_REC_MS)
    } catch {
      /* mic denied / unavailable — leave the text capture as-is */
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
              <Icon name="microphone-bold" size={18} /> {t.memo.record}
            </button>
          ))}
        <button type="button" className="btn" onClick={() => setDraw(true)} disabled={busy || recording}>
          <Icon name="pencil-simple-bold" size={18} /> {t.memo.draw}
        </button>
        <button type="button" className="btn" onClick={() => setDrawPhoto(true)} disabled={busy || recording}>
          <Icon name="image-square-bold" size={18} /> {t.memo.drawPhoto}
        </button>
      </div>
      <DrawPad
        open={draw || drawPhoto}
        pickPhotoOnOpen={drawPhoto}
        onCancel={() => { setDraw(false); setDrawPhoto(false) }}
        onSave={(png, scene) => {
          setDraw(false)
          setDrawPhoto(false)
          void postMemo('drawing', png, scene)
        }}
        onKeep={(png, scene) => {
          setDraw(false)
          setDrawPhoto(false)
          void keepInGallery(png, scene)
        }}
        onMakeRoutine={(png, scene) => {
          setDraw(false)
          setDrawPhoto(false)
          void toRoutine(png, scene)
        }}
      />
    </>
  )
}
