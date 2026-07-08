// B-11 (bmad/10) — cercle.css moved out of the eager shell (position-immaterial
// .cercle-*/.cf-* classes); load it whenever this page renders instead.
import '../styles/cercle.css'
// intake.css — reuses the .intake__* field/section classes for its own layout.
import '../styles/intake.css'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { guestWindowKey } from '../lib/queryKeys'
import { imgUrl } from '../lib/image'
import { ZoomableImg } from '../components/ZoomableImg'
import { MemoControls, type StagedMemo } from '../components/MemoControls'
import { SharePreviewBar, useSharePreview } from '../components/SharePreviewBar'
import { Icon, InlineIcon } from '../components/Icon'
import { StatusMessage } from '../components/StatusMessage'

// « La boîte aux lettres » — the relative-facing message drop (the 'postbox' share
// kind, the second writable one after intake). A relative opens a typed, time-boxed
// link, says who they are, and leaves a message: a written word, a voice clip, a
// drawing, or a photo. The submission is QUARANTINED server-side (migration 0085);
// any media is staged in R2 and resolved at the operator's review, where accepting it
// turns it into a board fridge note attributed to the sender. Phone-first, single
// page, no account, no further access. Mirrors IntakeForm's shape; the Record/Draw/
// Photo trio is the shared `MemoControls` in STAGE mode (`onStaged`), which hands back
// the staged R2 key — this page holds it as ONE draft and sends it with the name.

interface GreetingData {
  kind: 'postbox'
  householdName: string
}

export function Postbox() {
  const t = useT()
  const preview = useSharePreview()

  const { data } = useQuery({
    queryKey: guestWindowKey(preview, 'postbox'),
    queryFn: () => api<GreetingData>(`guest/window${preview ? `?kind=${preview}` : ''}`),
  })

  const [senderName, setSenderName] = useState('')
  const [text, setText] = useState('')
  // The one media attachment a message can carry (a message may be text-only too),
  // handed back by MemoControls' STAGE mode.
  const [draft, setDraft] = useState<StagedMemo | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

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

          {/* The shared Record / Draw / Photo trio in STAGE mode — hidden once a memo is
              attached (one per message). `onStaged` hands back the R2 key we hold as the
              draft; MemoControls hides itself if R2 is unbound (a written word still sends). */}
          {!draft && (
            <MemoControls
              onDone={() => {}}
              mediaEndpoint="guest/postbox-media"
              onStaged={setDraft}
              withPhoto
              recordLabel={t.postbox.recordVoice}
              photoLabel={t.postbox.addPhoto}
              drawDraftId="postbox"
            />
          )}
        </section>

        {err && <StatusMessage tone="error">{err}</StatusMessage>}

        <div className="intake__send">
          <button type="button" className="btn btn--primary" disabled={busy} onClick={submit}>
            <Icon name="arrow-right-bold" size={18} /> {busy ? t.postbox.sending : t.postbox.submit}
          </button>
        </div>
      </div>
    </div>
  )
}
