import { describe, expect, it } from 'vitest'
import { emitAuthLost, onAuthLost } from './authEvents'

describe('authEvents', () => {
  it('notifies every subscriber on emit', () => {
    let a = 0
    let b = 0
    const offA = onAuthLost(() => a++)
    const offB = onAuthLost(() => b++)
    emitAuthLost()
    expect(a).toBe(1)
    expect(b).toBe(1)
    offA()
    offB()
  })

  it('unsubscribe stops further notifications', () => {
    let n = 0
    const off = onAuthLost(() => n++)
    emitAuthLost()
    off()
    emitAuthLost()
    expect(n).toBe(1)
  })

  it('emit with no subscribers is a no-op', () => {
    expect(() => emitAuthLost()).not.toThrow()
  })
})
