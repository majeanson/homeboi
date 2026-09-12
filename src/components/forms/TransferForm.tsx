import { useMemo, useState } from 'react'
import { useT, useLang } from '../../i18n'
import { useConfirm } from '../../lib/confirm'
import { useProfile } from '../../lib/profile'
import { formatDay } from '../../lib/format'
import { formatMoneyExact, parseMoney } from '../../lib/money'
import { inputFromLocalDay, localDayFromInput } from '../../lib/localDay'
import {
  buildMemo,
  coveredDueDates,
  transferTotal,
  useDeleteTransfer,
  useSaveTransfer,
  type Transfer,
  type TransferLine,
  type TransferPlan,
} from '../../lib/transfers'
import { Avatar } from '../Avatar'
import { Chip } from '../Chip'
import { Cluster } from '../Layout'
import { CopyButton } from '../CopyButton'
import { EditField } from '../EditField'
import { FormFooter } from '../FormFooter'
import { RowActions } from '../RowActions'
import { StatusMessage } from '../StatusMessage'
import type { FormMember } from '../FormScene'

// THE composer. Everything this screen does is in service of one sentence: « which
// payments am I covering, plus how much extra, and what do I write in the bank ».
//
// The household it was built for was doing all of this by hand every two weeks —
// re-deriving each share, re-counting which mortgage dates the transfer covered, and
// retyping the memo. So nothing here is typed that can be ticked, and the memo
// writes itself until you decide otherwise.
export function TransferForm({
  value,
  plans,
  members,
  today,
  transfers,
  onSaved,
  onDeleted,
  onCancel,
}: {
  value?: Transfer | null
  plans: TransferPlan[]
  members: FormMember[]
  today: number
  /** Every recorded transfer — used only to grey out dates already sent for. */
  transfers: Transfer[]
  onSaved: () => void
  onDeleted?: () => void
  onCancel?: () => void
}) {
  const t = useT()
  const { lang } = useLang()
  const v = t.virements
  const confirm = useConfirm()
  const save = useSaveTransfer()
  const del = useDeleteTransfer()
  const { memberId: profileFace } = useProfile()

  // The sender decides which share each ticked date carries, so a null sender makes
  // every line 0 — the composer opened saying « Total 0,00 $ » under two selected
  // dates, which is the screenshot that sent this back for a fix. Fall back, in order:
  // the transfer being edited, this device's face, then the first person any plan
  // actually names as a payer.
  const firstPayer = plans.flatMap((p) => Object.keys(p.shares))[0] ?? members.find((m) => !m.is_child)?.id ?? null
  // Resolved once, and used by BOTH the sender state and the seeded ticks — they have
  // to agree, or the dates would be pre-ticked for one face and priced for another.
  const initialSender = value?.memberId ?? profileFace ?? firstPayer
  const [sender, setSender] = useState<string | null>(initialSender)
  // The DAY it was sent, as a local day — never the appointment helper's UTC midnight,
  // which stored « 14 août » as the 13th at 20:00 on Marc's own row (2026-09-12).
  const [date, setDate] = useState(inputFromLocalDay(value ? value.sentAt : today))

  // Ticked due dates, per plan. Seeded from the transfer being edited, or — for a new
  // one — from what this face still owes: every past due date nothing has covered.
  // That IS the question the screen exists to answer, so it answers it on arrival.
  const [ticked, setTicked] = useState<Record<string, number[]>>(() => {
    if (value) {
      const out: Record<string, number[]> = {}
      for (const l of value.lines) if (l.kind === 'plan') (out[l.planId] ??= []).push(l.dueAt)
      return out
    }
    const out: Record<string, number[]> = {}
    for (const p of plans) {
      const covered = coveredDueDates(transfers, p.id, initialSender)
      const owed = p.due.filter((at) => at <= today && !covered.has(at))
      if (owed.length) out[p.id] = owed
    }
    return out
  })

  const [topup, setTopup] = useState(() => {
    const c = value?.lines.filter((l) => l.kind === 'topup').reduce((s, l) => s + l.amountCents, 0) ?? 0
    return c ? String(c / 100) : ''
  })
  const [others, setOthers] = useState<{ label: string; amount: string }[]>(() =>
    (value?.lines.filter((l) => l.kind === 'other') as Extract<TransferLine, { kind: 'other' }>[] | undefined)?.map((l) => ({
      label: l.label,
      amount: String(l.amountCents / 100),
    })) ?? [],
  )
  const [reference, setReference] = useState(value?.reference ?? '')
  // The memo regenerates as the draft changes UNTIL it is edited by hand; after that
  // the typed words are the ones that go to the bank. « Refaire le message » returns
  // control to the generator.
  const [memoEdited, setMemoEdited] = useState(!!value?.memo)
  const [memoText, setMemoText] = useState(value?.memo ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  // What this face put in as a top-up LAST time — the newest recorded transfer of
  // theirs that carried one. Only ever offered on a NEW transfer: while editing an
  // existing one, its own amount is the truth and a proposal beside it would be noise.
  const lastTopup = value
    ? 0
    : (transfers
        .filter((x) => (x.memberId ?? null) === (sender ?? null))
        .sort((a, b) => b.sentAt - a.sentAt)
        .map((x) => x.lines.filter((l) => l.kind === 'topup').reduce((s, l) => s + l.amountCents, 0))
        .find((c) => c > 0) ?? 0)

  const toggleDate = (planId: string, at: number) =>
    setTicked((cur) => {
      const list = cur[planId] ?? []
      return { ...cur, [planId]: list.includes(at) ? list.filter((x) => x !== at) : [...list, at] }
    })

  // The draft's lines. A plan line carries the SENDER's share for that plan — which
  // is the number that used to be re-derived by hand every time.
  const lines: TransferLine[] = useMemo(() => {
    const out: TransferLine[] = []
    for (const p of plans) {
      const share = sender ? (p.shares[sender] ?? 0) : 0
      for (const at of (ticked[p.id] ?? []).slice().sort((a, b) => a - b))
        out.push({ kind: 'plan', planId: p.id, dueAt: at, amountCents: share })
    }
    const tc = parseMoney(topup)
    if (tc) out.push({ kind: 'topup', amountCents: tc })
    for (const o of others) {
      const c = parseMoney(o.amount)
      if (c) out.push({ kind: 'other', label: o.label.trim(), amountCents: c })
    }
    return out
  }, [plans, ticked, sender, topup, others])

  const total = transferTotal(lines)
  const generated = useMemo(() => buildMemo(lines, plans, lang), [lines, plans, lang])
  const memo = memoEdited ? memoText : generated

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!lines.length || busy) return
    setBusy(true)
    setErr(false)
    try {
      await save(
        {
          memberId: sender,
          sentAt: localDayFromInput(date) ?? today,
          lines,
          memo,
          reference: reference.trim() || null,
          note: null,
        },
        value?.id,
      )
      onSaved()
    } catch {
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!value) return
    // A scene sits above the undo toast in the layer scale, so an « Annuler » raised
    // from here could not be reached — this tier is a confirm (ACTIONS.md).
    if (!(await confirm({ message: v.deleteConfirm, tone: 'danger' }))) return
    setBusy(true)
    try {
      await del(value.id)
      ;(onDeleted ?? onSaved)()
    } catch {
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="operator__inline-form virements__form" onSubmit={submit}>
      {/* One sentence saying what the screen wants, on the screen that wants it. The
          composer reads as a pile of fields until you know that ticking is the whole
          job and the bottom half writes itself — and that is not guessable. Only on a
          new one: while editing, the filled fields already say what they are. */}
      {!value && <p className="operator__seg-hint">{v.transferIntro}</p>}

      {/* Who is sending. Faces, so the row reads at a glance on a wall tablet. */}
      <fieldset>
        <legend className="mono">{v.sender}</legend>
        <Cluster>
          {members.filter((m) => !m.is_child).map((m) => (
            <Chip key={m.id} selected={sender === m.id} onClick={() => setSender(m.id)}>
              <Avatar kind={m.avatar_kind} photo={m.avatar_ref} colour={m.colour} name={m.display_name} size={20} />
              {m.display_name}
            </Chip>
          ))}
        </Cluster>
      </fieldset>

      <label className="recur__row mono">
        <span>{v.sentOn}</span>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      {/* The heart of the screen: which due dates this payment covers. Past-and-
          unpaid ones arrive already ticked; a date this face has already sent for
          wears a check and reads as « déjà envoyé » so nobody pays it twice. */}
      {plans.map((p) => {
        const covered = coveredDueDates(transfers, p.id, sender, value?.id)
        // Everything still owed, plus the next few ahead — enough to pay early
        // without scrolling a year of dates.
        const list = ticked[p.id] ?? []
        // Everything still owed, plus the next few ahead — enough to pay early without
        // scrolling a year of dates. A date added BY HAND (below) joins the row even
        // though it is outside that window, or it would vanish the moment it was picked.
        const offer = [
          ...new Set([...p.due.filter((at) => at <= today || p.due.filter((x) => x > today).slice(0, 3).includes(at)), ...list]),
        ].sort((a, b) => a - b)
        return (
          <fieldset key={p.id}>
            <legend className="mono">
              {p.title} — {v.dueDates}
            </legend>
            <Cluster>
              {offer.map((at) => {
                const isCovered = covered.has(at)
                return (
                  <Chip
                    key={at}
                    selected={list.includes(at)}
                    onClick={() => toggleDate(p.id, at)}
                    title={isCovered ? v.dueCovered : undefined}
                    icon={isCovered ? 'check-bold' : undefined}
                  >
                    {formatDay(at, lang)}
                  </Chip>
                )
              })}
            </Cluster>
            <p className="operator__seg-hint mono">{v.dueDatesHint}</p>
            {/* ANY OTHER DATE. The offered row starts at the entente's first date, so a
                payment made BEFORE the household wrote the entente down had no chip at
                all and could not be logged (Marc, 2026-09-12: an entente anchored on
                17 sept could not record the 14 août transfer). Promised in the plan for
                this feature and missed on the first pass. */}
            <label className="recur__row mono virements__otherdate">
              <span>{v.addOtherDate}</span>
              <input
                className="input"
                type="date"
                value=""
                onChange={(e) => {
                  // A LOCAL midnight, the convention every due date here uses (the
                  // server expands them through _lib/recur). `dateToAnchorSec` is the
                  // EVENT-anchor helper and returns UTC midnight — four hours off, so
                  // the chip would have rendered the day before.
                  const at = localDayFromInput(e.target.value)
                  if (at != null && !list.includes(at)) toggleDate(p.id, at)
                }}
                aria-label={`${p.title} — ${v.addOtherDate}`}
              />
            </label>
          </fieldset>
        )
      })}

      <label className="recur__row mono">
        <span>{v.topup}</span>
        <input className="input" inputMode="decimal" value={topup} onChange={(e) => setTopup(e.target.value)} />
      </label>
      {/* THE PROPOSAL. The due dates tick themselves because they are DUE — that is a
          fact, not a guess. A top-up is the one number this screen cannot know, and it
          is also the one that repeats: it was 2 000 $ last time and it will be 2 000 $
          again. So it is OFFERED, one tap, and never slid into the field: an amount
          filled in that nobody noticed is money sent that nobody decided. */}
      {lastTopup > 0 && !topup && (
        <Cluster>
          <Chip onClick={() => setTopup(String(lastTopup / 100))} icon="arrow-counter-clockwise-bold">
            {v.topupLikeLast(formatMoneyExact(lastTopup, lang))}
          </Chip>
        </Cluster>
      )}
      <p className="operator__seg-hint mono">{v.topupHint}</p>

      {/* Anything else riding on the same send. */}
      {others.map((o, i) => (
        <div className="virements__other" key={i}>
          <input
            className="input"
            value={o.label}
            placeholder={v.otherLabel}
            aria-label={v.otherLabel}
            onChange={(e) => setOthers((cur) => cur.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
          />
          <input
            className="input virements__other-amount"
            inputMode="decimal"
            value={o.amount}
            placeholder={v.amount}
            aria-label={v.amount}
            onChange={(e) => setOthers((cur) => cur.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
          />
          <RowActions onDelete={() => setOthers((cur) => cur.filter((_, j) => j !== i))} deleteLabel={t.common.delete} />
        </div>
      ))}
      <Cluster>
        <Chip onClick={() => setOthers((cur) => [...cur, { label: '', amount: '' }])} icon="plus-bold">
          {v.addLine}
        </Chip>
      </Cluster>

      {/* The total is READ, never typed — one number, derived from the lines above. */}
      <p className="virements__total">
        <span className="mono">{v.total}</span> <strong>{formatMoneyExact(total, lang)}</strong>
      </p>

      {/* AN EMPTY DRAFT HAS TO SAY SO. With nothing ticked the screen showed « Total
          0,00 $ », an empty message and a Save that refused, and explained none of it —
          it read as broken rather than as waiting (Marc, 2026-09-12). Two different
          nothings, two different sentences: « you have not picked yet », versus « there
          is nothing here to pick », which is what an entente whose first date is still
          ahead looks like and which « Une autre date » is the way out of. */}
      {lines.length === 0 && (
        <StatusMessage tone="info">
          {plans.some((p) => p.due.some((at) => at <= today)) ? v.emptyDraft : v.emptyNoDue}
        </StatusMessage>
      )}

      {/* The message for the bank. A labelled CTA takes its own line under a
          full-width field (the « généreux dedans » rule), which is what CopyButton
          renders as a block here. */}
      <EditField
        as="div"
        multiline
        value={memo}
        onChange={(next) => {
          setMemoEdited(true)
          setMemoText(next)
        }}
        submitIcon={null}
        allowEmpty
        placeholder={v.memo}
        ariaLabel={v.memo}
      />
      <p className="operator__seg-hint mono">{v.memoHint}</p>
      <Cluster>
        {memoEdited && (
          <Chip
            onClick={() => {
              setMemoEdited(false)
              setMemoText('')
            }}
          >
            {v.regenerate}
          </Chip>
        )}
      </Cluster>
      <CopyButton text={() => memo} label={v.copyMemo} copiedLabel={v.copied} refusedLabel={v.copyRefused} />

      {/* Usually filled on the way back from the bank — it is what ties this row to
          a statement, which is the whole reason to keep it. */}
      <label className="recur__row mono">
        <span>{v.reference}</span>
        <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
      </label>
      <p className="operator__seg-hint mono">{v.referenceHint}</p>

      {err && <StatusMessage tone="error">{t.common.saveFailed}</StatusMessage>}
      <FormFooter
        saveLabel={value ? t.common.save : v.add}
        saveDisabled={!lines.length}
        busy={busy}
        onCancel={onCancel}
        onDelete={value ? remove : undefined}
        deleteLabel={t.common.delete}
      />
    </form>
  )
}
