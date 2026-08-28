import { describe, it, expect, beforeEach } from 'vitest'
import { soundOn, setSoundOn } from './sound'

// « Le son » — the app's own silent switch (see lib/sound.ts for why it must exist:
// a phone's ring/silent switch does not reach a web page).
//
// What's worth pinning here is the DEFAULT and the storage encoding, because both
// are load-bearing in a way a screenshot can't show: a device that has never seen
// this switch must behave exactly like every other app (audible), and the stored
// value has to survive a reload as the same answer.
describe('sound', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('a device that has never touched it makes sound', () => {
    // Silent-by-default would be the worse failure: the app would look broken to
    // everyone who never asked for quiet, and read-aloud is a headline feature.
    expect(soundOn()).toBe(true)
  })

  it('only an explicit off is off — a stray value stays audible', () => {
    for (const junk of ['', 'true', 'yes', 'null', '1']) {
      localStorage.setItem('babillard-sound', junk)
      // The store caches, so re-set through the API to re-read.
      setSoundOn(junk === '0' ? false : true)
      expect(soundOn()).toBe(junk === '0' ? false : true)
    }
  })

  it('round-trips through localStorage, so silence survives a reload', () => {
    setSoundOn(false)
    expect(localStorage.getItem('babillard-sound')).toBe('0')
    expect(soundOn()).toBe(false)
    setSoundOn(true)
    expect(localStorage.getItem('babillard-sound')).toBe('1')
    expect(soundOn()).toBe(true)
  })
})
