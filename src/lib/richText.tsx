import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { InlineIcon, type IconName } from '../components/Icon'
import { foldRanges } from './normalize'

// Inline tokens in long-form prose (the Guide + the guided tour share this):
//   [[icon:name]]     → the app's own Phosphor glyph, so a sentence that points
//                       at a button shows the *same* icon the button shows.
//   [[card:id|label]] → a calm in-text link that opens another Guide card. It
//                       deep-links to /settings?tab=guide&card=<id>; inside the
//                       Guide the ?card effect opens + scrolls to that card. This
//                       turns the manual into a browsable graph — features can
//                       cross-reference each other instead of sitting as islands.
//                       The id must match a GuideEntry id in guideContent.ts.
// `stripTokens` (used for search + length math) drops icon tokens entirely and
// keeps a card token's visible LABEL, so a search still matches the words a reader
// actually sees.
const TOKEN = /\[\[(icon|card):([^\]]+)\]\]/g

export const stripTokens = (s: string) =>
  s.replace(TOKEN, (_m, kind: string, body: string) => (kind === 'card' ? (body.split('|')[1] ?? body) : ''))

// Wrap every fold-match of `needle` in a calm <mark class="hl"> — the Guide
// search highlight. Accent/case-insensitive via foldRanges, so « Réglages »
// lights up when the user typed "reglages".
export function highlight(text: string, needle: string): ReactNode {
  const ranges = foldRanges(text, needle)
  if (ranges.length === 0) return text
  const out: ReactNode[] = []
  let last = 0
  for (const [s, e] of ranges) {
    if (s > last) out.push(<Fragment key={`t${last}`}>{text.slice(last, s)}</Fragment>)
    out.push(
      <mark key={`m${s}`} className="hl">
        {text.slice(s, e)}
      </mark>,
    )
    last = e
  }
  if (last < text.length) out.push(<Fragment key={`t${last}`}>{text.slice(last)}</Fragment>)
  return out
}

export function renderRich(text: string, hl?: string): ReactNode {
  // With a search needle, plain segments (and card-link labels) get their
  // matches marked; tokens themselves are never touched.
  const seg = (s: string): ReactNode => (hl ? highlight(s, hl) : s)
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  TOKEN.lastIndex = 0
  while ((m = TOKEN.exec(text))) {
    if (m.index > last) out.push(<Fragment key={last}>{seg(text.slice(last, m.index))}</Fragment>)
    const kind = m[1]
    const body = m[2]
    if (kind === 'icon') {
      out.push(<InlineIcon key={m.index} name={body as IconName} />)
    } else {
      const bar = body.indexOf('|')
      const id = bar === -1 ? body : body.slice(0, bar)
      const label = bar === -1 ? body : body.slice(bar + 1)
      out.push(
        // stopPropagation so a card-link placed inside a card's clickable
        // <summary> (the `what` line) navigates without also toggling the card.
        <Link
          key={m.index}
          className="guide-link"
          to={`/settings?tab=guide&card=${id}`}
          onClick={(e) => e.stopPropagation()}
        >
          {seg(label)}
        </Link>,
      )
    }
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(<Fragment key={last}>{seg(text.slice(last))}</Fragment>)
  return out
}
