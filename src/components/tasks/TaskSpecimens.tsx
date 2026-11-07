import { useState } from 'react'
import type { SubjectRef } from '../../lib/subjects'
import { RotationField } from './RotationField'
import { SubjectPicker } from './SubjectPicker'
import { SubjectTasks } from './SubjectTasks'
import { TaskList } from './TaskList'
import { useTaskActions } from './useTaskActions'
import type { TaskItem } from '../../lib/tasks'

// The /dev/kit specimens of the task family. Its own module, lazy, because the DevKit chunk has
// an online-only cap and these pull the whole row with them.
const BASE = {
  key: 'todo:demo',
  source: 'todo',
  id: 'demo',
  title: 'Appeler la garderie',
  color: null,
  subject: null,
  kind: null,
  recurring: false,
  recurJson: null,
  day: null,
  dueToday: true,
  overdueSince: null,
  snoozedUntil: null,
  soon: false,
  done: 'open',
  doneAt: null,
  who_id: null,
  team: [],
  onBoard: true,
} satisfies TaskItem

const MEMBERS = [
  { id: 'm1', display_name: 'Camille', colour: 'var(--berry)', avatar_kind: 'initial', avatar_ref: '', is_child: 0 },
  { id: 'm2', display_name: 'Noah', colour: 'var(--sky)', avatar_kind: 'initial', avatar_ref: '', is_child: 0 },
]

export function SubjectTasksSpecimen() {
  return <SubjectTasks subject={{ kind: 'carnet', id: 'c1' }} />
}

export function SubjectPickerSpecimen() {
  const [value, setValue] = useState<SubjectRef | null>(null)
  return <SubjectPicker value={value} onChange={setValue} />
}

export function RotationFieldSpecimen() {
  const [value, setValue] = useState<string[]>(['m1', 'm2'])
  return <RotationField faces={MEMBERS.map((m) => ({ id: m.id, name: m.display_name, colour: m.colour }))} value={value} onChange={setValue} recurring />
}

// Three rows, three shapes of the one task: due, whose turn, ticked. The hook is the real one,
// so a tap here writes like it would anywhere else (these ids are in no table).
export function TaskListSpecimen() {
  const actions = useTaskActions()
  const items: TaskItem[] = [
    { ...BASE, key: 'home:d1', source: 'home', id: 'd1', title: 'Nettoyer les gouttières', subject: { kind: 'carnet', id: 'c1' } },
    { ...BASE, key: 'chore:d2', source: 'chore', id: 'd2', title: 'Sortir le bac', recurring: true, who_id: 'm1', team: ['m1', 'm2'] },
    { ...BASE, key: 'todo:d3', id: 'd3', title: 'Remplir le formulaire', done: 'ticked', doneAt: 1 },
  ]
  return <TaskList items={items} members={MEMBERS} lookup={{ members: MEMBERS, carnets: [{ id: 'c1', name: 'La maison', kind: 'home' }] }} actions={actions} />
}
