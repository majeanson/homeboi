// B-11 (bmad/10) — cercle.css moved out of the eager shell (position-immaterial
// .cercle-*/.cf-* classes); load it whenever this page renders instead.
import '../styles/cercle.css'
// intake.css — reuses the .intake__* field/section classes for its own layout.
import '../styles/intake.css'
import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api, isStatus } from '../lib/api'
import { guestWindowKey } from '../lib/queryKeys'
import { EditField } from '../components/EditField'
import { useMemoAttach } from '../components/MemoAttach'
import { SharePreviewBar, useSharePreview } from '../components/SharePreviewBar'
import { GuestExpired } from '../components/GuestExpired'
import { Icon, InlineIcon } from '../components/Icon'
import { StatusMessage } from '../components/StatusMessage'

// « La boîte aux lettres » — the relative-facing message drop (the 'postbox' share
// kind, the second writable one after intake). A relative opens a typed, time-boxed
// link, says who they are, and leaves a message: a written word, a voice clip, a
// drawing, or a photo. The submission is QUARANTINED server-side (migration 0085);
// any media is staged in R2 and resolved at the operator's review, where accepting it
// turns it into a board fridge note attributed to the sender. Phone-first, single
// page, no account, no further access. Mirrors IntakeForm's shape.
//
// This page was the ORIGINAL home of the staged-attachment model: upload the blob, hold
// its R2 key as one draft, send it with the name in a single POST. `useMemoAttach` is
// that model generalised — every composer now works this way, and this page just consumes
// the shared hook instead of hand-wiring the draft, the preview and the remove button.

interface GreetingData {
  kind: 'postbox'
  householdName: string
  // D-18 reçu-✓ (bmad/10) — this link's most recent ACCEPTED message, so a return
  // visitor (a durable/standing link — « Mamie ») sees a quiet confirmation next
  // time she opens it. null when nothing's been accepted yet (or an operator preview).
  receipt: { lastAcceptedAt: number; snippet: string } | null
}

export function Postbox() {
  const t = useT()
  const preview = useSharePreview()

  const { data, isError } = useQuery({
    queryKey: guestWindowKey(preview, 'postbox'),
    queryFn: () => api<GreetingData>(`guest/window${preview ? `?kind=${preview}` : ''}`),
    // A revoked/expired link won't recover on retry — surface the expired state fast
    // (mirrors HandoffPage/WelcomePage/FamilyWindowPage — the missing case here, so a
    // revoked durable link reads as "this link no longer works" instead of a stuck
    // spinner or a half-broken form).
    retry: (count, err) => !isStatus(err, 401) && !isStatus(err, 403) && count < 2,
  })

  const [senderName, setSenderName] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  // The one media attachment a message can carry (a message may be text-only too).
  // A guest gets the DIRECT photo picker (there's no board pad to draw over) and no
  // gallery/routine actions — that drawing is headed for the household, not a wall.
  const memo = useMemoAttach({
    mediaEndpoint: 'guest/postbox-media',
    drawDraftId: 'postbox',
    photoMode: 'direct',
    gallery: false,
    recordLabel: t.postbox.recordVoice,
    photoLabel: t.postbox.addPhoto,
  })

  // ONE key per composed submission, not per attempt (bmad/11 tier-2 #2). The
  // server already dedups any write that carries an Idempotency-Key
  // (functions/_lib/idempotency.ts, applied centrally in authed()); this path
  // simply never sent one, because a guest form writes through raw `api()`
  // rather than the outbox's `useWrite`.
  //
  // Without it the two ordinary things a relative does — double-tapping
  // « Envoyer » on a slow phone, or hitting refresh-and-resend when the response
  // is lost — each landed a SECOND quarantine row in the operator's review
  // queue, with no way to tell it from a genuine second message. The key is
  // minted when the send begins and REUSED by every retry of that same
  // submission, so a retry answers from the ledger instead of writing again.
  //
  // It is never reset, and does not need to be: the ledger only remembers
  // SUCCESSES, so a failed send retries for real under the same key, and a
  // successful one ends the form (the « merci » screen is terminal). A relative
  // sending a genuine second message reloads the link, which mints a fresh one.
  const sendKey = useRef<string | null>(null)

  async function submit() {
    if (busy) return
    if (!senderName.trim()) {
      setErr(t.postbox.nameRequired)
      return
    }
    if (!text.trim() && !memo.draft) {
      setErr(t.postbox.emptyMessage)
      return
    }
    setBusy(true)
    setErr(null)
    if (!sendKey.current) sendKey.current = crypto.randomUUID()
    try {
      await api('guest/postbox-submit', {
        method: 'POST',
        body: { senderName: senderName.trim(), text: text.trim(), ...memo.body },
        idempotencyKey: sendKey.current,
      })
      setDone(true)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // A revoked/expired link (401/403) reads as "this link no longer works" — the
  // missing case that let a revoked STANDING durable link land on a broken form.
  if (isError && !data) {
    return (
      <div className="scene intake" aria-label={t.postbox.title}>
        <div className="scene__body intake__body">
          <GuestExpired />
        </div>
      </div>
    )
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
        {/* D-18 reçu-✓ — a quiet confirmation on the NEXT visit that a prior message
            was accepted. Pull-only (rides this fetch), zero unread state — it just
            reads whatever the last accepted message was, every time. */}
        {data?.receipt && (
          <StatusMessage tone="success" icon="check-bold">
            {t.postbox.receivedAck(data.receipt.snippet)}
          </StatusMessage>
        )}
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
          {/* The message field carries its own 📎 (voice / drawing / photo). `readOnly={false}`
              because EditField hides itself for a guest session by default — and a guest is
              exactly who this page is for. No submit here: the page's own « Envoyer » below
              sends the name + text + attachment as ONE post. */}
          <EditField
            value={text}
            onChange={setText}
            submitIcon={null}
            multiline
            readOnly={false}
            voiceLabel={t.postbox.recordVoice}
            placeholder={t.postbox.messagePlaceholder}
            ariaLabel={t.postbox.messageTitle}
            disabled={busy}
            boxActions={memo.attachButton}
          >
            {memo.panel}
          </EditField>
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
