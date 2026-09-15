import { useMemo, useRef, useState } from 'react'
import { useT, useLang } from '../../i18n'
import { useConfirm } from '../../lib/confirm'
import { useProfile } from '../../lib/profile'
import { formatDay } from '../../lib/format'
import { formatMoneyExact, parseMoney } from '../../lib/money'
import { inputFromLocalDay, localDayFromInput } from '../../lib/localDay'
import {
  buildMemo,
  coveredDueDates,
  extraKey,
  extrasOf,
  offeredDueDates,
  rememberedExtras,
  transferTotal,
  uncoveredDueDates,
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
import { Disclosure } from '../Disclosure'
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
      // The lib owns this rule now — it was spelled out twice here, and the second
      // copy is exactly where the tracking floor would have been forgotten.
      const owed = uncoveredDueDates(p, transfers, initialSender, today)
      if (owed.length) out[p.id] = owed
    }
    return out
  })

  // THE EXTRAS: every amount riding on this send that is not a payment into an
  // agreement. One list, each row NAMED — « Renflouement », « Frais de maman »,
  // « Électricité ». There used to be a dedicated top-up field above a pile of
  // anonymous free lines; the only thing that made the top-up special was that this
  // household had a word for it, and now every extra can have one.
  //
  // Seeded from the transfer being edited. A legacy unnamed `topup` line arrives
  // carrying the app's own word for it, visible in the row before anything is saved —
  // so re-saving an old transfer names it rather than silently rewriting it. (`v.topup`
  // is read once here, as every `useState` initializer is: an EN reader who opens an
  // edit scene in the first frames after boot, before the EN dictionary resolves, would
  // name a legacy line in French. FR-first app, legacy-only path, visible in the field.)
  const rowId = useRef(0)
  const newRow = (label = '', amount = '') => ({ key: `x${rowId.current++}`, label, amount })
  const [extras, setExtras] = useState<{ key: string; label: string; amount: string }[]>(() =>
    value ? extrasOf(value.lines, v.topup).map((x) => newRow(x.label, String(x.amountCents / 100))) : [],
  )
  const [reference, setReference] = useState(value?.reference ?? '')
  // The household's own words about this send. The column has existed since migration
  // 0126 and `buildTransfer` has always rendered it in the peek — this form just never
  // wrote it (`note: null`, hard-coded), so the block was unreachable and the field
  // imaginary. It is the one place to record what the memo cannot say: the bank message
  // is accent-folded, capped and read by a stranger; this is read by the two of you.
  const [note, setNote] = useState(value?.note ?? '')
  // The memo regenerates as the draft changes UNTIL it is edited by hand; after that
  // the typed words are the ones that go to the bank. « Refaire le message » returns
  // control to the generator.
  const [memoEdited, setMemoEdited] = useState(!!value?.memo)
  const [memoText, setMemoText] = useState(value?.memo ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  // WHAT THIS FACE HAS SENT BEFORE. The due dates tick themselves because they are
  // DUE — that is a fact. An extra is the money the screen cannot know, and it is also
  // the money that repeats: it was a 2 000 $ renflouement last time and 200 $ to maman
  // the time before. So each one is OFFERED, one tap, and never slid into a field —
  // an amount filled in that nobody noticed is money sent that nobody decided.
  //
  // Offered while EDITING too, unlike the single top-up field this replaces: back then
  // the field's own value was the truth and a proposal beside it was noise, but a row
  // you forgot to add is a row you can still add, and anything already in the draft is
  // excluded by name anyway.
  const remembered = useMemo(
    () => rememberedExtras(transfers, sender, v.topup, { exclude: extras.map((x) => x.label) }),
    [transfers, sender, v.topup, extras],
  )

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
    // Every extra is a named line. The `topup` kind is never written again — it is
    // read (old rows), displayed and totalled, and a transfer that carried one leaves
    // this screen with the name the reader could see in the row.
    for (const x of extras) {
      const c = parseMoney(x.amount)
      if (c) out.push({ kind: 'other', label: x.label.trim(), amountCents: c })
    }
    return out
  }, [plans, ticked, sender, extras])

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
          note: note.trim() || null,
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
        // Everything still owed since this household started tracking, plus the next
        // few ahead — enough to pay early without scrolling a year of dates. A date
        // added BY HAND joins the row even though it sits outside both, or it would
        // vanish the moment it was picked.
        const offer = offeredDueDates(p, transfers, today, list)
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

      {/* EVERYTHING ELSE RIDING ON THE SAME SEND, each line named. One mechanism for
          what used to be two: a hardcoded « Renflouement » field, and anonymous free
          lines retyped every single time. A name typed once comes back as a chip
          below — which is the whole reason it is worth typing. */}
      <fieldset>
        <legend className="mono">{v.extras}</legend>
        {extras.map((x, i) => (
          <div className="virements__extra" key={x.key}>
            <input
              className="input"
              value={x.label}
              placeholder={v.extraLabel}
              aria-label={v.extraLabel}
              onChange={(e) => setExtras((cur) => cur.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))}
            />
            <input
              className="input virements__extra-amount"
              inputMode="decimal"
              value={x.amount}
              placeholder={v.amount}
              // Named after its OWN row once the row has a name: several amount fields
              // all announcing « Montant » is a screen read in the dark.
              aria-label={x.label.trim() ? `${x.label.trim()} — ${v.amount}` : v.amount}
              onChange={(e) => setExtras((cur) => cur.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))}
            />
            <RowActions onDelete={() => setExtras((cur) => cur.filter((_, j) => j !== i))} deleteLabel={t.common.delete} />
          </div>
        ))}

        {remembered.length > 0 && (
          <>
            <p className="operator__seg-hint mono">{v.extrasRecent}</p>
            <Cluster role="group" aria-label={v.extrasRecent}>
              {remembered.map((x) => (
                <Chip
                  key={extraKey(x.label)}
                  icon="arrow-counter-clockwise-bold"
                  onClick={() => setExtras((cur) => [...cur, newRow(x.label, String(x.amountCents / 100))])}
                >
                  {v.extraLikeLast(x.label, formatMoneyExact(x.amountCents, lang))}
                </Chip>
              ))}
            </Cluster>
          </>
        )}

        <Cluster>
          <Chip onClick={() => setExtras((cur) => [...cur, newRow()])} icon="plus-bold">
            {v.addLine}
          </Chip>
        </Cluster>
      </fieldset>

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

      {/* THE NOTE — folded, because it is the rarest field on a tall screen, and open
          on arrival whenever there is something in it: a fold must never hide a filled
          field (LEAN.md), which is also why editing a transfer that carries one shows
          it without a tap. Same `Disclosure` + `defaultOpen` pattern as the plan form's
          « Rattrapage ». */}
      <Disclosure label={v.note} defaultOpen={!!value?.note}>
        <EditField
          as="div"
          multiline
          value={note}
          onChange={setNote}
          submitIcon={null}
          allowEmpty
          placeholder={v.note}
          ariaLabel={v.note}
        />
        <p className="operator__seg-hint mono">{v.noteHint}</p>
      </Disclosure>

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
