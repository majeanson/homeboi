import { useState } from 'react'
import { useWrite } from '../../lib/write'
import { useLang, useT } from '../../i18n'
import { ColorPicker } from '../ColorPicker'
import { Chip } from '../Chip'
import { EditField } from '../EditField'
import { RecurPicker, type RecurValue } from '../RecurPicker'
import { LeadPicker } from '../LeadPicker'
import { StatusMessage } from '../StatusMessage'
import { FormFooter } from '../FormFooter'
import { anchorSecToDate, dateToAnchorSec, recurOf, todayAnchorDate } from '../../lib/recurLabel'
import { homeProjectTemplates } from '../../lib/routineTemplates'
import { nextSeasonAnchorDate, everySeasonAnchorDate, type Season } from '../../lib/season'
import { parseMoney } from '../../lib/money'
import { HOME_PROJECTS_KEY, MONTH_KEY, BOARD_KEY, CARNETS_KEY } from '../../lib/queryKeys'
import type { HomeProject } from '../operator/types'
import { colourFor } from '../../lib/things'

// The "Projet / Entretien" (home_projects) form — title (with kind presets), free
// notes, an optional target budget, a colour, an optional date + recurrence + calm
// lead. ONE form for both kinds; `kind` is set by the active sub-tab, not a user
// field. Mirrors ChoreForm (and reuses RecurPicker/LeadPicker): owns its POST
// (create) / PATCH (edit); pass `value` (+ a `key`) to edit a row in place.
export function HomeProjectForm({
  kind,
  value,
  carnetId,
  onSaved,
  onCancel,
}: {
  kind: 'plan' | 'upkeep'
  value?: HomeProject | null
  // « Les carnets »: when set, this Entretien row belongs to a carnet (a house, a
  // car, the water heater) — it still surfaces on the board exactly the same.
  carnetId?: string | null
  onSaved: () => void
  onCancel?: () => void
}) {
  const t = useT()
  const { lang } = useLang()
  const presets = homeProjectTemplates(kind, lang)
  const [title, setTitle] = useState(value?.title ?? '')
  const [notes, setNotes] = useState(value?.notes ?? '')
  const [budget, setBudget] = useState(value?.budget_cents != null ? String(value.budget_cents / 100) : '')
  const [color, setColor] = useState(colourFor('project', value?.color))
  // Optional date — the target date (a one-off plan) AND the recurrence anchor.
  // Empty = undated → the item rests in Réglages and never surfaces on the board.
  const [date, setDate] = useState(anchorSecToDate(value?.at))
  const [recur, setRecur] = useState<RecurValue | null>(recurOf(value?.recur_json))
  // « À partir de la dernière fois » (recur_from, mig 0119) — the cycle re-anchors
  // on the last check-off. Only meaningful with a recurrence.
  const [fromDone, setFromDone] = useState(value?.recur_from === 'done')
  // Calm "Bientôt" lead — only meaningful with a date to anchor against.
  const [lead, setLead] = useState<number | null>(value?.lead_seconds ?? null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const write = useWrite()

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    setErr(false)
    // A recurrence needs an anchor: fall back to today when the operator picked a
    // cadence but left the date blank, mirroring ChoreForm's default anchor.
    const anchor = date ? dateToAnchorSec(date) : recur ? dateToAnchorSec(todayAnchorDate()) : null
    const fields = {
      kind,
      title: title.trim(),
      notes: notes.trim() || null,
      budgetCents: parseMoney(budget),
      color,
      at: anchor,
      recur,
      recurFrom: recur && fromDone ? 'done' : 'anchor',
      leadSeconds: anchor ? lead : null, // no date → no occurrence to remind about
      ...(carnetId !== undefined ? { carnetId } : {}),
    }
    try {
      await write('home-projects', {
        method: value ? 'PATCH' : 'POST',
        body: value ? { id: value.id, ...fields } : fields,
        affectedKeys: [HOME_PROJECTS_KEY, BOARD_KEY, MONTH_KEY, CARNETS_KEY],
      })
      if (!value) {
        // Create: clear for the next one. Edit: the section closes via onSaved().
        setTitle('')
        setNotes('')
        setBudget('')
        setColor('#88A36F')
        setDate('')
        setRecur(null)
        setFromDone(false)
        setLead(null)
      }
      onSaved()
    } catch {
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  const addLabel = kind === 'upkeep' ? t.operator.home.addEntretien : t.operator.home.addProjet
  return (
    <form className="operator__inline-form operator__chore-form" onSubmit={submit}>
      <div className="picker-chips mono">
        <span className="picker-chips__label">{t.operator.home.common}</span>
        {presets.map((p) => (
          <Chip key={p.label} onClick={() => setTitle(p.icon ? `${p.icon} ${p.label}` : p.label)}>
            {p.icon} {p.label}
          </Chip>
        ))}
      </div>
      {/* Title reuses EditField (clear ✕ + mic + Enter-commit), matching its sibling
          ChoreForm — this was the lone operator form still on a bare <input>. */}
      <EditField
        as="div"
        value={title}
        onChange={setTitle}
        onSubmit={() => submit()}
        submitIcon={null}
        placeholder={addLabel}
        ariaLabel={addLabel}
      />
      <label className="recur__row mono">
        <span>{t.operator.home.budgetLabel}</span>
        <input
          className="input"
          inputMode="decimal"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder={t.operator.home.budgetPlaceholder}
        />
      </label>
      <textarea
        className="input"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder={t.operator.home.notesPlaceholder}
        aria-label={t.operator.home.notesLabel}
      />
      <ColorPicker value={color} onChange={setColor} label={t.operator.colorLabel} />
      <label className="recur__row mono">
        <span>{t.operator.home.dateLabel}</span>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      {/* Seasonal cadence presets (Entretien only) — one tap fills date + recurrence;
          no new wire format, just sugar over the shared RecurPicker value. */}
      {kind === 'upkeep' && (
        <div className="picker-chips mono">
          <span className="picker-chips__label">{t.operator.home.seasonLabel}</span>
          <Chip onClick={() => { setDate(everySeasonAnchorDate()); setRecur({ freq: 'monthly', interval: 3, weekdays: [] }) }}>
            {t.operator.home.everySeason}
          </Chip>
          {(
            [
              ['spring', t.operator.home.everySpring],
              ['summer', t.operator.home.everySummer],
              ['autumn', t.operator.home.everyAutumn],
              ['winter', t.operator.home.everyWinter],
            ] as [Season, string][]
          ).map(([s, label]) => (
            <Chip key={s} onClick={() => { setDate(nextSeasonAnchorDate(s)); setRecur({ freq: 'yearly', interval: 1, weekdays: [] }) }}>
              {label}
            </Chip>
          ))}
        </div>
      )}
      <RecurPicker value={recur} onChange={setRecur} />
      {recur && (
        <>
          {/* « À partir de la dernière fois » — same check+hint pattern as
              ChoreForm's « Annoncer la veille » (D-21). */}
          <label className="operator__check mono">
            <input type="checkbox" checked={fromDone} onChange={(e) => setFromDone(e.target.checked)} />
            {t.operator.home.fromLastDone}
          </label>
          <p className="operator__seg-hint mono">{t.operator.home.fromLastDoneHint}</p>
        </>
      )}
      {(date || recur) && <LeadPicker value={lead} onChange={setLead} />}
      {err && <StatusMessage tone="error">{t.common.saveFailed}</StatusMessage>}
      <FormFooter
        saveLabel={value ? t.common.save : addLabel}
        saveDisabled={!title.trim()}
        busy={busy}
        onCancel={onCancel}
      />
    </form>
  )
}
