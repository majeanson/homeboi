import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api, ApiError, isStatus } from '../lib/api'
import { BOARD_KEY } from '../lib/queryKeys'
import { Icon } from './Icon'
import { DrawPad } from './DrawPad'
import { useDrawingToRoutine } from '../lib/drawingToRoutine'

// Audio-memo (#38) + drawn-note (#14) controls inside the ＋ "Note rapide" sheet.
// Both create a fridge NOTE carrying an R2 media key (note-media → notes), so they
// ride the same board card + clear flow as a text note — general-audience, tinted
// by the active face but seen by everyone. R2 unbound → 503 → the controls hide
// (typing a note still works). Recording reuses the MediaRecorder pattern from the
// routine voice clips (CardDeckEditor), capped at 30 s for calm.
const MAX_REC_MS = 30_000

export function MemoControls({ onDone }: { onDone: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draw, setDraw] = useState(false)
  const [hidden, setHidden] = useState(false) // R2 unbound (503) → no media notes here
  const toRoutine = useDrawingToRoutine()
  const recRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  async function postMemo(kind: 'audio' | 'drawing', blob: Blob) {
    setBusy(true)
    try {
      const { key } = await api<{ key: string }>('note-media', { method: 'POST', body: blob })
      await api('notes', { method: 'POST', body: { media_kind: kind, media_key: key, text: '' } })
      qc.invalidateQueries({ queryKey: BOARD_KEY })
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
      </div>
      <DrawPad
        open={draw}
        onCancel={() => setDraw(false)}
        onSave={(png) => {
          setDraw(false)
          void postMemo('drawing', png)
        }}
        onMakeRoutine={(png) => {
          setDraw(false)
          void toRoutine(png)
        }}
      />
    </>
  )
}
