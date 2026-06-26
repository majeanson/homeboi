import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { api } from '../../lib/api'
import { useConfirm } from '../../lib/confirm'
import { BOARD_KEY } from '../../lib/queryKeys'
import { imgUrl } from '../../lib/image'
import { ZoomableImg } from '../ZoomableImg'
import { StatusMessage } from '../StatusMessage'
import { Icon } from '../Icon'

// Operator review of « La boîte aux lettres » messages (the 'postbox' share kind).
// Lives in Réglages ▸ Partage beside the intake review — the two "things people sent
// us" buckets: Infos (intake) and Messages (this). Calm: a passive "N messages reçus"
// count, never a push. Accepting one turns it into a board fridge note attributed to
// the sender (server-side, functions/api/postbox.ts); dismissing frees it. Hidden
// until a message arrives, so it never adds noise.

const POSTBOX_KEY = ['postbox'] as const

interface PendingMsg {
  id: string
  senderName: string
  text: string
  mediaKind: 'audio' | 'drawing' | 'image' | null
  mediaKey: string | null
  sceneKey: string | null
  createdAt: number
}

export function PostboxReview({ help }: { help?: HelpMode }) {
  const t = useT()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const { data } = useQuery({
    queryKey: POSTBOX_KEY,
    queryFn: () => api<{ messages: PendingMsg[] }>('postbox'),
  })
  const messages = data?.messages ?? []

  async function review(m: PendingMsg, status: 'accepted' | 'dismissed') {
    if (busy) return
    if (status === 'dismissed') {
      const okay = await confirm({ message: t.postbox.dismissConfirm, confirmLabel: t.postbox.dismiss, tone: 'danger' })
      if (!okay) return
    }
    setBusy(m.id)
    setErr(null)
    try {
      await api('postbox', { method: 'PATCH', body: { id: m.id, status } })
      qc.invalidateQueries({ queryKey: POSTBOX_KEY })
      if (status === 'accepted') qc.invalidateQueries({ queryKey: BOARD_KEY })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (messages.length === 0) return null

  return (
    <OperatorSection
      title={`${t.postbox.reviewTitle} · ${t.postbox.reviewPending(messages.length)}`}
      help={help}
      helpKey="guest"
    >
      <p className="operator__hint mono">{t.postbox.reviewHint}</p>
      {err && <StatusMessage tone="error">{err}</StatusMessage>}

      <div className="postbox-review">
        {messages.map((m) => (
          <div key={m.id} className="postbox-review__row">
            <div className="postbox-review__body">
              <span className="postbox-review__from">{m.senderName || t.postbox.someone}</span>
              {/* The message, by kind: a written word, a voice clip to play, or an image. */}
              {m.mediaKind === 'audio' && m.mediaKey ? (
                <button
                  type="button"
                  className="note-card__mediabtn"
                  onClick={() => void new Audio(imgUrl(m.mediaKey!)).play()}
                >
                  <Icon name="play-bold" size={16} /> {t.postbox.voicePreview}
                </button>
              ) : (m.mediaKind === 'drawing' || m.mediaKind === 'image') && m.mediaKey ? (
                <ZoomableImg className="postbox-review__img" src={imgUrl(m.mediaKey)} alt={t.postbox.attachment} />
              ) : null}
              {m.text && <span className="postbox-review__text">{m.text}</span>}
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="btn btn--sm btn--primary"
                onClick={() => void review(m, 'accepted')}
                disabled={busy === m.id}
              >
                <Icon name="check-bold" size={15} /> {t.postbox.accept}
              </button>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => void review(m, 'dismissed')}
                disabled={busy === m.id}
              >
                <Icon name="trash-bold" size={15} /> {t.postbox.dismiss}
              </button>
            </div>
          </div>
        ))}
      </div>
    </OperatorSection>
  )
}
