import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { MEMBERS_KEY, TASKS_KEY } from '../../lib/queryKeys'
import { type SubjectKind, type SubjectLookup, type SubjectRef } from '../../lib/subjects'
import { Field } from '../Field'

// « Sur quoi ? » in a form: one select, grouped by kind, because a task has exactly one subject
// or none. The rows come from the same cold read the Tâches view uses. A household member with
// a linked contact appears once, as the member: it is the same person.
interface Frame {
  subjects: SubjectLookup
}

export function SubjectPicker({ value, onChange, exclude }: { value: SubjectRef | null; onChange: (v: SubjectRef | null) => void; exclude?: string | undefined }) {
  const t = useT()
  const q = useQuery({ queryKey: TASKS_KEY, queryFn: () => api<Frame>('tasks') })
  const membersQ = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: { id: string; display_name: string }[] }>('members') })
  const s = q.data?.subjects
  const groups: { kind: SubjectKind; rows: { id: string; label: string }[] }[] = [
    { kind: 'carnet', rows: (s?.carnets ?? []).map((x) => ({ id: x.id, label: x.name })) },
    {
      kind: 'person',
      rows: [
        ...(membersQ.data?.members ?? []).map((x) => ({ id: x.id, label: x.display_name })),
        ...(s?.contacts ?? []).filter((x) => !x.member_id).map((x) => ({ id: x.id, label: x.name })),
      ],
    },
    { kind: 'pet', rows: (s?.pets ?? []).map((x) => ({ id: x.id, label: x.name })) },
    { kind: 'project', rows: (s?.projects ?? []).filter((x) => x.id !== exclude).map((x) => ({ id: x.id, label: x.title })) },
    { kind: 'trip', rows: (s?.trips ?? []).map((x) => ({ id: x.id, label: x.title })) },
  ]
  return (
    <Field inline className="mono" label={t.tasks.subjectLabel}>
      <select
        className="input"
        value={value ? `${value.kind}:${value.id}` : ''}
        onChange={(e) => {
          const raw = e.target.value
          const at = raw.indexOf(':')
          onChange(at > 0 ? { kind: raw.slice(0, at) as SubjectKind, id: raw.slice(at + 1) } : null)
        }}
      >
        <option value="">{t.tasks.noSubject}</option>
        {groups
          .filter((g) => g.rows.length > 0)
          .map((g) => (
            <optgroup key={g.kind} label={t.tasks.subjectKinds[g.kind]}>
              {g.rows.map((r) => (
                <option key={r.id} value={`${g.kind}:${r.id}`}>
                  {r.label}
                </option>
              ))}
            </optgroup>
          ))}
      </select>
    </Field>
  )
}
