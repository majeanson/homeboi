import { describe, it, expect } from 'vitest'
import { type Todo, todosKey, todosPath, isOpen, isChecked, orderTodos, checkedIds } from './todos'
import { TODOS_KEY } from './queryKeys'

const todo = (over: Partial<Todo>): Todo => ({
  id: 'x',
  title: 't',
  day: null,
  member_id: null,
  done_at: null,
  position: 0,
  ...over,
})

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
    // The day key starts with the base key → invalidateQueries(TODOS_KEY) matches it.
    expect(todosKey(day).slice(0, TODOS_KEY.length)).toEqual(TODOS_KEY)
    expect(todosPath(day)).toBe(`todos?date=${day}`)
  })
})

describe('open / checked', () => {
  it('reads done_at as the checked flag', () => {
    expect(isOpen(todo({ done_at: null }))).toBe(true)
    expect(isChecked(todo({ done_at: null }))).toBe(false)
    expect(isOpen(todo({ done_at: 123 }))).toBe(false)
    expect(isChecked(todo({ done_at: 123 }))).toBe(true)
  })
})

describe('orderTodos', () => {
  it('floats open todos above checked ones, preserving order within each group', () => {
    const a = todo({ id: 'a', done_at: null })
    const b = todo({ id: 'b', done_at: 5 })
    const c = todo({ id: 'c', done_at: null })
    const d = todo({ id: 'd', done_at: 9 })
    expect(orderTodos([b, a, d, c]).map((t) => t.id)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('does not mutate the input', () => {
    const input = [todo({ id: 'a', done_at: 1 }), todo({ id: 'b', done_at: null })]
    const snapshot = input.map((t) => t.id)
    orderTodos(input)
    expect(input.map((t) => t.id)).toEqual(snapshot)
  })
})

describe('checkedIds', () => {
  it('returns exactly the checked ids', () => {
    const list = [todo({ id: 'a', done_at: null }), todo({ id: 'b', done_at: 7 }), todo({ id: 'c', done_at: 8 })]
    expect(checkedIds(list)).toEqual(['b', 'c'])
  })

  it('is empty when nothing is checked', () => {
    expect(checkedIds([todo({ id: 'a' }), todo({ id: 'b' })])).toEqual([])
  })
})
