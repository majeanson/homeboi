import { act, fireEvent, render, screen } from '@testing-library/react'
import { createElement, useEffect, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'
import { SurfaceContext } from './surface'
import { ToastProvider, useNotice, useRecents, useRecordUndo, useUndoToast } from './toast'
import { MAX_UNDO_ENTRIES } from './undoStack'
import { writeFailed } from './writeFailed'

// The promise: a mis-tap is recoverable, more than once, and a delete you did NOT take
// back really happens. Every held write commits exactly once, whichever way the app goes
// away; Annuler cancels it for good; and the bar gets out of the way by itself.

const outbox = vi.hoisted(() => ({ notifier: null as (() => void) | null }))
vi.mock('./outbox', () => ({
  setReplayRejectedNotifier: (fn: (() => void) | null) => {
    outbox.notifier = fn
  },
}))

const HOLD = 15_000

type Api = {
  schedule: ReturnType<typeof useUndoToast>
  record: ReturnType<typeof useRecordUndo>
  notice: ReturnType<typeof useNotice>
  recents: ReturnType<typeof useRecents>
}
let toast: Api

function Probe() {
  const api = { schedule: useUndoToast(), record: useRecordUndo(), notice: useNotice(), recents: useRecents() }
  useEffect(() => {
    toast = api
  })
  return createElement('input', { 'aria-label': 'champ' })
}

function mount(wrap: (child: ReactNode) => ReactNode = (c) => c) {
  return render(wrap(createElement(ToastProvider, null, createElement(Probe))))
}

const elapse = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
const undoButton = () => screen.queryByRole('button', { name: 'Annuler' })
const bar = () => document.querySelector<HTMLElement>('.undo-toast')

function held(message = 'Supprimé') {
  const onCommit = vi.fn()
  const onUndo = vi.fn()
  act(() => toast.schedule({ message, onCommit, onUndo }))
  return { onCommit, onUndo }
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('a held write', () => {
  it('commits when its window closes, and not a moment before', () => {
    mount()
    const { onCommit } = held()
    elapse(HOLD - 1)
    expect(onCommit).not.toHaveBeenCalled()
    elapse(1)
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('a caller can ask for its own window', () => {
    mount()
    const onCommit = vi.fn()
    act(() => toast.schedule({ message: 'x', onCommit, onUndo: () => {}, durationMs: 3000 }))
    elapse(3000)
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('Annuler means the write never happens, and the row comes back', () => {
    mount()
    const { onCommit, onUndo } = held()
    fireEvent.click(undoButton()!)
    elapse(HOLD * 2)
    expect(onCommit).not.toHaveBeenCalled()
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('what was taken back leaves the session log: it did not ultimately happen', () => {
    mount()
    held('Effacé')
    expect(toast.recents.history).toHaveLength(1)
    fireEvent.click(undoButton()!)
    expect(toast.recents.history).toEqual([])
  })

  it('several quick deletes all stay live at once, each with its own Annuler', () => {
    mount()
    const first = held('Premier')
    const second = held('Deuxième')
    fireEvent.click(screen.getByRole('button', { name: 'Récents (2)' }))
    expect(screen.getAllByRole('button', { name: 'Annuler' })).toHaveLength(2)
    const row = screen.getByText('Premier').closest('li')!
    fireEvent.click(row.querySelector('button')!)
    expect(first.onUndo).toHaveBeenCalledTimes(1)
    expect(second.onUndo).not.toHaveBeenCalled()
  })

  it('past the stack cap the oldest commits now, once, and is no longer on offer', () => {
    mount()
    const oldest = held('Le plus vieux')
    for (let i = 0; i < MAX_UNDO_ENTRIES; i++) held(`suivant ${i}`)
    expect(oldest.onCommit).toHaveBeenCalledTimes(1)
    expect(toast.recents.isLive(toast.recents.history[0]!.id)).toBe(false)
    elapse(HOLD)
    expect(oldest.onCommit).toHaveBeenCalledTimes(1)
  })
})

describe('the ways the app goes away', () => {
  it('a reload or tab close commits what was held: the row must not come back', () => {
    mount()
    const { onCommit } = held()
    window.dispatchEvent(new Event('pagehide'))
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('a locked phone commits too: a hidden tab may never wake to run the timer', () => {
    mount()
    const { onCommit } = held()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('coming back to the app commits nothing early', () => {
    mount()
    const { onCommit } = held()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('a flushed write does not run a second time when its timer would have fired', () => {
    mount()
    const { onCommit } = held()
    window.dispatchEvent(new Event('pagehide'))
    elapse(HOLD)
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('a provider that unmounts commits what it held, and does not delete it twice', () => {
    const { unmount } = mount()
    const { onCommit } = held()
    unmount()
    expect(onCommit).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(HOLD)
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('a compensating action has no held write to run at teardown', () => {
    mount()
    const onUndo = vi.fn()
    act(() => toast.record({ message: 'Ajouté', onUndo }))
    act(() => void window.dispatchEvent(new Event('pagehide')))
    expect(onUndo).not.toHaveBeenCalled()
    expect(undoButton()).not.toBeNull()
  })
})

describe('a compensating action', () => {
  it('Annuler runs the inverse', () => {
    mount()
    const onUndo = vi.fn()
    act(() => toast.record({ message: 'Ajouté', onUndo }))
    fireEvent.click(undoButton()!)
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('it expires like the others: it does not linger until six more actions evict it', () => {
    mount()
    act(() => toast.record({ message: 'Ajouté', onUndo: () => {} }))
    const { id } = toast.recents.history[0]!
    expect(toast.recents.isLive(id)).toBe(true)
    elapse(HOLD)
    expect(toast.recents.isLive(id)).toBe(false)
  })
})

describe('a notice', () => {
  it('has nothing to take back', () => {
    mount()
    act(() => toast.notice('Ce lien ne mène plus à rien.'))
    expect(screen.getByText('Ce lien ne mène plus à rien.')).toBeTruthy()
    expect(undoButton()).toBeNull()
    expect(toast.recents.isLive(toast.recents.history[0]!.id)).toBe(false)
  })

  it('a refused write says one calm line, never a silent snap-back', () => {
    mount()
    act(() => writeFailed(new ApiError(500, 'boom')))
    expect(screen.getByText(/réessaie/i)).toBeTruthy()
  })

  it('a 401 stays quiet: the auth-lost path owns that screen', () => {
    mount()
    act(() => writeFailed(new ApiError(401, 'no')))
    expect(bar()).toBeNull()
  })

  it('an offline replay that dropped writes says so on the same bar', () => {
    mount()
    act(() => outbox.notifier?.())
    expect(bar()?.textContent?.length).toBeGreaterThan(0)
  })

  it('a provider that left stops listening', () => {
    const { unmount } = mount()
    unmount()
    expect(outbox.notifier).toBeNull()
    expect(() => writeFailed(new ApiError(500, 'boom'))).not.toThrow()
  })
})

describe('Ctrl+Z', () => {
  const press = (init: KeyboardEventInit) => fireEvent.keyDown(window, { key: 'z', ...init })

  it('takes back the newest live action, the same one the button targets', () => {
    mount()
    const older = held('Vieux')
    const newest = held('Neuf')
    expect(press({ ctrlKey: true })).toBe(false)
    expect(newest.onUndo).toHaveBeenCalledTimes(1)
    expect(older.onUndo).not.toHaveBeenCalled()
  })

  it('⌘Z does the same on a Mac, with the caps lock on or off', () => {
    mount()
    const { onUndo } = held()
    press({ metaKey: true, key: 'Z' })
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('in a text field it un-types: stealing it to delete a to-do is the worst surprise', () => {
    mount()
    const { onUndo } = held()
    screen.getByLabelText('champ').focus()
    expect(press({ ctrlKey: true })).toBe(true)
    expect(onUndo).not.toHaveBeenCalled()
  })

  it('in a textarea too', () => {
    mount()
    const { onUndo } = held()
    const area = document.body.appendChild(document.createElement('textarea'))
    area.focus()
    press({ ctrlKey: true })
    expect(onUndo).not.toHaveBeenCalled()
    area.remove()
  })

  it('in a contentEditable note too', () => {
    mount()
    const { onUndo } = held()
    const note = document.body.appendChild(document.createElement('div'))
    note.tabIndex = 0
    Object.defineProperty(note, 'isContentEditable', { value: true })
    note.focus()
    press({ ctrlKey: true })
    expect(onUndo).not.toHaveBeenCalled()
    note.remove()
  })

  it('Shift is redo, and there is no redo here: it stays unbound', () => {
    mount()
    const { onUndo } = held()
    expect(press({ ctrlKey: true, shiftKey: true })).toBe(true)
    expect(onUndo).not.toHaveBeenCalled()
  })

  it('a plain z typed at the page does nothing', () => {
    mount()
    const { onUndo } = held()
    press({})
    expect(onUndo).not.toHaveBeenCalled()
  })

  it('with only a notice on top there is nothing to take back, and the key is left alone', () => {
    mount()
    const { onUndo } = held()
    act(() => toast.notice('Pour info'))
    expect(press({ ctrlKey: true })).toBe(true)
    expect(onUndo).not.toHaveBeenCalled()
  })

  it('with nothing live, the browser keeps its own undo', () => {
    mount()
    expect(press({ ctrlKey: true })).toBe(true)
  })
})

describe('the bar gets out of the way', () => {
  it('it clears itself 15 s after the LAST action, and the log lives on', () => {
    mount()
    held('Premier')
    elapse(10_000)
    held('Deuxième')
    elapse(HOLD - 1)
    expect(bar()).not.toBeNull()
    elapse(1)
    expect(bar()).toBeNull()
    expect(toast.recents.history.map((r) => r.message)).toEqual(['Premier', 'Deuxième'])
  })

  it('it never hides while you read the expanded log', () => {
    mount()
    held('Premier')
    held('Deuxième')
    fireEvent.click(screen.getByRole('button', { name: 'Récents (2)' }))
    elapse(HOLD * 3)
    expect(screen.getByText('Premier')).toBeTruthy()
    expect(bar()).not.toBeNull()
  })

  it('collapsing the log starts the countdown again', () => {
    mount()
    held('Premier')
    held('Deuxième')
    fireEvent.click(screen.getByRole('button', { name: 'Récents (2)' }))
    elapse(HOLD * 2)
    fireEvent.click(screen.getByRole('button', { name: 'Masquer' }))
    elapse(HOLD)
    expect(bar()).toBeNull()
  })

  it('an emptied stack leaves a quiet opener to the log until the bar times out', () => {
    mount()
    held('Premier')
    elapse(10_000)
    act(() => toast.notice('Pour info'))
    elapse(5000)
    // Premier committed at 15 s; the notice is still up, so the bar stays and says it.
    expect(screen.getByText('Pour info')).toBeTruthy()
  })

  it('✕ clears the way without touching anything it represents', () => {
    mount()
    const { onCommit, onUndo } = held()
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(bar()).toBeNull()
    expect(toast.recents.history).toHaveLength(1)
    elapse(HOLD)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onUndo).not.toHaveBeenCalled()
  })

  it('a double tap on the bar does the same, for a thumb reaching what is underneath', () => {
    mount()
    const { onCommit } = held('Supprimé')
    const msg = screen.getByText('Supprimé')
    fireEvent.pointerUp(msg)
    elapse(200)
    fireEvent.pointerUp(msg)
    expect(bar()).toBeNull()
    elapse(HOLD)
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('two slow taps are two taps', () => {
    mount()
    held('Supprimé')
    const msg = screen.getByText('Supprimé')
    fireEvent.pointerUp(msg)
    elapse(400)
    fireEvent.pointerUp(msg)
    expect(bar()).not.toBeNull()
  })

  it('a tap on a button does not count toward a double tap', () => {
    mount()
    held('Premier')
    held('Deuxième')
    const msg = screen.getByText('Deuxième')
    fireEvent.pointerUp(msg)
    fireEvent.pointerUp(undoButton()!)
    fireEvent.pointerUp(msg)
    expect(bar()).not.toBeNull()
  })

  it('it rides above the phone tab bar: the CSS needs to know the surface', () => {
    mount((child) =>
      createElement(SurfaceContext.Provider, { value: { surface: 'kiosk', setSurface: () => {}, chosen: true } }, child),
    )
    held()
    expect(bar()?.dataset.surface).toBe('kiosk')
  })
})

describe('Tout vider', () => {
  it('is not an undo: what was held commits, the log empties, the bar leaves', () => {
    mount()
    const a = held('Premier')
    const b = held('Deuxième')
    fireEvent.click(screen.getByRole('button', { name: 'Récents (2)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tout vider' }))
    expect(a.onCommit).toHaveBeenCalledTimes(1)
    expect(b.onCommit).toHaveBeenCalledTimes(1)
    expect(a.onUndo).not.toHaveBeenCalled()
    expect(toast.recents.history).toEqual([])
    expect(bar()).toBeNull()
    elapse(HOLD)
    expect(a.onCommit).toHaveBeenCalledTimes(1)
  })
})

describe('the session log', () => {
  it('outlives the write, for a glance back at what just happened', () => {
    mount()
    held('Fait')
    elapse(HOLD)
    expect(toast.recents.history.map((r) => r.message)).toEqual(['Fait'])
    expect(toast.recents.isLive(toast.recents.history[0]!.id)).toBe(false)
  })

  it('stays bounded and newest-last: a tablet glances, it does not audit', () => {
    mount()
    for (let i = 0; i < 20; i++) act(() => toast.notice(`ligne ${i}`))
    expect(toast.recents.history).toHaveLength(15)
    expect(toast.recents.history.at(-1)?.message).toBe('ligne 19')
    expect(toast.recents.history[0]?.message).toBe('ligne 5')
  })

  it('a late undo works from Réglages while the entry is still live', () => {
    mount()
    const { onCommit, onUndo } = held()
    act(() => toast.recents.undo(toast.recents.history[0]!.id))
    elapse(HOLD)
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('a late undo of something already committed does nothing', () => {
    mount()
    const { onUndo } = held()
    const { id } = toast.recents.history[0]!
    elapse(HOLD)
    act(() => toast.recents.undo(id))
    expect(onUndo).not.toHaveBeenCalled()
  })
})

describe('the one-time reassurance', () => {
  const hint = () => document.querySelector('.undo-toast__hint')

  it('the very first undoable action on this device carries it, then never again', () => {
    const first = mount()
    held()
    expect(hint()).not.toBeNull()
    first.unmount()
    mount()
    held()
    expect(hint()).toBeNull()
  })

  it('it retires with its bar', () => {
    mount()
    held()
    elapse(HOLD)
    held()
    expect(hint()).toBeNull()
  })

  it('a notice has nothing to reassure about', () => {
    mount()
    act(() => toast.notice('Pour info'))
    expect(hint()).toBeNull()
  })

  it('broken storage means no hint, never a crash', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    mount()
    expect(() => held()).not.toThrow()
    expect(hint()).toBeNull()
  })
})

describe('outside a provider', () => {
  it('every hook is an inert default: a stray call cannot throw', () => {
    render(createElement(Probe))
    expect(() => toast.notice('x')).not.toThrow()
    expect(toast.recents.history).toEqual([])
    expect(toast.recents.isLive(1)).toBe(false)
  })
})
