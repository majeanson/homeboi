import { useState } from 'react'
import { useWrite } from '../../lib/write'
import { useT } from '../../i18n'
import { useConfirm } from '../../lib/confirm'
import { useVoiceInput } from '../../lib/useVoiceInput'
import { ColorPicker } from '../ColorPicker'
import { EditField } from '../EditField'
import { Cluster } from '../Layout'
import { RecurPicker, type RecurValue } from '../RecurPicker'
import { StatusMessage } from '../StatusMessage'
import { FormFooter } from '../FormFooter'
import { MemberSwitcher, type MemberFace } from '../MemberSwitcher'
import { ReminderTimesField, minutesToHhmm, hhmmToMinutes } from '../habits/ReminderTimesField'
import { recurOf } from '../../lib/recurLabel'
import { HABITS_KEY, BOARD_KEY, MONTH_KEY } from '../../lib/queryKeys'
import {
  hourSlots,
  DEFAULT_DAY_TIMES,
  DEFAULT_EVERY_HOURS,
  DEFAULT_WINDOW_START,
  DEFAULT_WINDOW_END,
  MAX_DAY_TIMES,
  type Habit,
  type HabitCadence,
  type HabitKind,
} from '../../lib/habits'

// The « Mes habitudes » form — create and edit. Owns its POST/PATCH; calls
// onSaved() when done. Pass `value` to edit in place (with a `key` so it re-inits
// when the target changes), mirroring ChoreForm/EventForm.
//
// Cadence is a four-way segment, NOT a widened Recur. « Selon un horaire » reuses
// the shared RecurPicker untouched; the other three are habit-local shapes that
// occurrenceOn cannot express (see lib/habits):
//   • « X fois par semaine » — a quota over completion history.
//   • « X fois par jour »    — a quota inside the day.
//   • « Aux X heures »       — moments spaced through a waking window, which also
//     become the habit's reminder times (so the hand-typed list steps aside).

// The four kinds the FORM offers — 'defi' is a system-created standing habit
// (« Le défi du jour »), never authored here, so it's excluded (and its narrowed
// tuple type keeps `fn.kind[k]` indexable, which the full HabitKind isn't).
const KINDS = ['do', 'count', 'limit', 'avoid'] as const
const CADENCES: HabitCadence[] = ['recur', 'week', 'day', 'hours']

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
  const voice = useVoiceInput(setTitle)
  const [icon, setIcon] = useState(value?.icon ?? '')
  const [colour, setColour] = useState(value?.colour ?? '#88A36F')
  const [memberId, setMemberId] = useState<string | null>(value?.member_id ?? null)
  const [kind, setKind] = useState<HabitKind>(value?.kind ?? 'do')
  const [target, setTarget] = useState(String(value?.target ?? 1))
  const [unit, setUnit] = useState(value?.unit ?? '')
  const [cadence, setCadence] = useState<HabitCadence>(value?.cadence ?? 'recur')
  const [recur, setRecur] = useState<RecurValue | null>(recurOf(value?.recur))
  const [weekTimes, setWeekTimes] = useState(value?.week_times ?? 2)
  // An 'hours' habit's day_times is server-DERIVED, so it never seeds the « X fois
  // par jour » field — only a genuine 'day' habit does.
  const [dayTimes, setDayTimes] = useState((value?.cadence === 'day' && value.day_times) || DEFAULT_DAY_TIMES)
  const [everyHours, setEveryHours] = useState(value?.every_hours ?? DEFAULT_EVERY_HOURS)
  const [windowStart, setWindowStart] = useState(value?.window_start ?? DEFAULT_WINDOW_START)
  const [windowEnd, setWindowEnd] = useState(value?.window_end ?? DEFAULT_WINDOW_END)
  const [reminders, setReminders] = useState<number[]>(value?.reminders ?? [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  const counted = kind === 'count' || kind === 'limit'
  // Live preview of the moments the hours rhythm makes — the same list the check-in
  // scene will nudge at. Derived from the draft, so it moves as the numbers move.
  const slots = hourSlots({ cadence: 'hours', every_hours: everyHours, window_start: windowStart, window_end: windowEnd })

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
      // a `recur` one has no quota. A null rule on 'recur' reads as "every day". The
      // server NULLs the shapes it wasn't sent, so switching rhythms leaves nothing
      // stale behind; `hours` sends its window and gets its day_times computed there.
      recur: cadence === 'recur' ? recur : null,
      weekTimes: cadence === 'week' ? weekTimes : null,
      dayTimes: cadence === 'day' ? dayTimes : null,
      everyHours: cadence === 'hours' ? everyHours : null,
      windowStart: cadence === 'hours' ? windowStart : null,
      windowEnd: cadence === 'hours' ? windowEnd : null,
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
    if (!value || busy) return
    setBusy(true)
    setErr(false)
    try {
      await write('habits', {
        method: 'PATCH',
        body: { id: value.id, archived: !value.archived },
        affectedKeys: [HABITS_KEY, BOARD_KEY, MONTH_KEY],
      })
      onSaved()
    } catch {
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!value || busy) return
    // A habit carries its history, so removing it is a heavy delete: confirm.
    if (!(await confirm({ message: fn.deleteConfirm(value.title), confirmLabel: t.common.delete, tone: 'danger' }))) return
    setBusy(true)
    setErr(false)
    try {
      await write('habits', {
        method: 'DELETE',
        body: { id: value.id },
        affectedKeys: [HABITS_KEY, BOARD_KEY, MONTH_KEY],
      })
      ;(onDeleted ?? onSaved)()
    } catch {
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="operator__inline-form habit-form" onSubmit={submit}>
      <EditField
        as="div"
        value={title}
        onChange={setTitle}
        onSubmit={() => submit()}
        submitIcon={null}
        voice={voice}
        voiceLabel={t.capture.voice}
        placeholder={voice.listening ? t.capture.listening : fn.titlePlaceholder}
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

      {/* Cadence: a schedule (the shared engine), a weekly quota, or one of the two
          intra-day rhythms — all habit-local shapes.

          Three blocks of this form all speak about time — the rhythm, the schedule's
          « Répéter », and the reminder hours — and they used to read as rivals. So the
          chosen rhythm's controls live INSIDE this fieldset, tucked behind a tinted
          rule: whatever is showing there is plainly the detail of the segment above it,
          and « Rappels » below is plainly something else. Each block also says in one
          line what question it answers. */}
      <fieldset className="habit-form__cadence">
        <legend className="habit-form__legend">
          <span className="habit-form__legend-title mono">{fn.cadenceLabel}</span>
          <span className="habit-form__legend-sub mono">{fn.cadenceSub}</span>
        </legend>
        <Cluster className="habit-form__segs">
          {CADENCES.map((c) => (
            <label key={c} className={'habit-form__seg' + (cadence === c ? ' is-on' : '')}>
              <input type="radio" name="habit-cadence" checked={cadence === c} onChange={() => setCadence(c)} />
              {fn.cadenceName[c]}
            </label>
          ))}
        </Cluster>

        <div className="habit-form__cadence-body">
          {cadence === 'recur' && (
            <>
              {/* The hint leads, so « Répéter » arrives already explained. */}
              <p className="habit-form__hint mono">{recur ? fn.scheduleHint : fn.everyDayHint}</p>
              <RecurPicker value={recur} onChange={setRecur} />
            </>
          )}

          {cadence === 'week' && (
            <>
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
              <p className="habit-form__hint mono">{fn.weekHint}</p>
            </>
          )}

          {/* « X fois par jour » — the daily twin of the weekly quota. */}
          {cadence === 'day' && (
            <>
              <label className="recur__row mono">
                <span>{fn.dayTimesLabel}</span>
                <input
                  className="input recur__interval"
                  type="number"
                  min={1}
                  max={MAX_DAY_TIMES}
                  value={dayTimes}
                  onChange={(e) => setDayTimes(Math.max(1, Math.min(MAX_DAY_TIMES, Number(e.target.value) || 1)))}
                />
                <span>{fn.dayTimesUnit}</span>
              </label>
              <p className="habit-form__hint mono">{fn.intradayHint}</p>
            </>
          )}

          {/* « Aux X heures » — moments spaced through a waking window. The preview
              shows the exact times, because those ARE the reminders. */}
          {cadence === 'hours' && (
            <>
              <label className="recur__row mono">
                <span>{fn.everyHoursLabel}</span>
                <input
                  className="input recur__interval"
                  type="number"
                  min={1}
                  max={12}
                  value={everyHours}
                  onChange={(e) => setEveryHours(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                />
                <span>{fn.everyHoursUnit}</span>
              </label>
              <Cluster className="habit-form__window">
                <label className="recur__row mono">
                  <span>{fn.windowFromLabel}</span>
                  <input
                    className="input"
                    type="time"
                    value={minutesToHhmm(windowStart)}
                    aria-label={fn.windowFromLabel}
                    onChange={(e) => {
                      const m = hhmmToMinutes(e.target.value)
                      if (m !== null) setWindowStart(m)
                    }}
                  />
                </label>
                <label className="recur__row mono">
                  <span>{fn.windowToLabel}</span>
                  <input
                    className="input"
                    type="time"
                    value={minutesToHhmm(windowEnd)}
                    aria-label={fn.windowToLabel}
                    onChange={(e) => {
                      const m = hhmmToMinutes(e.target.value)
                      if (m !== null) setWindowEnd(m)
                    }}
                  />
                </label>
              </Cluster>
              {/* The moments the rhythm makes — the same list that will nudge. */}
              <p className="habit-form__moments mono">{fn.hoursMoments(slots.length, slots.map(minutesToHhmm).join(' · '))}</p>
              <p className="habit-form__hint mono">{fn.intradayHint}</p>
            </>
          )}
        </div>
      </fieldset>

      {/* An hours rhythm generates its own moments — a second, hand-typed list of
          times beside it would just be a way to disagree with itself. It still wears
          the « Rappels » heading, so the block never seems to disappear. */}
      {cadence === 'hours' ? (
        <div className="reminders">
          <span className="reminders__label mono">{fn.remindersLabel}</span>
          <p className="reminders__sub mono">{fn.remindersFromRhythm}</p>
          <p className="reminders__hint mono">{fn.remindersHint}</p>
        </div>
      ) : (
        <ReminderTimesField value={reminders} onChange={setReminders} />
      )}
      <ColorPicker value={colour} onChange={setColour} label={t.operator.colorLabel} />

      {err && <StatusMessage tone="error">{t.common.saveFailed}</StatusMessage>}
      {/* Delete rides FormFooter's own left-cluster slot like its siblings
          (RoutineForm/PetForm) — never a bespoke row below the footer. Pause
          (rest it, history kept) is the non-destructive `extra` beside it. */}
      <FormFooter
        saveLabel={value ? t.common.save : fn.add}
        saveDisabled={!title.trim()}
        busy={busy}
        onCancel={onCancel}
        onDelete={value ? remove : undefined}
        extra={
          value ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={pause} disabled={busy}>
              {value.archived ? fn.resume : fn.pause}
            </button>
          ) : undefined
        }
      />
    </form>
  )
}
