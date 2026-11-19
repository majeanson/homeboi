import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sourceFiles, readScanned } from './buildGuardScan'

// THE TIME RULE (review #11, 2026-11-17; sibling of chip-rule.test.ts). A native
// <input type="time"> draws the BROWSER locale's clock, not the page's: a Québec
// household on an English-locale Chrome read « 08:00 AM / 05:00 PM » in a French app
// where every other time reads « 8 h 00 ». No attribute fixes it, so a time of day is
// `components/TimeField.tsx` (two selects, 24-hour). Comments are blanked before the
// scan, so prose about the native input does not trip it.

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const rootDir = join(srcDir, '..')

export function rawTimeInputs(src: string): number[] {
  return [...src.matchAll(/type=["'{`]*time["'}`]/g)].map((m) => src.slice(0, m.index ?? 0).split('\n').length)
}

describe('the time rule (a time of day is <TimeField>, never <input type="time">)', () => {
  it('the detector sees each spelling and none of the look-alikes', () => {
    const fixture = [
      `<input className="input" type="time" />`, // line 1
      `<input type='time' />`, // line 2
      `<input type={'time'} />`, // line 3
      `<input type="datetime-local" />`,
      `<TimeField value={v} onChange={set} label="De" />`,
      `const type = 'timer'`,
    ].join('\n')
    expect(rawTimeInputs(fixture)).toEqual([1, 2, 3])
  })

  it('no raw time input anywhere in src', () => {
    const offenders: string[] = []
    for (const f of sourceFiles(srcDir)) {
      if (!f.endsWith('.tsx')) continue
      const file = relative(rootDir, f).split(sep).join('/')
      for (const line of rawTimeInputs(readScanned(f))) offenders.push(`${file}:${line}`)
    }
    expect(offenders, 'use <TimeField> (components/TimeField.tsx): same « HH:MM » value, always 24-hour').toEqual([])
  })
})
