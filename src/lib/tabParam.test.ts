import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { useTabParam } from './tabParam'

// The promise: a sub-tab is a place you can come back to. Opening a scene from
// La cuisine ▸ Recettes and closing it lands on Recettes, a deep link opens the tab it
// names, and the back button leaves the page instead of walking back through the tabs.

const TABS = ['plan', 'recipes', 'deals'] as const

function mount(entries: string[]) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: entries, initialIndex: entries.length - 1 }, children)
  return renderHook(
    () => ({ tab: useTabParam('tab', 'plan', TABS), loc: useLocation(), nav: useNavigate() }),
    { wrapper },
  )
}

const [value, set] = [0, 1] as const

describe('useTabParam', () => {
  it('a visit with no param lands on the default tab', () => {
    const { result } = mount(['/kitchen'])
    expect(result.current.tab[value]).toBe('plan')
  })

  it('a deep link opens the tab it names', () => {
    const { result } = mount(['/kitchen?tab=recipes'])
    expect(result.current.tab[value]).toBe('recipes')
  })

  it('a stale link to a tab that no longer exists lands on the default, never on a blank panel', () => {
    const { result } = mount(['/kitchen?tab=gone'])
    expect(result.current.tab[value]).toBe('plan')
  })

  it('picking a tab puts it in the URL, so a remount comes back to it', () => {
    const { result } = mount(['/kitchen'])
    act(() => result.current.tab[set]('deals'))
    expect(result.current.tab[value]).toBe('deals')
    expect(result.current.loc.search).toBe('?tab=deals')
  })

  it('the default tab is stored as no param: the common URL stays clean', () => {
    const { result } = mount(['/kitchen?tab=recipes'])
    act(() => result.current.tab[set]('plan'))
    expect(result.current.loc.search).toBe('')
    expect(result.current.tab[value]).toBe('plan')
  })

  it('flipping tabs does not pile into history: back leaves the page', () => {
    const { result } = mount(['/board', '/kitchen'])
    act(() => result.current.tab[set]('recipes'))
    act(() => result.current.tab[set]('deals'))
    act(() => result.current.nav(-1))
    expect(result.current.loc.pathname).toBe('/board')
  })

  it('the other params of the page survive a tab flip', () => {
    const { result } = mount(['/settings?lens=regler&sub=apparence'])
    act(() => result.current.tab[set]('recipes'))
    const params = new URLSearchParams(result.current.loc.search)
    expect(params.get('lens')).toBe('regler')
    expect(params.get('sub')).toBe('apparence')
    expect(params.get('tab')).toBe('recipes')
  })
})
