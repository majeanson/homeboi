import { useT } from '../../i18n'
import { FIND_WHEN, type FindWhen } from '../../lib/tasks'
import { Disclosure } from '../Disclosure'
import { EffortDots, useEffortName } from '../EffortDots'
import { Field } from '../Field'
import { Segmented } from '../Segmented'

// « TROUVER QUOI FAIRE » (plans/2026-11-06-TACHE-UNIFIEE.md, phase 3b): « j'ai dix minutes »,
// « qu'est-ce qu'on prévoit cette année ? ». Two optional answers, how much I have and how far
// ahead, and the Tâches view's list narrows (`findable`, lib/tasks). It is a fold, so the view
// keeps its first screen; it opens itself when the URL already holds an answer, and its note
// says what it holds while closed (LEAN invariant 1).
//
// CALM: no total, no « 12 restantes », no count anywhere. The list narrowing IS the answer.
// Both rows clear the same way: tap the chosen one again.
export function TaskFinder({
  effort,
  when,
  onEffort,
  onWhen,
}: {
  effort: number | null
  when: FindWhen | null
  onEffort: (next: number | null) => void
  onWhen: (next: FindWhen | null) => void
}) {
  const t = useT()
  const nameOf = useEffortName()
  const effortName = nameOf(effort)
  const note = [effortName ? t.effort.upTo(effortName) : null, when ? t.effort.whenOptions[when] : null].filter(Boolean).join(' · ')
  return (
    <Disclosure label={t.effort.finder} {...(note ? { note } : {})} defaultOpen={effort != null || when != null} className="task-finder">
      <Field as="div" label={t.effort.atMost}>
        <EffortDots value={effort} onChange={onEffort} ariaLabel={t.effort.atMost} />
      </Field>
      <Field as="div" label={t.effort.when}>
        <Segmented<FindWhen>
          ariaLabel={t.effort.when}
          size="sm"
          value={when}
          onChange={(k) => onWhen(k === when ? null : k)}
          options={FIND_WHEN.map((k) => ({ key: k, label: t.effort.whenOptions[k] }))}
        />
      </Field>
    </Disclosure>
  )
}
