import { describe, it, expect } from 'vitest'
import {
  type Todo,
  type TodoTemplate,
  type TemplateItem,
  todosKey,
  todosPath,
  isOpen,
  isChecked,
  checkedIds,
  groupBySection,
  toStored,
  expandTemplate,
  expandSectioned,
  wouldCycle,
} from './todos'
import { TODOS_KEY } from './queryKeys'

const todo = (over: Partial<Todo>): Todo => ({
  id: 'x',
  title: 't',
  day: null,
  member_id: null,
  done_at: null,
  position: 0,
  section: null,
  ...over,
})

const item = (label: string): TemplateItem => ({ kind: 'item', label })
const ref = (refId: string): TemplateItem => ({ kind: 'ref', refId })
const tpl = (id: string, title: string, items: TemplateItem[]): TodoTemplate => ({ id, title, items, position: 0 })

describe('todos scope keys + paths', () => {
  it('uses the base key + path for the global glance', () => {
    expect(todosKey()).toBe(TODOS_KEY)
    expect(todosKey(null)).toBe(TODOS_KEY)
    expect(todosPath()).toBe('todos')
    expect(todosPath(null)).toBe('todos')
  })

  it('keys a day under TODOS_KEY so a prefix-invalidate refreshes it', () => {
    const day = 1_700_000_000
    expect(todosKey(day)).toEqual([...TODOS_KEY, day])
    expect(todosKey(day).slice(0, TODOS_KEY.length)).toEqual(TODOS_KEY)
    expect(todosPath(day)).toBe(`todos?date=${day}`)
  })
})

describe('open / checked', () => {
  it('reads done_at as the checked flag', () => {
    expect(isOpen(todo({ done_at: null }))).toBe(true)
    expect(isChecked(todo({ done_at: 123 }))).toBe(true)
  })
  it('checkedIds returns exactly the checked ids', () => {
    const list = [todo({ id: 'a', done_at: null }), todo({ id: 'b', done_at: 7 }), todo({ id: 'c', done_at: 8 })]
    expect(checkedIds(list)).toEqual(['b', 'c'])
  })
})

describe('groupBySection', () => {
  it('groups contiguous runs by section in order, loose runs headless', () => {
    const rows = [
      todo({ id: 'x', section: null }),
      todo({ id: 'a1', section: 'Avant de partir' }),
      todo({ id: 'a2', section: 'Avant de partir' }),
      todo({ id: 'b1', section: 'Chez grand-papa' }),
    ]
    const groups = groupBySection(rows)
    expect(groups.map((g) => [g.section, g.todos.map((t) => t.id)])).toEqual([
      [null, ['x']],
      ['Avant de partir', ['a1', 'a2']],
      ['Chez grand-papa', ['b1']],
    ])
  })
})

describe('toStored', () => {
  it('compacts items to bare strings and { ref }', () => {
    expect(toStored([item('lait'), ref('t2')])).toEqual(['lait', { ref: 't2' }])
  })
})

describe('expandTemplate (flatten one list)', () => {
  const A = tpl('A', 'A', [item('a1'), item('a2')])
  const B = tpl('B', 'B', [item('b1')])
  const D = tpl('D', 'D', [ref('A'), item('d1')])

  it('inlines refs and keeps loose items', () => {
    expect(expandTemplate([A, B, D], 'D')).toEqual(['a1', 'a2', 'd1'])
  })

  it('dedups labels case-insensitively within the result', () => {
    const X = tpl('X', 'X', [item('Lait'), ref('Y')])
    const Y = tpl('Y', 'Y', [item('lait'), item('Pain')])
    expect(expandTemplate([X, Y], 'X')).toEqual(['Lait', 'Pain'])
  })

  it('is cycle-safe: A refs B, B refs A', () => {
    const a = tpl('A', 'A', [item('a1'), ref('B')])
    const b = tpl('B', 'B', [item('b1'), ref('A')])
    expect(expandTemplate([a, b], 'A')).toEqual(['a1', 'b1'])
  })

  it('skips a missing ref', () => {
    expect(expandTemplate([tpl('A', 'A', [item('a1'), ref('gone')])], 'A')).toEqual(['a1'])
  })
})

describe('expandSectioned (the instantiated, sectioned result)', () => {
  const A = tpl('A', 'Avant de partir', [item('Patate'), item('Passeports')])
  const B = tpl('B', 'Chez grand-papa', [item('Patate'), item('Pyjama')])
  const E = tpl('E', 'E', [item('Lait'), ref('A'), ref('B')])

  it('loose items go headless; each ref becomes a titled section', () => {
    expect(expandSectioned([A, B, E], 'E')).toEqual([
      { label: 'Lait', section: null },
      { label: 'Patate', section: 'Avant de partir' },
      { label: 'Passeports', section: 'Avant de partir' },
      { label: 'Patate', section: 'Chez grand-papa' },
      { label: 'Pyjama', section: 'Chez grand-papa' },
    ])
  })

  it('keeps the same label from two lists, attributed to each source section', () => {
    const out = expandSectioned([A, B, E], 'E')
    const patates = out.filter((r) => r.label === 'Patate')
    expect(patates).toEqual([
      { label: 'Patate', section: 'Avant de partir' },
      { label: 'Patate', section: 'Chez grand-papa' },
    ])
  })

  it('a plain (un-composed) list instantiates flat + headless', () => {
    expect(expandSectioned([A], 'A')).toEqual([
      { label: 'Patate', section: null },
      { label: 'Passeports', section: null },
    ])
  })

  it('flattens a nested ref under its top-level section (D pulls in A)', () => {
    const a = tpl('A', 'A', [item('a1')])
    const d = tpl('D', 'Sortie', [ref('A'), item('d1')])
    const e = tpl('E', 'E', [ref('D')])
    expect(expandSectioned([a, d, e], 'E')).toEqual([
      { label: 'a1', section: 'Sortie' },
      { label: 'd1', section: 'Sortie' },
    ])
  })
})

describe('wouldCycle', () => {
  const A = tpl('A', 'A', [item('a1')])
  const D = tpl('D', 'D', [ref('A')])

  it('flags self', () => {
    expect(wouldCycle([A], 'A', 'A')).toBe(true)
  })
  it('flags a candidate that already depends on the host', () => {
    // Including D inside A would loop (D → A → D).
    expect(wouldCycle([A, D], 'A', 'D')).toBe(true)
  })
  it('allows an independent candidate', () => {
    const B = tpl('B', 'B', [item('b1')])
    expect(wouldCycle([A, D, B], 'A', 'B')).toBe(false)
  })
})
