import type { ReactNode } from 'react'
import { HelpTitle, type HelpMode } from '../../lib/helpMode'
import { FOCUSABLE_HELP_KEYS } from '../../lib/settingsNav'

// Every Réglages panel is the same shell: a `.surface` card with a heading, an
// optional lead paragraph, and the body. The ~28 operator/* sections hand-rolled
// it; this is the one wrapper.
//
// Two heading flavours, same shell:
//   · plain — pass `title`, rendered in an `<h2>`.
//   · help-mode — pass `title` + `help` + `helpKey`, and the heading becomes a
//     tappable `<HelpTitle>` with its `help.bubbleFor(helpKey)` rendered right
//     below (the repeated "HelpTitle then bubbleFor between heading and body"
//     pattern, folded in so call sites stop re-spelling it).
//
// `action` rides at the top-right of the heading (a "＋ Ajouter" that opens an
// add-scene, a day/night toggle…). `className` adds a modifier to the section
// (e.g. `guide`, `operator__claim`). `hint` is the lead paragraph.
export function OperatorSection({
  title,
  hint,
  action,
  help,
  helpKey,
  className,
  children,
}: {
  title: ReactNode
  hint?: ReactNode
  action?: ReactNode
  /** With `helpKey`: render the heading as a help-mode `HelpTitle` + its bubble. */
  help?: HelpMode
  helpKey?: string
  /** Extra modifier class(es) appended to `surface operator__section`. */
  className?: string
  children: ReactNode
}) {
  const heading =
    help && helpKey ? (
      <HelpTitle help={help} k={helpKey}>
        {title}
      </HelpTitle>
    ) : (
      <h2>{title}</h2>
    )
  // ?focus= anchor: a guide « Régler » link can land on THIS card inside a
  // stacked sub. The helpKey doubles as the anchor id — but only for keys the
  // taxonomy lists as focusable (SETTINGS_FOCUS), so the five sections sharing
  // helpKey "guest" never mint duplicate DOM ids.
  const anchor = helpKey && FOCUSABLE_HELP_KEYS.has(helpKey) ? `op-${helpKey}` : undefined
  return (
    <section id={anchor} className={'surface operator__section' + (className ? ` ${className}` : '')}>
      {action ? (
        <div className="operator__section-head">
          {heading}
          {action}
        </div>
      ) : (
        heading
      )}
      {help && helpKey && help.bubbleFor(helpKey)}
      {hint != null && <p className="lead">{hint}</p>}
      {children}
    </section>
  )
}
