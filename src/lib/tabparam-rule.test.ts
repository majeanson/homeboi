import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceFiles, blankComments, openTags } from './buildGuardScan'

// A VIEW OF A PAGE LIVES IN THE URL (solidify 4.1, 2026-11-05; the rule is older:
// « sub-tabs persist via useTabParam »). A tab held in useState resets on refresh, cannot
// be linked, and is lost when the phone reloads a backgrounded page. This reads every
// <SubTabs> / <Segmented>: a `value={x}` where x is a useState binding in the same file
// fails, unless ALLOWED says why that view has no URL of its own (a mode inside a dialog
// or sheet that has no route). Planted red with FlyerViewer's useState restored.

const SRC = join(__dirname, '..')

// `file: binding` → why it has no URL.
const ALLOWED = new Map<string, string>([
  ['components/AskDialog.tsx: mode', 'a mode inside a dialog with no route'],
  ['components/DrawPad.tsx: mode', 'the active drawing tool on a canvas overlay: state of the stroke, not a view of a page'],
  ['components/CookMode.tsx: view', 'a device preference persisted across recipes (loadCookView), not a place in this recipe'],
  ['components/operator/display.tsx: contrast', 'a device preference, applied and persisted at once'],
  ['components/operator/display.tsx: textScale', 'a device preference, applied and persisted at once'],
  ['pages/DevKit.tsx: miniTab', 'gallery specimen state'],
  ['pages/DevKit.tsx: subtab', 'gallery specimen state'],
  ['pages/DevKit.tsx: value', 'gallery specimen state'],
  ['pages/DevKit.tsx: v', 'gallery specimen state'],
])

const files = sourceFiles(SRC)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ path: relative(SRC, f).split(sep).join('/'), raw: blankComments(readFileSync(f, 'utf8')) }))

export function stateBoundViews(raw: string): string[] {
  // `<SubTabs<Tab> value=…`: the generic's `>` would end the open tag, and hid a real site.
  const src = raw.replace(/<(SubTabs|Segmented)<[^>]*>/g, '<$1 ')
  const out: string[] = []
  for (const name of ['SubTabs', 'Segmented']) {
    for (const tag of openTags(src, name)) {
      const v = /\bvalue=\{([A-Za-z_$][\w$]*)\}/.exec(tag)?.[1]
      if (v && new RegExp(String.raw`const \[${v}, set\w+\] = useState\b`).test(src)) out.push(v)
    }
  }
  return out
}

describe('tab-param rule — a view of a page lives in the URL', () => {
  it('the detector sees a useState-bound tab and not a URL-bound one (canary)', () => {
    expect(stateBoundViews(`const [tab, setTab] = useState('a')\n<SubTabs value={tab} />`)).toEqual(['tab'])
    expect(stateBoundViews(`const [tab, setTab] = useTabParam('t', 'a', K)\n<SubTabs value={tab} />`)).toEqual([])
  })

  it('no SubTabs / Segmented is bound to useState without a reason', () => {
    const offenders = [...new Set(files.flatMap((f) => stateBoundViews(f.raw).map((v) => `${f.path}: ${v}`)))].filter((k) => !ALLOWED.has(k))
    expect(offenders, 'useTabParam(key, fallback, valid); a mode inside a dialog with no route goes in ALLOWED with that reason').toEqual([])
  })

  it('every ALLOWED file still binds one (a stale entry exempts the next arrival)', () => {
    const live = new Set(files.flatMap((f) => stateBoundViews(f.raw).map((v) => `${f.path}: ${v}`)))
    expect([...ALLOWED.keys()].filter((k) => !live.has(k))).toEqual([])
  })
})
