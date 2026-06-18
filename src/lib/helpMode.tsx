import { useEffect, useState } from 'react'
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

export function useHelpMode(
  content: Record<string, HelpEntry>,
  label: (key: string) => string,
  // Optional: when this value changes, help mode resets (e.g. pass a sheet's `open`
  // so reopening starts fresh, or a scene's route id). Omit for always-mounted surfaces.
  resetKey?: unknown,
) {
  const { tutorial } = useHelp()
  const { lang } = useLang()
  const [active, setActive] = useState(false)
  const [key, setKey] = useState<string | null>(null)

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
  const pick = (k: string, run: () => void) => () => {
    if (active) {
      setKey(k)
      return
    }
    run()
  }

  const entry = key ? content[key] : null
  const bubble = entry ? (
    <HelpBubble
      title={label(key as string)}
      body={entry.body[lang]}
      card={entry.card}
      point={entry.point}
      onClose={() => setKey(null)}
    />
  ) : null

  return {
    available: tutorial, // whether to show the toggle at all
    active,
    toggle,
    reset,
    pick,
    bubble, // render after the header: the in-place help box for the tapped control
    hint: active && !key, // render a "tap a button" hint while armed and nothing picked yet
  }
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
