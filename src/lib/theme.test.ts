import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyThemeAttr,
  getStoredTheme,
  getTheme,
  isDaypartAuto,
  setDayPart,
  setDaypartAuto,
  setTheme,
  themeForPart,
  toggleTheme,
  type DayPart,
} from './theme'

// Two promises. The ambient drift dims the wall without ever touching what the operator
// chose by hand, so switching it off gives back exactly the theme they had. And the
// browser's own chrome (the status bar of an installed PWA) follows the painted palette,
// so a phone in Night mode does not sit under a cream strip.

const html = document.documentElement
const themeColor = () => document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])')

beforeEach(() => {
  localStorage.clear()
  html.removeAttribute('data-theme')
  html.removeAttribute('data-daypart')
  html.style.removeProperty('--paper')
  document.head.querySelectorAll('meta').forEach((m) => m.remove())
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const brokenStorage = () =>
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('denied')
    },
    setItem: () => {
      throw new Error('denied')
    },
  })

const prefersDark = (dark: boolean) =>
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: dark } as MediaQueryList)

describe('the manual choice', () => {
  it('the toggle flips the wall and remembers it across a reboot', () => {
    setTheme('day')
    expect(toggleTheme()).toBe('night')
    expect(html.getAttribute('data-theme')).toBe('night')
    expect(getStoredTheme()).toBe('night')
    expect(toggleTheme()).toBe('day')
    expect(getStoredTheme()).toBe('day')
  })

  it('the drift dims the wall without writing over what the operator picked', () => {
    setTheme('day')
    applyThemeAttr('night')
    expect(html.getAttribute('data-theme')).toBe('night')
    expect(getStoredTheme()).toBe('day')
  })

  it('a dusk tier reads as day, so the toggle from dusk goes to night rather than to cream', () => {
    applyThemeAttr('deep-twilight')
    expect(getTheme()).toBe('day')
    expect(toggleTheme()).toBe('night')
  })

  it('with nothing stored the device follows the OS preference', () => {
    prefersDark(true)
    expect(getStoredTheme()).toBe('night')
    prefersDark(false)
    expect(getStoredTheme()).toBe('day')
  })

  it('a junk stored value falls back to the OS rather than painting nothing', () => {
    localStorage.setItem('babillard-theme', 'mauve')
    prefersDark(true)
    expect(getStoredTheme()).toBe('night')
  })

  it('blocked storage still flips the wall, it just will not survive a reboot', () => {
    prefersDark(false)
    brokenStorage()
    expect(() => setTheme('night')).not.toThrow()
    expect(html.getAttribute('data-theme')).toBe('night')
    expect(getStoredTheme()).toBe('day')
  })
})

describe('the browser chrome follows the painted palette', () => {
  it('a phone without the tag gets one, in the current --paper', () => {
    html.style.setProperty('--paper', '#101418')
    setTheme('night')
    expect(themeColor()?.content).toBe('#101418')
  })

  it('every tier moves it, the manual flip as much as the drift', () => {
    const tag = document.createElement('meta')
    tag.name = 'theme-color'
    tag.content = '#fff8ee'
    document.head.appendChild(tag)
    html.style.setProperty('--paper', '#332a40')
    applyThemeAttr('twilight')
    expect(tag.content).toBe('#332a40')
    html.style.setProperty('--paper', '#403a33')
    setDayPart('dusk')
    expect(tag.content).toBe('#403a33')
  })

  it('a media-scoped tag belongs to the OS flip and is left alone', () => {
    const scoped = document.createElement('meta')
    scoped.name = 'theme-color'
    scoped.setAttribute('media', '(prefers-color-scheme: dark)')
    scoped.content = '#000000'
    document.head.appendChild(scoped)
    html.style.setProperty('--paper', '#101418')
    setTheme('night')
    expect(scoped.content).toBe('#000000')
  })

  it('before the stylesheet landed there is no palette to copy, so the chrome keeps its colour', () => {
    const tag = document.createElement('meta')
    tag.name = 'theme-color'
    tag.content = '#fff8ee'
    document.head.appendChild(tag)
    setTheme('night')
    expect(tag.content).toBe('#fff8ee')
  })

  it('a browser that refuses the read is purely cosmetic: the theme still applies', () => {
    vi.stubGlobal('getComputedStyle', () => {
      throw new Error('nope')
    })
    expect(() => applyThemeAttr('night')).not.toThrow()
    expect(html.getAttribute('data-theme')).toBe('night')
  })
})

describe('the ambient drift', () => {
  it('nightfall steps through its dim tiers: the wall never cuts cream to black', () => {
    const tiers = (['dusk', 'twilight', 'deep-twilight', 'night'] as DayPart[]).map(themeForPart)
    expect(tiers).toEqual(['day', 'twilight', 'deep-twilight', 'night'])
  })

  it('the daylight parts all stay on the day palette', () => {
    for (const part of ['dawn', 'morning', 'noon', 'afternoon'] as DayPart[]) expect(themeForPart(part)).toBe('day')
  })

  it('the drift is on until the operator opts out, and a broken store leaves it on', () => {
    expect(isDaypartAuto()).toBe(true)
    setDaypartAuto(false)
    expect(isDaypartAuto()).toBe(false)
    brokenStorage()
    expect(isDaypartAuto()).toBe(true)
  })

  it('opting out pins the base palette at once', () => {
    setDayPart('dusk')
    setDaypartAuto(false)
    expect(html.getAttribute('data-daypart')).toBe('manual')
  })

  it('opting back in leaves the attribute to the caller, who recomputes the current part', () => {
    setDayPart('dusk')
    setDaypartAuto(true)
    expect(html.getAttribute('data-daypart')).toBe('dusk')
    expect(isDaypartAuto()).toBe(true)
  })

  it('blocked storage still pins the palette', () => {
    brokenStorage()
    expect(() => setDaypartAuto(false)).not.toThrow()
    expect(html.getAttribute('data-daypart')).toBe('manual')
  })
})
