import { Fragment, type ReactNode } from 'react'
import { InlineIcon, type IconName } from '../components/Icon'

// An inline `[[icon:name]]` token in long-form prose renders as the app's own
// Phosphor glyph, so a sentence that points at a button shows the *same* icon the
// button shows (e.g. "tap [[icon:baby-bold]]"). Keeps the manual AND the guided
// tour on one icon set with the live UI instead of emoji. Shared by the Guide
// (components/operator/guide.tsx) and the tour (components/tour/TourOverlay.tsx).
// `stripTokens` removes them for search/length math.
const TOKEN = /\[\[icon:([a-z-]+)\]\]/g

export const stripTokens = (s: string) => s.replace(TOKEN, '')

export function renderRich(text: string): ReactNode {
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  TOKEN.lastIndex = 0
  while ((m = TOKEN.exec(text))) {
    if (m.index > last) out.push(<Fragment key={last}>{text.slice(last, m.index)}</Fragment>)
    out.push(<InlineIcon key={m.index} name={m[1] as IconName} />)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(<Fragment key={last}>{text.slice(last)}</Fragment>)
  return out
}
