import { describe, it, expect, beforeEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ReviewChecklist } from './ReviewChecklist'

// The review checklist's picks belong to the person until the review closes. They used to
// reset on the `items` ARRAY IDENTITY — and every parent builds `items` inline, so any
// re-render above (a refetch, a poll, a state tick) minted a new array and quietly
// re-ticked what someone had just unticked. CI caught it twice on 2026-09-25
// (family-import.spec: Théo unticked, then « Ajouter la sélection (3) »); a person
// unticking a relative while the cercle query refreshed would have lost the untick the
// same way. Rendered for real under happy-dom: the effect is the defect, and only a
// render can exercise an effect.

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const props = (items: string[], open = true) => ({
  open,
  onClose: () => {},
  title: 'Réviser',
  items,
  renderItem: (s: unknown) => String(s),
  onApply: () => {},
  applyAllLabel: (n: number) => `Ajouter (${n})`,
  applySelectedLabel: (n: number) => `Ajouter la sélection (${n})`,
})
const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>('.review__row input[type="checkbox"]'))
const selectedLabel = () => document.querySelector('.review__actions .btn--primary')?.textContent ?? ''

let root: Root
let host: HTMLDivElement
beforeEach(() => {
  document.body.innerHTML = ''
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

describe('ReviewChecklist — the picks survive the parent', () => {
  it('a re-render with the SAME batch (a new array, same people) keeps what was unticked', () => {
    act(() => root.render(createElement(ReviewChecklist, props(['Camille', 'Théo', 'Grisou']))))
    expect(boxes()).toHaveLength(3)
    act(() => boxes()[1].click())
    expect(boxes()[1].checked).toBe(false)
    expect(selectedLabel()).toBe('Ajouter la sélection (2)')
    // The parent re-renders and builds its array again — a refetch landed, a poll ticked.
    // Red against `useEffect(…, [items])`: Théo comes back ticked and the button reads (3).
    act(() => root.render(createElement(ReviewChecklist, props(['Camille', 'Théo', 'Grisou']))))
    expect(boxes()[1].checked).toBe(false)
    expect(selectedLabel()).toBe('Ajouter la sélection (2)')
  })

  it('a NEW batch starts fully ticked again', () => {
    act(() => root.render(createElement(ReviewChecklist, props(['Camille', 'Théo', 'Grisou']))))
    act(() => boxes()[1].click())
    act(() => root.render(createElement(ReviewChecklist, props(['Sophie', 'Théo']))))
    expect(boxes().map((b) => b.checked)).toEqual([true, true])
    expect(selectedLabel()).toBe('Ajouter la sélection (2)')
  })

  it('closing and reopening the review forgets the previous picks', () => {
    act(() => root.render(createElement(ReviewChecklist, props(['Camille', 'Théo', 'Grisou']))))
    act(() => boxes()[1].click())
    act(() => root.render(createElement(ReviewChecklist, props(['Camille', 'Théo', 'Grisou'], false))))
    act(() => root.render(createElement(ReviewChecklist, props(['Camille', 'Théo', 'Grisou'], true))))
    expect(boxes().map((b) => b.checked)).toEqual([true, true, true])
  })
})
