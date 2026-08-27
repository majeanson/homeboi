import { useEffect, useState, type ReactNode } from 'react'
import { useLang, useT } from '../i18n'
import { useHelp } from './help'
import { HelpBubble } from '../components/HelpBubble'

// Reusable "?" contextual help mode (first shipped in AddSheet, now app-wide). A
// surface calls useHelpMode(content, label): tapping its HelpToggle arms help mode,
// then wrapping a control with `pick(key, run)` makes a tap EXPLAIN it in place (a
// HelpBubble with a "→ Voir le guide" deep-link) instead of running it. Gated on
// tutorial mode (experts hide every "?"). Content is a per-surface map keyed by a
// control id → { body:{fr,en}, card } (a GUIDE entry id). See lib/addHelp for the
// ＋ sheet's map; each surface owns its own small map beside its code.
export interface HelpEntry {
  body: { fr: string; en: string }
  card: string
  // Optional 0-based index of the sub-point within that GUIDE card to open + highlight.
  point?: number
}

export function useHelpMode<K extends string>(
  content: Record<K, HelpEntry>,
  // `NoInfer` is load-bearing, not decoration. Surfaces write their labeller as
  // `(k: string) => …`, which was a SECOND inference site for `K` — TS took the wider
  // candidate, `K` collapsed to `string`, and the guard advertised below silently
  // accepted ANY key. That is exactly how `pick('mode', …)` shipped on La liste
  // against a registry with no `mode` entry: a "?" target whose bubble renders
  // nothing. Pinning `K` to the registry's keys makes that a tsc error again.
  label: (key: NoInfer<K>) => string,
  // Optional: when this value changes, help mode resets (e.g. pass a sheet's `open`
  // so reopening starts fresh, or a scene's route id). Omit for always-mounted surfaces.
  resetKey?: unknown,
): HelpMode<K> {
  const { tutorial } = useHelp()
  const { lang } = useLang()
  const [active, setActive] = useState(false)
  const [key, setKey] = useState<K | null>(null)

  useEffect(() => {
    setActive(false)
    setKey(null)
  }, [resetKey])

  const toggle = () => {
    setActive((v) => !v)
    setKey(null)
  }
  const reset = () => {
    setActive(false)
    setKey(null)
  }
  // Wrap a control's handler: in help mode, explain instead of run. Returns the
  // onClick to use directly — `onClick={pick('save', doSave)}`.
  const pick = (k: K, run: () => void) => () => {
    if (active) {
      setKey(k)
      return
    }
    run()
  }

  const entry = key ? content[key] : null
  const bubbleFor = (k: K): ReactNode =>
    key === k && entry ? (
      <HelpBubble
        title={label(k)}
        body={entry.body[lang]}
        card={entry.card}
        point={entry.point}
        onClose={() => setKey(null)}
      />
    ) : null
  const bubble = key ? bubbleFor(key) : null

  return {
    // Show the toggle only in tutorial mode AND only when there's actually
    // something to explain — a surface that renders no helpable control passes an
    // empty map and gets no "?" at all (the standing rule: no targets → no help).
    available: tutorial && Object.keys(content).length > 0,
    active,
    toggle,
    reset,
    pick,
    bubble, // render once after the header: the in-place box for whatever was tapped
    // Render the in-place box NEXT TO a specific control (so a heading deep in the
    // page explains right there, not scrolled off at the top). Only the tapped key
    // renders; everything else is null. Use this OR `bubble`, never both.
    bubbleFor,
    hint: active && !key, // render a "tap a button" hint while armed and nothing picked yet
  }
}

// The shape useHelpMode returns — so a page can thread its help mode down into the
// child components that own the headings it wants to make explainable.
//
// Generic over the surface's registry keys `K` (P2-9): `useHelpMode(BOARD_HELP, …)`
// infers `K = keyof BOARD_HELP` (the registries use `satisfies`, so that's the literal
// union), which makes `pick`/`bubbleFor`/`HelpTitle k=` reject an UNREGISTERED key at
// `tsc` — the orphan "? target with no entry renders nothing" bug can no longer ship
// from a surface file. `pick`/`bubbleFor` are declared as METHODS (not arrow props) on
// purpose: method params are bivariant, so a narrow `HelpMode<'a'|'b'>` stays assignable
// to a child's loose `help?: HelpMode` (= `HelpMode<string>`) prop — threading is
// unaffected. `K` defaults to `string`, so threaded children keep working unchanged.
export interface HelpMode<K extends string = string> {
  available: boolean
  active: boolean
  toggle: () => void
  reset: () => void
  pick(k: K, run: () => void): () => void
  bubble: ReactNode
  bubbleFor(k: K): ReactNode
  hint: boolean
}

// A section heading that becomes tappable ONLY while help mode is armed: a tap then
// EXPLAINS the whole concept in place (a HelpBubble) instead of doing nothing, the
// way a control tile does. Outside help mode (or when no `help` is passed) it's an
// ordinary heading — identical DOM — so it never adds dead buttons or tab stops.
// Render the matching `help.bubbleFor(k)` just below the heading's container.
export function HelpTitle<K extends string>({
  help,
  k,
  as: Tag = 'h2',
  className,
  children,
}: {
  help?: HelpMode<K>
  k: K
  as?: 'h2' | 'h3'
  className?: string
  children: ReactNode
}) {
  const t = useT()
  if (!help || !help.active) return <Tag className={className}>{children}</Tag>
  return (
    <Tag className={className}>
      <button type="button" className="help-title" onClick={help.pick(k, () => {})} title={t.help.learnMore}>
        {children}
      </button>
    </Tag>
  )
}

// The "?" toggle button. Place it in a sheet/scene header. `className` lets a
// surface match its chrome (the ＋ sheet uses `sheet__help`); default is the
// generic round `help-toggle`.
export function HelpToggle({
  active,
  onToggle,
  className = 'help-toggle',
}: {
  active: boolean
  onToggle: () => void
  className?: string
}) {
  const t = useT()
  return (
    <button
      type="button"
      className={className + (active ? ' is-on' : '')}
      onClick={onToggle}
      aria-pressed={active}
      aria-label={t.help.helpMode}
      title={t.help.helpMode}
    >
      ?
    </button>
  )
}

// A shared "tap a button to learn what it does" hint line, shown while help mode is
// armed and nothing's been tapped yet.
export function HelpHint() {
  const t = useT()
  return <p className="help-hint mono">{t.help.tapForHelp}</p>
}
