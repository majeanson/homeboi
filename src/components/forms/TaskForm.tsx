import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../../i18n'
import { useOperatorT } from '../../i18n.operator'
import { api } from '../../lib/api'
import { formatDayMaybeYear } from '../../lib/format'
import { localDayFromInput } from '../../lib/localDay'
import { MEMBERS_KEY } from '../../lib/queryKeys'
import { recurLabel, todayAnchorDate } from '../../lib/recurLabel'
import { choreTemplates, homeProjectTemplates } from '../../lib/routineTemplates'
import { everySeasonAnchorDate, nextSeasonAnchorDate, type Season } from '../../lib/season'
import { subjectOf, suggestIcon } from '../../lib/subjects'
import { draftTarget, draftUnheld, emptyDraft, taskWrite, type TaskDraft } from '../../lib/taskSave'
import type { TaskFace } from '../../lib/taskTarget'
import { useCreateWithUndo } from '../../lib/undoCreate'
import { useVoiceInput } from '../../lib/useVoiceInput'
import { useWrite } from '../../lib/write'
import { Chip } from '../Chip'
import { Disclosure } from '../Disclosure'
import { EffortField } from '../EffortDots'
import { EntityCombobox, type ComboOption } from '../EntityCombobox'
import { Field } from '../Field'
import { FormFooter } from '../FormFooter'
import { toFace, type FormMember } from '../FormScene'
import { LeadPicker } from '../LeadPicker'
import { LookPicker } from '../LookPicker'
import { RecurPicker } from '../RecurPicker'
import { StatusMessage } from '../StatusMessage'
import { RotationField } from '../tasks/RotationField'
import { SubjectPicker, useInheritedLook, useSubjectLookup } from '../tasks/SubjectPicker'

// THE ONE TASK FORM (plans/2026-11-06-TACHE-UNIFIEE.md, phase 4). « At its core a simple todo
// like the most basic todo app is a kind of task, up to the recurrent gouttière rotating. »
//
// It opens as ONE title field. Every other answer is a layer, folded, one tap away: Quand ?,
// Qui ?, Sur quoi ?, Allure, Effort, Notes et budget. A fold that holds an answer opens itself
// and says it while closed (LEAN invariant 1). There is no « type » to pick, and this file never
// asks which face a task wears: every save goes through the one save adapter (lib/taskSave) to
// one endpoint, and the server picks the face from the layers (`taskTarget`, `faceAfter`).
// `task-form-rule.test.ts` holds both halves: only the title is required, and no branch here
// names a face.
//
// Since the merge (0150) an edit keeps every layer: a row that gains one its face does not
// show moves up to a face that does. One combination still has no face: « annoncer la veille »
// with a home-only layer (notes, a budget…). The form says so in one calm line, and saves the
// rest: nothing is dropped unsaid.

type Idea = ComboOption<{ title: string } | { extra: unknown }>

export function TaskForm({
  value,
  seed,
  extra,
  saveLabel,
  onSaved,
  onCancel,
}: {
  /** An existing task: where it lives, and what it says now. Absent = a new task. */
  value?: { table: TaskFace; id: string; draft: TaskDraft } | null | undefined
  /** A new task's starting answers, from the door that opened it (a day, a subject, a kind). */
  seed?: TaskDraft | undefined
  /** More picks for the title field (the ＋ sheet's departure checklists), and what one does. */
  extra?: { options: ComboOption<unknown>[]; onSelect: (data: unknown, draft: TaskDraft) => void } | undefined
  saveLabel?: string | undefined
  onSaved: () => void
  onCancel?: (() => void) | undefined
}) {
  const t = useT()
  const o18n = useOperatorT()
  const { lang } = useLang()
  const f = t.tasks.form
  const initial = value?.draft ?? seed
  const [draft, setDraft] = useState<TaskDraft>(() => initial ?? emptyDraft())
  const set = (patch: Partial<TaskDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const voice = useVoiceInput((title) => set({ title }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const write = useWrite()
  const createWithUndo = useCreateWithUndo()
  const lookup = useSubjectLookup()
  const inherit = useInheritedLook(draft.subject)
  const membersQ = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: FormMember[] }>('members') })
  const members = membersQ.data?.members ?? []

  // The face this task wears (an edit) or will wear (a new one), and what that save cannot keep.
  const table = value?.table ?? draftTarget(draft)
  const lost = draftUnheld(table, draft)

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!draft.title.trim() || busy) return
    setBusy(true)
    setErr(false)
    const w = taskWrite(draft, value ?? null)
    try {
      if (value) await write(w.endpoint, { method: w.method, body: w.body, affectedKeys: w.affectedKeys })
      else
        await createWithUndo({ endpoint: w.endpoint, body: w.body, affectedKeys: w.affectedKeys, message: t.undo.added(draft.title.trim()), rethrow: true })
      if (!value) setDraft(seed ?? emptyDraft())
      onSaved()
    } catch {
      // Keep the filled form: resetting on a failed write loses the task.
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  // The title's ideas: the household's usual tasks, then whatever the door adds.
  const ideas: Idea[] = [...choreTemplates(lang), ...homeProjectTemplates('upkeep', lang), ...homeProjectTemplates('plan', lang)].map((p) => {
    const title = p.icon ? `${p.icon} ${p.label}` : p.label
    return { id: `idea:${title}`, label: title, data: { title }, group: f.ideas }
  })
  const options: Idea[] = [...(extra?.options ?? []).map((o): Idea => ({ ...o, data: { extra: o.data } })), ...ideas]

  // Each fold says what it holds while closed (LEAN invariant 1).
  const recurring = draft.recur != null
  const day = localDayFromInput(draft.date)
  const whenNote = recurring ? recurLabel(JSON.stringify(draft.recur), t) : day != null ? formatDayMaybeYear(day, lang) : f.someday
  const names = draft.rotation.map((id) => members.find((m) => m.id === id)?.display_name).filter(Boolean)
  const subjectName = draft.subject ? (subjectOf(draft.subject, lookup).name ?? t.tasks.subjectKinds[draft.subject.kind]) : null
  const notesNote = [draft.notes.trim().split('\n')[0]?.slice(0, 40), draft.budget.trim()].filter(Boolean).join(' · ')
  const filled = (v: unknown) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0)

  return (
    <form className="operator__inline-form operator__chore-form task-form" onSubmit={submit}>
      <EntityCombobox<Idea['data']>
        value={draft.title}
        onChange={(title) => set({ title })}
        options={options}
        onSelect={(opt) => {
          if ('title' in opt.data) set({ title: opt.data.title })
          else extra?.onSelect(opt.data.extra, draft)
        }}
        onSubmit={() => void submit()}
        submitIcon={null}
        voice={voice}
        placeholder={voice.listening ? t.capture.listening : t.todos.addPlaceholder}
        ariaLabel={t.todos.addPlaceholder}
      />

      <Disclosure label={f.when} note={whenNote} defaultOpen={recurring || !!draft.date} className="task-form__when">
        <Field inline className="mono" label={recurring ? f.from : f.date}>
          <input className="input" type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <RecurPicker value={draft.recur} onChange={(recur) => set({ recur, date: recur && !draft.date ? todayAnchorDate() : draft.date })} />
        {recurring && (
          <>
            {/* One tap fills the start and the rhythm: sugar over the same RecurPicker value. */}
            <div className="picker-chips mono">
              <span className="picker-chips__label">{o18n.home.seasonLabel}</span>
              <Chip onClick={() => set({ date: everySeasonAnchorDate(), recur: { freq: 'monthly', interval: 3, weekdays: [] } })}>{o18n.home.everySeason}</Chip>
              {(
                [
                  ['spring', o18n.home.everySpring],
                  ['summer', o18n.home.everySummer],
                  ['autumn', o18n.home.everyAutumn],
                  ['winter', o18n.home.everyWinter],
                ] as [Season, string][]
              ).map(([s, label]) => (
                <Chip key={s} onClick={() => set({ date: nextSeasonAnchorDate(s), recur: { freq: 'yearly', interval: 1, weekdays: [] } })}>
                  {label}
                </Chip>
              ))}
            </div>
            <label className="operator__check mono">
              <input type="checkbox" checked={draft.recurFrom === 'done'} onChange={(e) => set({ recurFrom: e.target.checked ? 'done' : 'anchor' })} />
              {o18n.home.fromLastDone}
            </label>
            <p className="operator__seg-hint mono">{o18n.home.fromLastDoneHint}</p>
            {/* « Sortir le bac »: one calm line on the board the evening before, never a push. */}
            <label className="operator__check mono">
              <input type="checkbox" checked={draft.announceEvening} onChange={(e) => set({ announceEvening: e.target.checked })} />
              {o18n.announceEveningLabel}
            </label>
            <p className="operator__seg-hint mono">{o18n.announceEveningHint}</p>
          </>
        )}
        {(recurring || !!draft.date) && <LeadPicker value={draft.lead} onChange={(lead) => set({ lead })} />}
      </Disclosure>

      <Disclosure label={f.who} {...(names.length ? { note: names.join(' → ') } : {})} defaultOpen={filled(draft.rotation)} className="task-form__who">
        <RotationField faces={members.map(toFace)} value={draft.rotation} onChange={(rotation) => set({ rotation })} recurring={recurring} />
      </Disclosure>

      <Disclosure label={t.tasks.subjectLabel} {...(subjectName ? { note: subjectName } : {})} defaultOpen={filled(draft.subject)} className="task-form__subject">
        <SubjectPicker value={draft.subject} onChange={(subject) => set({ subject })} exclude={value?.id} />
      </Disclosure>

      <LookPicker value={{ icon: draft.icon, colour: draft.colour }} onChange={(v) => set({ icon: v.icon, colour: v.colour })} suggest={suggestIcon(draft.title)} inherit={inherit} />
      <EffortField value={draft.effort} onChange={(effort) => set({ effort })} />

      <Disclosure label={f.notes} {...(notesNote ? { note: notesNote } : {})} defaultOpen={filled(draft.notes.trim()) || filled(draft.budget.trim())} className="task-form__notes">
        <textarea className="input" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} placeholder={o18n.home.notesPlaceholder} aria-label={o18n.home.notesLabel} />
        <Field inline className="mono" label={o18n.home.budgetLabel}>
          <input className="input" inputMode="decimal" value={draft.budget} onChange={(e) => set({ budget: e.target.value })} placeholder={o18n.home.budgetPlaceholder} />
        </Field>
      </Disclosure>

      {lost.length > 0 && <StatusMessage tone="info">{f.unheld(lost.map((a) => f.axes[a]).join(', '))}</StatusMessage>}
      {err && <StatusMessage tone="error">{t.common.saveFailed}</StatusMessage>}
      <FormFooter saveLabel={saveLabel ?? (value ? t.common.save : t.common.add)} saveDisabled={!draft.title.trim()} busy={busy} onCancel={onCancel} />
    </form>
  )
}
