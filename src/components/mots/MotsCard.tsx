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
import { useMots, useAllMots, waitingMots, visibleMots, sentMots, isScheduled, type Mot } from '../../lib/mots'
import { formatDay, formatTime } from '../../lib/format'
import { CATS } from '../../lib/cats'
import { type IconName } from '../Icon'
import { Act, Section } from '../board/Act'
import { Disclosure } from '../Disclosure'
import { useReportEmpty } from '../../lib/useReportEmpty'
import { Modal } from '../Modal'
import { MotComposer } from './MotComposer'
import { RescheduleBody } from './RescheduleBody'
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
  // The reschedule sheet (a Modal) — set to the sent mot whose « Plus tard » is being moved.
  const [reschedule, setReschedule] = useState<Mot | null>(null)

  const mots = useMots()
  // The RAW list feeds the sender outbox only — it must show a still-scheduled mot (which the
  // surface-gated `mots` hides). Both hooks share the one MOTS_KEY query.
  const allMots = useAllMots()
  const nowSec = Date.now() / 1000
  const { data } = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: Member[] }>('members') })
  const members = data?.members ?? []
  const ctx: DetailCtx = { t, lang, members }

  const waiting = removal.visible(waitingMots(mots, profileId))
  // « Déjà vus » — opened mots stay viewable (kept ones pinned to the top + badged).
  const seen = removal
    .visible(visibleMots(mots, profileId).filter((m) => m.opened_at != null))
    .sort((a, b) => Number(!!b.saved_at) - Number(!!a.saved_at))
  // « Ce que j'ai laissé » — the picked face's own outbox (incl. still-scheduled mots).
  const sent = removal.visible(sentMots(allMots, profileId))
  const empty = waiting.length === 0 && seen.length === 0 && sent.length === 0
  useReportEmpty(empty)
  if (empty) return null

  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.display_name ?? null
  const sub = (m: Mot) =>
    [nameOf(m.author_member_id), m.member_id === null ? fn.forMaisonnee : fn.forYou].filter(Boolean).join(' · ')
  // A programmed « Plus tard » reads its target moment; a landed one is just seen/waiting.
  const whenLabel = (sec: number) => `${formatDay(sec, lang)} ${formatTime(sec, lang)}`
  // The outbox subtitle: who it's for + its status (scheduled / seen / still waiting).
  const sentSub = (m: Mot) => {
    const to = m.member_id === null ? fn.forMaisonnee : fn.to(nameOf(m.member_id) ?? '?')
    const status = isScheduled(m, nowSec)
      ? fn.scheduledFor(whenLabel(m.surface_at!))
      : m.opened_at
        ? fn.statusSeen
        : fn.statusWaiting
    return [to, status].join(' · ')
  }
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

  // Open one of MY sent mots (the outbox) — a preview + sender actions. Never stamps opened_at
  // (the sender looking at their own outbox is NOT the recipient hearing it); a still-scheduled
  // one offers « Reprogrammer » and its programmed moment as the « when » line.
  function openSent(m: Mot) {
    const scheduled = isScheduled(m, nowSec)
    detail.open(
      buildMot(m, ctx, {
        saved: !!m.saved_at,
        parentQuote: quoteOf(m),
        onReschedule: scheduled ? () => setReschedule(m) : undefined,
        onDelete: () => remove(m),
        whenOverride: scheduled ? fn.scheduledFor(whenLabel(m.surface_at!)) : undefined,
      }),
    )
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

  // An outbox row: tinted by the RECIPIENT (who it's going to), a clock glyph while scheduled.
  const sentRow = (m: Mot) => (
    <Act
      key={'sent-' + m.id}
      cat="cercle"
      color={members.find((x) => x.id === m.member_id)?.colour ?? undefined}
      icon={isScheduled(m, nowSec) ? 'clock-bold' : mediaGlyph(m.media_kind)}
      title={labelOf(m)}
      who={sentSub(m)}
      onOpen={() => openSent(m)}
    />
  )

  // A quiet count — the total mots on this card (waiting + seen + sent), trivially at
  // hand for the compact lens (never a per-person tally, just "there are things here").
  const total = waiting.length + seen.length + sent.length

  return (
    <Section label={fn.cardTitle} icon="envelope-bold" tint={CATS.cercle.color} compactHint={String(total)}>
      {waiting.map((m) => row(m))}
      {seen.length > 0 && (
        // Open by default when there are no waiting rows above it — otherwise the card is just
        // a header + a collapsed caret (an empty-looking box). With waiting rows present it
        // stays collapsed (secondary, calm).
        <Disclosure label={fn.seenGroup} defaultOpen={waiting.length === 0}>
          {seen.map((m) => row(m, true))}
        </Disclosure>
      )}
      {/* « Ce que j'ai laissé » — the sender's own outbox: did they see it yet, and pull back or
          move a « Plus tard » before it lands. Presence + per-item status, never a tally.
          Opens by default when it's the ONLY content, so the card shows its rows instead of
          reading as an empty box; it collapses when waiting/seen mots lead the card. */}
      {sent.length > 0 && (
        <Disclosure label={fn.sentGroup} defaultOpen={waiting.length === 0 && seen.length === 0}>
          {sent.map(sentRow)}
        </Disclosure>
      )}
      {/* Reply composer — opened from a mot's peek; recipient locked to the original sender. */}
      <Modal open={!!replyTo} onClose={() => setReplyTo(null)} title={fn.reply} className="cnote-memo">
        {replyTo && <MotComposer replyTo={replyTo} onDone={() => setReplyTo(null)} />}
      </Modal>
      {/* Reschedule sheet — move a sent, still-scheduled mot (or send it now). */}
      <Modal open={!!reschedule} onClose={() => setReschedule(null)} title={fn.rescheduleTitle} className="cnote-memo">
        {reschedule && <RescheduleBody mot={reschedule} onDone={() => setReschedule(null)} />}
      </Modal>
    </Section>
  )
}
