import { useState } from 'react'
import { useT } from '../../i18n'
import { useConfirm } from '../../lib/confirm'
import { parseMoney } from '../../lib/money'
import { anchorSecToDate, dateToAnchorSec, todayAnchorDate } from '../../lib/recurLabel'
import { useDeletePlan, useSavePlan, type TransferPlan } from '../../lib/transfers'
import { Avatar } from '../Avatar'
import { Chip } from '../Chip'
import { Cluster } from '../Layout'
import { Disclosure } from '../Disclosure'
import { EditField } from '../EditField'
import { FormFooter } from '../FormFooter'
import { RecurPicker, type RecurValue } from '../RecurPicker'
import { StatusMessage } from '../StatusMessage'
import type { FormMember } from '../FormScene'

// The standing agreement behind « Les virements »: what you split, how often it
// comes due, and who sends what. Written once; every transfer afterwards is ticked,
// not typed.
//
// Deliberately short. The only fields here are the ones a composer cannot infer —
// everything else (the total sent, which dates are covered, how much of a catch-up
// is closed) is DERIVED from the recorded transfers and must never become a field.
const cents = (v: string) => parseMoney(v)
const centsToField = (c: number | null | undefined) => (c != null ? String(c / 100) : '')

export function PlanForm({
  value,
  members,
  onSaved,
  onDeleted,
  onCancel,
}: {
  value?: TransferPlan | null
  members: FormMember[]
  onSaved: () => void
  onDeleted?: () => void
  onCancel?: () => void
}) {
  const t = useT()
  const v = t.virements
  const confirm = useConfirm()
  const save = useSavePlan()
  const del = useDeletePlan()

  const [title, setTitle] = useState(value?.title ?? '')
  const [amount, setAmount] = useState(centsToField(value?.amountCents))
  const [date, setDate] = useState(value ? anchorSecToDate(value.anchorAt) : todayAnchorDate())
  // The picker requires interval + weekdays; the wire shape has them optional.
  // Converting here (rather than loosening either type) is what keeps a stored rule
  // with no weekday list from reaching the picker as undefined.
  const [recur, setRecur] = useState<RecurValue | null>(
    value?.recur ? { freq: value.recur.freq, interval: value.recur.interval ?? 1, weekdays: value.recur.weekdays ?? [] } : null,
  )
  // Per-member share, as typed text so a half-entered amount never rounds itself.
  const [shares, setShares] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const [id, c] of Object.entries(value?.shares ?? {})) out[id] = String(c / 100)
    return out
  })

  // The catch-up agreement. Folded: most households split evenly and never open it.
  const [behind, setBehind] = useState<string | null>(value?.catchup?.behindMemberId ?? null)
  const [gap, setGap] = useState(centsToField(value?.catchup?.gapCents))
  const [asOf, setAsOf] = useState(value?.catchup ? anchorSecToDate(value.catchup.asOf) : '')
  const [termEnd, setTermEnd] = useState(value?.catchup ? anchorSecToDate(value.catchup.termEnd) : '')

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    setErr(false)

    const cleanShares: Record<string, number> = {}
    for (const [id, text] of Object.entries(shares)) {
      const c = cents(text)
      if (c != null && c > 0) cleanShares[id] = c
    }
    const gapCents = cents(gap)
    const asOfSec = asOf ? dateToAnchorSec(asOf) : null
    const termEndSec = termEnd ? dateToAnchorSec(termEnd) : null
    // A half-filled arrangement stores as « no arrangement » rather than as a shape
    // the reader would have to guard — the server applies the same rule.
    const catchup =
      behind && gapCents && asOfSec && termEndSec ? { behindMemberId: behind, gapCents, asOf: asOfSec, termEnd: termEndSec } : null

    try {
      await save(
        {
          title: title.trim(),
          amountCents: cents(amount),
          recur: recur ? { freq: recur.freq, interval: recur.interval, weekdays: recur.weekdays } : null,
          anchorAt: dateToAnchorSec(date) ?? dateToAnchorSec(todayAnchorDate())!,
          shares: cleanShares,
          catchup,
          colour: null,
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
    // useConfirm, not the undo toast: this form is a full-screen scene, and the
    // toast sits BELOW a scene in the layer scale — an « Annuler » offered from here
    // would be literally unreachable (ACTIONS.md's undo-tier rule).
    if (!(await confirm({ message: v.deletePlanConfirm, tone: 'danger' }))) return
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
    <form className="operator__inline-form" onSubmit={submit}>
      <EditField
        as="div"
        value={title}
        onChange={setTitle}
        onSubmit={() => submit()}
        submitIcon={null}
        placeholder={v.planTitle}
        ariaLabel={v.planTitle}
      />

      <label className="recur__row mono">
        <span>{v.planAmount}</span>
        <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <p className="operator__seg-hint mono">{v.planAmountHint}</p>

      <label className="recur__row mono">
        <span>{v.planWhen}</span>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <RecurPicker value={recur} onChange={setRecur} />

      {/* Who sends what. One row per household face — a household where only one
          person pays simply leaves the others blank. */}
      <fieldset className="virements__shares-field">
        <legend className="mono">{v.planShares}</legend>
        {members.filter((m) => !m.is_child).map((m) => (
          <label className="recur__row mono" key={m.id}>
            <span className="virements__share-label">
              <Avatar kind={m.avatar_kind} photo={m.avatar_ref} colour={m.colour} name={m.display_name} size={24} />
              {m.display_name}
            </span>
            <input
              className="input"
              inputMode="decimal"
              value={shares[m.id] ?? ''}
              onChange={(e) => setShares((s) => ({ ...s, [m.id]: e.target.value }))}
              aria-label={v.planShareOf(m.display_name)}
            />
          </label>
        ))}
      </fieldset>

      {/* « Rattrapage » — folded, because most households never have one. */}
      <Disclosure label={v.catchupFold} defaultOpen={!!value?.catchup}>
        <Cluster>
          {members.filter((m) => !m.is_child).map((m) => (
            <Chip key={m.id} selected={behind === m.id} onClick={() => setBehind(behind === m.id ? null : m.id)}>
              {m.display_name}
            </Chip>
          ))}
        </Cluster>
        <label className="recur__row mono">
          <span>{v.planAmount}</span>
          <input className="input" inputMode="decimal" value={gap} onChange={(e) => setGap(e.target.value)} />
        </label>
        <label className="recur__row mono">
          <span>{v.sentOn}</span>
          <input className="input" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </label>
        <label className="recur__row mono">
          <span>{v.planWhen}</span>
          <input className="input" type="date" value={termEnd} onChange={(e) => setTermEnd(e.target.value)} />
        </label>
      </Disclosure>

      {err && <StatusMessage tone="error">{t.common.saveFailed}</StatusMessage>}
      <FormFooter
        saveLabel={value ? t.common.save : v.addPlan}
        saveDisabled={!title.trim()}
        busy={busy}
        onCancel={onCancel}
        onDelete={value ? remove : undefined}
        deleteLabel={t.common.delete}
      />
    </form>
  )
}
