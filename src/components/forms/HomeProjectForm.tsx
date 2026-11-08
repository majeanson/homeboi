import { Field } from '../Field'
import { useState } from 'react'
import { useWrite } from '../../lib/write'
import { useLang, useT } from '../../i18n'
import { useOperatorT } from '../../i18n.operator'
import { LookPicker, type LookValue } from '../LookPicker'
import { EffortField } from '../EffortDots'
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
import { rotationOf } from '../../lib/tasks'
import { lookColour, subjectRefOf, suggestIcon, type SubjectRef } from '../../lib/subjects'
import { SubjectPicker, useInheritedLook } from '../tasks/SubjectPicker'
import { RotationField } from '../tasks/RotationField'
import { toFace, type FormMember } from '../FormScene'

// The "Projet / Entretien" (home_projects) form — title (with kind presets), free
// notes, an optional target budget, a colour, an optional date + recurrence + calm
// lead. ONE form for both kinds; `kind` is set by the active sub-tab, not a user
// field. Mirrors ChoreForm (and reuses RecurPicker/LeadPicker): owns its POST
// (create) / PATCH (edit); pass `value` (+ a `key`) to edit a row in place.
export function HomeProjectForm({
  kind,
  value,
  members = [],
  carnetId,
  onSaved,
  onCancel,
}: {
  kind: 'plan' | 'upkeep'
  value?: HomeProject | null
  // The household, for « Qui ? ». Absent where the form opens without a roster: « Qui ? » then
  // hides and the row's rotation is left as it was.
  members?: FormMember[] | undefined
  // « Les carnets »: when set, this Entretien row belongs to a carnet (a house, a
  // car, the water heater) — it still surfaces on the board exactly the same.
  carnetId?: string | null | undefined
  onSaved: () => void
  onCancel?: () => void
}) {
  const t = useT()
  const o18n = useOperatorT()
  const { lang } = useLang()
  const presets = homeProjectTemplates(kind, lang)
  const [title, setTitle] = useState(value?.title ?? '')
  const [notes, setNotes] = useState(value?.notes ?? '')
  const [budget, setBudget] = useState(value?.budget_cents != null ? String(value.budget_cents / 100) : '')
  // The look (0148): null in either half = « like its subject ». A stored colour that is the
  // column default was never a pick (lookColour), so the form opens on « like its subject ».
  const [look, setLook] = useState<LookValue>({ icon: value?.icon ?? null, colour: lookColour(value?.color) })
  // The effort (0149): five dots, null = not said.
  const [effort, setEffort] = useState<number | null>(value?.effort ?? null)
  // Optional date — the target date (a one-off plan) AND the recurrence anchor.
  // Empty = undated → the item rests in Réglages and never surfaces on the board.
  const [date, setDate] = useState(anchorSecToDate(value?.at))
  const [recur, setRecur] = useState<RecurValue | null>(recurOf(value?.recur_json))
  // « À partir de la dernière fois » (recur_from, mig 0119) — the cycle re-anchors
  // on the last check-off. Only meaningful with a recurrence.
  const [fromDone, setFromDone] = useState(value?.recur_from === 'done')
  const [rotation, setRotation] = useState<string[]>(rotationOf(value?.rotation_json))
  const [subject, setSubject] = useState<SubjectRef | null>(subjectRefOf(value))
  // Calm "Bientôt" lead — only meaningful with a date to anchor against.
  const [lead, setLead] = useState<number | null>(value?.lead_seconds ?? null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const write = useWrite()
  // A carnet's own section files the row there, so that carnet is what it inherits from.
  const inherit = useInheritedLook(carnetId !== undefined ? (carnetId ? { kind: 'carnet', id: carnetId } : null) : subject)

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
      color: look.colour,
      icon: look.icon,
      effort,
      at: anchor,
      recur,
      recurFrom: recur && fromDone ? 'done' : 'anchor',
      leadSeconds: anchor ? lead : null, // no date → no occurrence to remind about
      // A carnet's own section files the row back onto that carnet; every other form asks.
      ...(carnetId !== undefined ? { carnetId } : { subject }),
      ...(members.length > 0 ? { rotation } : {}),
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
        setLook({ icon: null, colour: null })
        setEffort(null)
        setDate('')
        setRecur(null)
        setFromDone(false)
        setLead(null)
        setRotation([])
        setSubject(null)
      }
      onSaved()
    } catch {
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  const addLabel = kind === 'upkeep' ? o18n.home.addEntretien : o18n.home.addProjet
  return (
    <form className="operator__inline-form operator__chore-form" onSubmit={submit}>
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
      {/* The « Courants » presets FILL that field, so they belong under it, not over
          it. They used to OPEN the form — four wrapped rows of chips before the name
          you came to type — which left this the one form scene 159px from its first
          field while every sibling (event / chore / habit / recipe / pet) leads with
          its name at ~16px. Same chips, same one tap; the form just says what it is
          first. */}
      <div className="picker-chips mono">
        <span className="picker-chips__label">{o18n.home.common}</span>
        {presets.map((p) => (
          <Chip key={p.label} onClick={() => setTitle(p.icon ? `${p.icon} ${p.label}` : p.label)}>
            {p.icon} {p.label}
          </Chip>
        ))}
      </div>
      <Field inline className="mono" label={o18n.home.budgetLabel}>
        <input
          className="input"
          inputMode="decimal"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder={o18n.home.budgetPlaceholder}
        />
      </Field>
      <textarea
        className="input"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder={o18n.home.notesPlaceholder}
        aria-label={o18n.home.notesLabel}
      />
      <Field inline className="mono" label={o18n.home.dateLabel}>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      {/* Seasonal cadence presets (Entretien only) — one tap fills date + recurrence;
          no new wire format, just sugar over the shared RecurPicker value. */}
      {kind === 'upkeep' && (
        <div className="picker-chips mono">
          <span className="picker-chips__label">{o18n.home.seasonLabel}</span>
          <Chip onClick={() => { setDate(everySeasonAnchorDate()); setRecur({ freq: 'monthly', interval: 3, weekdays: [] }) }}>
            {o18n.home.everySeason}
          </Chip>
          {(
            [
              ['spring', o18n.home.everySpring],
              ['summer', o18n.home.everySummer],
              ['autumn', o18n.home.everyAutumn],
              ['winter', o18n.home.everyWinter],
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
            {o18n.home.fromLastDone}
          </label>
          <p className="operator__seg-hint mono">{o18n.home.fromLastDoneHint}</p>
        </>
      )}
      {(date || recur) && <LeadPicker value={lead} onChange={setLead} />}
      {members.length > 0 && <RotationField faces={members.map(toFace)} value={rotation} onChange={setRotation} recurring={!!recur} />}
      {carnetId === undefined && <SubjectPicker value={subject} onChange={setSubject} exclude={value?.id} />}
      <LookPicker value={look} onChange={setLook} suggest={suggestIcon(title)} inherit={inherit} />
      <EffortField value={effort} onChange={setEffort} />
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
