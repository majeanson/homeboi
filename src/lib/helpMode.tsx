import { useEffect, useState, type ReactNode } from 'react'
import { useLang, useT } from '../i18n'
import { useHelp } from './help'
import { useTour } from './tour'
import { TOURS } from './tourContent'
import { HelpBubble } from '../components/HelpBubble'
import { Chip } from '../components/Chip'
import { Cluster } from '../components/Layout'
import { Icon } from '../components/Icon'
import { guideHref } from './settingsNav'

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

// What an armed tap may reach untouched: the bubble itself, the « ? » toggle (to turn help
// off), and the hint bar's doors. Everything interactive besides is explained, not run.
const HELP_PASS = '.help-bubble, .help-toggle, .sheet__help, .help-hint, .guide-sheet'
const INTERACTIVE =
  'a, button, input, select, textarea, label, summary, [role="button"], [role="tab"], [role="link"], [role="checkbox"], [role="radio"], [role="menuitem"], [role="option"], [tabindex]:not([tabindex="-1"])'

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
  // EVERY TAP, while armed (review #20, 2026-11-17). Only controls wrapped in `pick`
  // used to explain themselves; anything else ran for real (a meal row on the board
  // opened its sheet, « Retirer du plan » and all). Now one capture-phase listener
  // takes every tap on an interactive element inside `scope` before it reaches its
  // handler, and explains: the nearest `[data-help]` key, else what `resolve` names
  // (the board: the card you tapped inside), else nothing runs and the hint bar stays.
  opts: { scope?: string; resolve?: (el: Element) => NoInfer<K> | null } = {},
): HelpMode<K> {
  const { tutorial } = useHelp()
  const { lang } = useLang()
  const [active, setActive] = useState(false)
  const [key, setKey] = useState<K | null>(null)
  // Where the explained tap landed: the bubble opens beside the finger, not at the foot
  // of the screen over another card (review #20).
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    setActive(false)
    setKey(null)
  }, [resetKey])

  const scope = opts.scope ?? '.hub__body'
  const resolve = opts.resolve
  useEffect(() => {
    if (!active) return
    const onTap = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null
      if (!target || !target.closest(scope) || target.closest(HELP_PASS)) return
      const control = target.closest(INTERACTIVE)
      const tagged = target.closest('[data-help]')?.getAttribute('data-help')
      if (!control && !tagged) return
      const k = ((tagged && tagged in content ? tagged : null) ?? resolve?.(target) ?? null) as K | null
      // Nothing to say about it here: let the tap reach its handler, where a `pick`
      // still explains (a menu item, a face chip) — never a dead, silent tap.
      if (!k) return
      e.preventDefault()
      e.stopPropagation()
      // A keyboard « click » has no pointer: place it at the control instead.
      const r = (control ?? target).getBoundingClientRect()
      setAt(e.detail > 0 ? { x: e.clientX, y: e.clientY } : { x: r.left + r.width / 2, y: r.bottom })
      setKey(k)
    }
    document.addEventListener('click', onTap, true)
    return () => document.removeEventListener('click', onTap, true)
  }, [active, scope, resolve, content])

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
      // Reached only by a tap the listener left alone (no tag, nothing resolved) or a
      // non-tap trigger: no point to stand beside, so the bubble keeps its place.
      setAt(null)
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
        // The « ? » door: every registry gets one for free, carrying the key it was
        // asking about (HelpBubble's header says why it lives there).
        reportKey={String(k)}
        at={at}
        onClose={() => {
          setKey(null)
          setAt(null)
        }}
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
    key, // which entry is open, for a surface that places its bubbles itself
    bubble, // render once after the header: the in-place box for whatever was tapped
    // Render the in-place box NEXT TO a specific control (so a heading deep in the
    // page explains right there, not scrolled off at the top). Only the tapped key
    // renders; everything else is null. Use this OR `bubble`, never both.
    bubbleFor,
    // The « tap a button » bar stays the whole time help is armed, a bubble open or not
    // (review #20: it vanished after the first tap, and help read as switched off).
    hint: active,
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
  key: string | null
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
  help?: HelpMode<K> | undefined
  k: K
  as?: 'h2' | 'h3'
  className?: string
  children: ReactNode
}) {
  const t = useT()
  if (!help || !help.active) return <Tag className={className}>{children}</Tag>
  return (
    <Tag className={className}>
      <button type="button" className="help-title" data-help={k} onClick={help.pick(k, () => {})} title={t.help.learnMore}>
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

// THE « ? » BAR — what arming help mode offers, identically on every hub tab.
//
// It used to be one sentence ("tap a button to learn what it does"), which made the
// « ? » mean *hints only*, and left each section's guided tour reachable from exactly
// two places a person has to already know about: Réglages ▸ Découvrir, and the intro
// card that disappears once dismissed. So the tour read as a board-only feature —
// the report that opened this work (2026-09-09) was « the guided tour only ever
// approaches the Auj. section ».
//
// Now one component carries all three doors a section's help has, and every tab gets
// them by rendering the same thing:
//   · tap anything → it explains itself in place (the hint line, unchanged),
//   · « Faire le tour » → THIS section's tour, if one exists,
//   · « Tout savoir » → this section's full Guide card.
//
// `card` is the section's GUIDE id — the same value the tab hands HubHead. The tour
// id matches it by the app's own convention (SectionIntro has looked tours up that
// way since #32), so a section gains a tour door the moment a Tour with its id
// exists, with nothing to wire per tab. `src/lib/tour-rule.test.ts` holds both ends:
// every hub card has a tour, and every step's anchor exists.
export function HelpHint({ card }: { card?: string | undefined }) {
  const t = useT()
  const { start } = useTour()
  // A tour whose id IS the section's card id (the SectionIntro convention).
  const hasTour = !!card && TOURS.some((tr) => tr.id === card)
  return (
    <div className="help-hint">
      <p className="help-hint__line mono">{t.help.tapForHelp}</p>
      {card && (
        <Cluster className="help-hint__doors">
          {hasTour && (
            <Chip onClick={() => start(card)}>
              <Icon name="play-bold" size={13} /> {t.help.takeTour}
            </Chip>
          )}
          <Chip to={guideHref(card)}>
            <Icon name="book-open-bold" size={13} /> {t.help.guideShort}
          </Chip>
        </Cluster>
      )}
    </div>
  )
}
