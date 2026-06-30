import { useState } from 'react'
import { useT, useLang } from '../../i18n'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useProfile } from '../../lib/profile'
import { useWrite } from '../../lib/write'
import { useConfirm } from '../../lib/confirm'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { type Member } from '../../lib/members'
import { MEMBERS_KEY, MOTS_KEY, BOARD_KEY } from '../../lib/queryKeys'
import { useMots, waitingMots, visibleMots, type Mot } from '../../lib/mots'
import { CATS } from '../../lib/cats'
import { type IconName } from '../Icon'
import { Act, Section } from '../board/Act'
import { Disclosure } from '../Disclosure'
import { Modal } from '../Modal'
import { MotComposer } from './MotComposer'
import { useEntityDetail } from '../detail/DetailProvider'
import { buildMot, type DetailCtx } from '../detail/adapters'

// « Laisse un mot » inbox — a self-hiding board band card (#mots). When a face is picked
// it shows THAT face's waiting mots (+ Maisonnée-addressed ones); at rest (Maisonnée) it
// shows only the family-wide ones (the per-face dot covers individual discovery). Tapping
// a mot opens the shared entity-detail peek (plays/reads it) AND stamps opened_at — so the
// heads-up clears on every device. Opened mots drop into a collapsed « Déjà vus » group so
// they stay viewable (a « Gardé » one is pinned + badged); delete/keep happen in the peek.
// Calm: presence only, never a count or badge of "unread".
const mediaGlyph = (k: Mot['media_kind']): IconName =>
  k === 'audio' ? 'microphone-bold' : k === 'drawing' ? 'paint-brush-bold' : k === 'image' ? 'image-square-bold' : 'envelope-bold'

export function MotsCard() {
  const t = useT()
  const fn = t.mots
  const { lang } = useLang()
  const { memberId: profileId } = useProfile()
  const write = useWrite()
  const confirm = useConfirm()
  const detail = useEntityDetail()
  const removal = useDeferredRemoval(MOTS_KEY)
  // The reply composer (a Modal) — set to the mot being answered.
  const [replyTo, setReplyTo] = useState<Mot | null>(null)

  const mots = useMots()
  const { data } = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: Member[] }>('members') })
  const members = data?.members ?? []
  const ctx: DetailCtx = { t, lang, members }

  const waiting = removal.visible(waitingMots(mots, profileId))
  // « Déjà vus » — opened mots stay viewable (kept ones pinned to the top + badged).
  const seen = removal
    .visible(visibleMots(mots, profileId).filter((m) => m.opened_at != null))
    .sort((a, b) => Number(!!b.saved_at) - Number(!!a.saved_at))
  if (waiting.length === 0 && seen.length === 0) return null

  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.display_name ?? null
  const sub = (m: Mot) =>
    [nameOf(m.author_member_id), m.member_id === null ? fn.forMaisonnee : fn.forYou].filter(Boolean).join(' · ')
  const labelOf = (m: Mot) =>
    m.text.split('\n').find((l) => l.trim())?.trim() ||
    (m.media_kind === 'audio' ? fn.memo : m.media_kind === 'drawing' ? fn.drawing : m.media_kind === 'image' ? fn.photo : fn.untitled)
  // A reply quotes the mot it answers (resolved from the live list) for the peek's context.
  const quoteOf = (m: Mot): string | null => {
    if (!m.reply_to) return null
    const p = mots.find((x) => x.id === m.reply_to)
    return p ? labelOf(p) : null
  }

  function remove(m: Mot) {
    const run = () =>
      removal.remove([m.id], fn.deleted, () =>
        write('mots', { method: 'DELETE', body: { id: m.id }, affectedKeys: [MOTS_KEY, BOARD_KEY] }),
      )
    // A kept keepsake is a deliberate loss → confirm; an ordinary mot uses the undo toast.
    if (m.saved_at) void confirm({ message: fn.deleteSavedConfirm, tone: 'danger' }).then((okd) => okd && run())
    else run()
  }

  const toggleSave = (m: Mot) =>
    void write('mots', { method: 'PATCH', body: { id: m.id, saved: !m.saved_at }, affectedKeys: [MOTS_KEY, BOARD_KEY] }).catch(() => {})

  function open(m: Mot) {
    detail.open(
      buildMot(m, ctx, {
        saved: !!m.saved_at,
        parentQuote: quoteOf(m),
        onToggleSave: () => toggleSave(m),
        onDelete: () => remove(m),
        // Reply only when there's a real sender to answer (a Maisonnée-from-noone mot has none).
        onReply: m.author_member_id ? () => setReplyTo(m) : undefined,
      }),
    )
    // Opening IS the stamp — first open wins server-side (idempotent), the card re-renders
    // without it on every device. Skip the write for an already-opened mot.
    if (m.opened_at == null)
      void write('mots', { method: 'PATCH', body: { id: m.id, opened: true }, affectedKeys: [MOTS_KEY, BOARD_KEY] }).catch(() => {})
  }

  const row = (m: Mot, kept = false) => (
    <Act
      key={m.id}
      cat="cercle"
      color={members.find((x) => x.id === m.author_member_id)?.colour ?? undefined}
      icon={mediaGlyph(m.media_kind)}
      title={labelOf(m)}
      who={sub(m)}
      badge={kept && m.saved_at ? <span className="mono">{fn.kept}</span> : undefined}
      onOpen={() => open(m)}
    />
  )

  return (
    <Section label={fn.cardTitle} icon="envelope-bold" tint={CATS.cercle.color}>
      {waiting.map((m) => row(m))}
      {seen.length > 0 && (
        <Disclosure label={fn.seenGroup}>
          {seen.map((m) => row(m, true))}
        </Disclosure>
      )}
      {/* Reply composer — opened from a mot's peek; recipient locked to the original sender. */}
      <Modal open={!!replyTo} onClose={() => setReplyTo(null)} title={fn.reply} className="cnote-memo">
        {replyTo && <MotComposer replyTo={replyTo} onDone={() => setReplyTo(null)} />}
      </Modal>
    </Section>
  )
}
