import { useState } from 'react'
import { useWrite } from '../../lib/write'
import { useT } from '../../i18n'
import { useConfirm } from '../../lib/confirm'
import { ColorPicker } from '../ColorPicker'
import { EditField } from '../EditField'
import { RecurPicker, type RecurValue } from '../RecurPicker'
import { StatusMessage } from '../StatusMessage'
import { FormFooter } from '../FormFooter'
import { MemberSwitcher, type MemberFace } from '../MemberSwitcher'
import { ReminderTimesField } from '../habits/ReminderTimesField'
import { recurOf } from '../../lib/recurLabel'
import { HABITS_KEY, BOARD_KEY, MONTH_KEY } from '../../lib/queryKeys'
import type { Habit, HabitCadence, HabitKind } from '../../lib/habits'

// The « Mes habitudes » form — create and edit. Owns its POST/PATCH; calls
// onSaved() when done. Pass `value` to edit in place (with a `key` so it re-inits
// when the target changes), mirroring ChoreForm/EventForm.
//
// Cadence is a two-way segment, NOT a widened Recur: « Selon un horaire » reuses
// the shared RecurPicker untouched, while « X fois par semaine » is a quota over
// completion history — a shape occurrenceOn cannot express (see lib/habits).

const KINDS: HabitKind[] = ['do', 'count', 'limit', 'avoid']

export function HabitForm({
  faces,
  value,
  onSaved,
  onCancel,
  onDeleted,
}: {
  faces: MemberFace[]
  value?: Habit | null
  onSaved: () => void
  onCancel?: () => void
  onDeleted?: () => void
}) {
  const t = useT()
  const fn = t.habits
  const write = useWrite()
  const confirm = useConfirm()

  const [title, setTitle] = useState(value?.title ?? '')
  const [icon, setIcon] = useState(value?.icon ?? '')
  const [colour, setColour] = useState(value?.colour ?? '#88A36F')
  const [memberId, setMemberId] = useState<string | null>(value?.member_id ?? null)
  const [kind, setKind] = useState<HabitKind>(value?.kind ?? 'do')
  const [target, setTarget] = useState(String(value?.target ?? 1))
  const [unit, setUnit] = useState(value?.unit ?? '')
  const [cadence, setCadence] = useState<HabitCadence>(value?.cadence ?? 'recur')
  const [recur, setRecur] = useState<RecurValue | null>(recurOf(value?.recur))
  const [weekTimes, setWeekTimes] = useState(value?.week_times ?? 2)
  const [reminders, setReminders] = useState<number[]>(value?.reminders ?? [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  const counted = kind === 'count' || kind === 'limit'

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    setErr(false)
    const fields = {
      title: title.trim(),
      icon: icon.trim(),
      colour,
      memberId,
      kind,
      // Only a counted habit carries a goal/ceiling; the server nulls the rest.
      target: counted ? Math.max(1, Number(target) || 1) : null,
      unit: counted ? unit.trim() : '',
      cadence,
      // Each cadence sends only its own shape — a `week` habit has no rule to expand,
      // a `recur` one has no quota. A null rule on 'recur' reads as "every day".
      recur: cadence === 'recur' ? recur : null,
      weekTimes: cadence === 'week' ? weekTimes : null,
      reminders,
    }
    try {
      await write('habits', {
        method: value ? 'PATCH' : 'POST',
        body: value ? { id: value.id, ...fields } : fields,
        affectedKeys: [HABITS_KEY, BOARD_KEY, MONTH_KEY],
      })
      onSaved()
    } catch {
      setErr(true) // keep the filled form — resetting on a failed write loses it
    } finally {
      setBusy(false)
    }
  }

  async function pause() {
    if (!value) return
    await write('habits', {
      method: 'PATCH',
      body: { id: value.id, archived: !value.archived },
      affectedKeys: [HABITS_KEY, BOARD_KEY, MONTH_KEY],
    })
    onSaved()
  }

  async function remove() {
    if (!value) return
    // A habit carries its history, so removing it is a heavy delete: confirm.
    if (!(await confirm({ message: fn.deleteConfirm(value.title), confirmLabel: t.common.delete, tone: 'danger' }))) return
    await write('habits', {
      method: 'DELETE',
      body: { id: value.id },
      affectedKeys: [HABITS_KEY, BOARD_KEY, MONTH_KEY],
    })
    ;(onDeleted ?? onSaved)()
  }

  return (
    <form className="operator__inline-form habit-form" onSubmit={submit}>
      <EditField
        as="div"
        value={title}
        onChange={setTitle}
        onSubmit={() => submit()}
        submitIcon={null}
        placeholder={fn.titlePlaceholder}
        ariaLabel={fn.titleLabel}
      />

      <label className="recur__row mono">
        <span>{fn.iconLabel}</span>
        <input
          className="input habit-form__icon"
          type="text"
          value={icon}
          maxLength={2}
          placeholder="🚶"
          aria-label={fn.iconLabel}
          onChange={(e) => setIcon(e.target.value)}
        />
      </label>

      {/* Whose habit? « Toute la maisonnée » (null) is the neutral default; a face
          makes it that member's, and private-ish on the check-in scene. */}
      <MemberSwitcher
        faces={faces}
        value={memberId}
        onChange={setMemberId}
        allLabel={fn.forHousehold}
        ariaLabel={fn.forWho}
        toggleOff={false}
      />

      {/* The four kinds, each with an example so the difference reads at a glance. */}
      <fieldset className="habit-form__kinds">
        <legend className="mono">{fn.kindLabel}</legend>
        {KINDS.map((k) => (
          <label key={k} className={'habit-form__kind' + (kind === k ? ' is-on' : '')}>
            <input type="radio" name="habit-kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
            <span className="habit-form__kind-text">
              <span className="habit-form__kind-name">{fn.kind[k]}</span>
              <span className="habit-form__kind-eg mono">{fn.kindExample[k]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {counted && (
        <div className="habit-form__target">
          <label className="recur__row mono">
            <span>{kind === 'count' ? fn.targetLabel : fn.ceilingLabel}</span>
            <input
              className="input recur__interval"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={target}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setTarget(e.target.value.replace(/\D/g, ''))}
              onBlur={() => setTarget(String(Math.max(1, Number(target) || 1)))}
            />
          </label>
          <label className="recur__row mono">
            <span>{fn.unitLabel}</span>
            <input
              className="input"
              type="text"
              value={unit}
              placeholder={fn.unitPlaceholder}
              onChange={(e) => setUnit(e.target.value)}
            />
          </label>
        </div>
      )}

      {/* Cadence: a schedule (the shared engine) OR a weekly quota (habit-local). */}
      <fieldset className="habit-form__cadence">
        <legend className="mono">{fn.cadenceLabel}</legend>
        <label className={'habit-form__seg' + (cadence === 'recur' ? ' is-on' : '')}>
          <input type="radio" name="habit-cadence" checked={cadence === 'recur'} onChange={() => setCadence('recur')} />
          {fn.cadenceSchedule}
        </label>
        <label className={'habit-form__seg' + (cadence === 'week' ? ' is-on' : '')}>
          <input type="radio" name="habit-cadence" checked={cadence === 'week'} onChange={() => setCadence('week')} />
          {fn.cadenceWeek}
        </label>
      </fieldset>

      {cadence === 'recur' ? (
        <>
          <RecurPicker value={recur} onChange={setRecur} />
          {!recur && <p className="operator__seg-hint mono">{fn.everyDayHint}</p>}
        </>
      ) : (
        <label className="recur__row mono">
          <span>{fn.weekTimesLabel}</span>
          <input
            className="input recur__interval"
            type="number"
            min={1}
            max={7}
            value={weekTimes}
            onChange={(e) => setWeekTimes(Math.max(1, Math.min(7, Number(e.target.value) || 1)))}
          />
          <span>{fn.weekTimesUnit}</span>
        </label>
      )}

      <ReminderTimesField value={reminders} onChange={setReminders} />
      <ColorPicker value={colour} onChange={setColour} label={t.operator.colorLabel} />

      {err && <StatusMessage tone="error">{t.common.saveFailed}</StatusMessage>}
      <FormFooter saveLabel={value ? t.common.save : fn.add} saveDisabled={!title.trim()} busy={busy} onCancel={onCancel} />

      {/* Editing an existing habit: rest it (history kept) or remove it for good. */}
      {value && (
        <div className="habit-form__manage">
          <button type="button" className="btn btn--ghost" onClick={pause}>
            {value.archived ? fn.resume : fn.pause}
          </button>
          <button type="button" className="btn btn--ghost habit-form__delete" onClick={remove}>
            {t.common.delete}
          </button>
        </div>
      )}
    </form>
  )
}
