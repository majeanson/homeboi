import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api, ApiError, isStatus } from '../lib/api'
import { uploadMedia, MediaUnavailableError } from '../lib/uploadMedia'
import { imgUrl } from '../lib/image'
import { DrawPad } from '../components/DrawPad'
import { ZoomableImg } from '../components/ZoomableImg'
import { SharePreviewBar, useSharePreview } from '../components/SharePreviewBar'
import { Icon, InlineIcon } from '../components/Icon'
import { StatusMessage } from '../components/StatusMessage'

// « La boîte aux lettres » — the relative-facing message drop (the 'postbox' share
// kind, the second writable one after intake). A relative opens a typed, time-boxed
// link, says who they are, and leaves a message: a written word, a voice clip, a
// drawing, or a photo. The submission is QUARANTINED server-side (migration 0085);
// any media is staged in R2 and resolved at the operator's review, where accepting it
// turns it into a board fridge note attributed to the sender. Phone-first, single
// page, no account, no further access. Mirrors IntakeForm's shape; composes media
// with the same DrawPad / MediaRecorder / uploadMedia primitives as MemoControls,
// but holds ONE memo as a draft and sends it with the sender's name in one go.

const MAX_REC_MS = 30_000

interface GreetingData {
  kind: 'postbox'
  householdName: string
}

// The one media attachment a message can carry (a message may be text-only too).
type Draft =
  | { kind: 'audio'; key: string }
  | { kind: 'drawing'; key: string; sceneKey?: string }
  | { kind: 'image'; key: string }
  | null

export function Postbox() {
  const t = useT()
  const preview = useSharePreview()

  const { data } = useQuery({
    queryKey: ['guest-window', preview ?? 'self', 'postbox'],
    queryFn: () => api<GreetingData>(`guest/window${preview ? `?kind=${preview}` : ''}`),
  })

  const [senderName, setSenderName] = useState('')
  const [text, setText] = useState('')
  const [draft, setDraft] = useState<Draft>(null)
  // R2 unbound (a stage call 503s) → hide every media control; a written word still sends.
  const [mediaOff, setMediaOff] = useState(false)
  const [draw, setDraw] = useState(false)
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const photoRef = useRef<HTMLInputElement>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Stage a blob to R2 via the postbox media endpoint; a 503 means R2 is unbound.
  async function stage(blob: Blob): Promise<string | null> {
    try {
      const { key } = await api<{ key: string }>('guest/postbox-media', { method: 'POST', body: blob })
      return key
    } catch (e) {
      if (isStatus(e, 503)) setMediaOff(true)
      else if (!(e instanceof ApiError)) throw e
      return null
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
      rec.onstop = async () => {
        stopStream()
        setRecording(false)
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
        if (blob.size > 0) {
          setBusy(true)
          const key = await stage(blob)
          if (key) setDraft({ kind: 'audio', key })
          setBusy(false)
        }
      }
      recRef.current = rec
      rec.start()
      setRecording(true)
      window.setTimeout(() => {
        if (recRef.current?.state === 'recording') recRef.current.stop()
      }, MAX_REC_MS)
    } catch {
      /* mic denied / unavailable — leave the written word as-is */
    }
  }

  function stopRec() {
    if (recRef.current?.state === 'recording') recRef.current.stop()
  }

  async function onDrawSave(png: Blob, scene: string) {
    setDraw(false)
    setBusy(true)
    const key = await stage(png)
    let sceneKey: string | undefined
    if (key && scene) {
      const sk = await stage(new Blob([scene], { type: 'application/json' }))
      sceneKey = sk ?? undefined
    }
    if (key) setDraft({ kind: 'drawing', key, sceneKey })
    setBusy(false)
  }

  async function onPhoto(file?: File) {
    if (!file) return
    setBusy(true)
    try {
      const key = await uploadMedia('guest/postbox-media', file)
      setDraft({ kind: 'image', key })
    } catch (e) {
      if (e instanceof MediaUnavailableError) setMediaOff(true)
    } finally {
      setBusy(false)
      if (photoRef.current) photoRef.current.value = ''
    }
  }

  async function submit() {
    if (busy) return
    if (!senderName.trim()) {
      setErr(t.postbox.nameRequired)
      return
    }
    if (!text.trim() && !draft) {
      setErr(t.postbox.emptyMessage)
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await api('guest/postbox-submit', {
        method: 'POST',
        body: {
          senderName: senderName.trim(),
          text: text.trim(),
          media_kind: draft?.kind,
          media_key: draft?.key,
          scene_key: draft && draft.kind === 'drawing' ? draft.sceneKey : undefined,
        },
      })
      setDone(true)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // While recording, flag the body (mirrors MemoControls) so any floating chrome hides.
  useEffect(() => {
    if (!recording) return
    document.body.classList.add('is-recording')
    return () => document.body.classList.remove('is-recording')
  }, [recording])

  const canRecord =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
  const showMedia = !mediaOff

  if (done) {
    return (
      <div className="scene intake" aria-label={t.postbox.title}>
        <div className="scene__body intake__done">
          <div className="intake__done-mark">
            <Icon name="check-bold" size={40} />
          </div>
          <h2 className="intake__done-title">{t.postbox.sentTitle}</h2>
          <p className="intake__done-sub mono">{t.postbox.sentSub}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="scene intake" aria-label={t.postbox.title}>
      {preview && <SharePreviewBar />}
      <header className="scene__head">
        <div className="scene__head-titles">
          <h2 className="pm-sheet__title">
            <InlineIcon name="hand-heart-bold" /> {t.postbox.greeting}
          </h2>
          {data?.householdName && <span className="scene__head-sub mono">{data.householdName}</span>}
        </div>
      </header>

      <div className="scene__body intake__body">
        <p className="intake__intro mono">{t.postbox.intro}</p>

        {/* 1 — who you are (required, so the family knows who wrote). */}
        <section className="intake__sec">
          <label className="cf__field">
            <span className="cf__label">{t.postbox.nameLabel}</span>
            <input
              className="cf__input"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder={t.postbox.namePlaceholder}
              autoFocus
            />
          </label>
        </section>

        {/* 2 — the message: a written word and/or one memo (voice / drawing / photo). */}
        <section className="intake__sec">
          <h3 className="intake__h">{t.postbox.messageTitle}</h3>
          <label className="cf__field">
            <textarea
              className="cf__input cf__textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder={t.postbox.messagePlaceholder}
            />
          </label>

          {/* The attached memo preview + a way to remove it. */}
          {draft && (
            <div className="postbox__draft">
              {draft.kind === 'audio' ? (
                <button type="button" className="note-card__mediabtn" onClick={() => new Audio(imgUrl(draft.key)).play()}>
                  <Icon name="play-bold" size={16} /> {t.postbox.voicePreview}
                </button>
              ) : (
                <ZoomableImg className="postbox__draft-img" src={imgUrl(draft.key)} alt={t.postbox.attachment} />
              )}
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => setDraft(null)} disabled={busy}>
                <Icon name="trash-bold" size={15} /> {t.postbox.removeAttachment}
              </button>
            </div>
          )}

          {/* Media controls — hidden once a memo is attached (one per message) and when
              R2 is unbound. Mirrors MemoControls' Record / Draw / Photo trio. */}
          {showMedia && !draft && (
            <div className="memo-row">
              {canRecord &&
                (recording ? (
                  <button type="button" className="btn memo-row__rec" onClick={stopRec}>
                    <span className="memo-row__dot" aria-hidden="true" /> {t.memo.stop}
                  </button>
                ) : (
                  <button type="button" className="btn" onClick={startRec} disabled={busy}>
                    <Icon name="microphone-bold" size={18} /> {t.postbox.recordVoice}
                  </button>
                ))}
              <button type="button" className="btn" onClick={() => setDraw(true)} disabled={busy || recording}>
                <Icon name="pencil-simple-bold" size={18} /> {t.memo.draw}
              </button>
              <button type="button" className="btn" onClick={() => photoRef.current?.click()} disabled={busy || recording}>
                <Icon name="camera-bold" size={18} /> {t.postbox.addPhoto}
              </button>
              <input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
            </div>
          )}
        </section>

        {err && <StatusMessage tone="error">{err}</StatusMessage>}

        <div className="intake__send">
          <button type="button" className="btn btn--primary" disabled={busy || recording} onClick={submit}>
            <Icon name="arrow-right-bold" size={18} /> {busy ? t.postbox.sending : t.postbox.submit}
          </button>
        </div>
      </div>

      <DrawPad open={draw} onCancel={() => setDraw(false)} onSave={(png, scene) => void onDrawSave(png, scene)} />
    </div>
  )
}
