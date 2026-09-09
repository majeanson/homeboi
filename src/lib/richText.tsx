import { Fragment, Suspense, lazy, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { InlineIcon, type IconName } from '../components/Icon'
import { foldRanges } from './normalize'

// `renderRich` is reachable from the BOARD (the welcome card, the tour), so everything
// it imports statically lands in the eager entry chunk. The glossary mark is the exact
// opposite of that: it only ever renders in Réglages / Comprendre. Importing it here
// directly put it — and, through it, the whole term table — in front of every boot, and
// pushed the entry chunk 371 bytes past its 420 KB budget on CI.
//
// So it is lazy, and the fallback is the plain word: a household reading the manual sees
// the term the instant the text paints, and it grows its dotted underline a tick later
// when the chunk lands. Nothing is missing in between.
const GlossaryTermMark = lazy(() =>
  import('../components/GlossaryTerm').then((m) => ({ default: m.GlossaryTermMark })),
)

// Inline tokens in long-form prose (the Guide + the guided tour share this):
//   [[icon:name]]     → the app's own Phosphor glyph, so a sentence that points
//                       at a button shows the *same* icon the button shows.
//   [[mot:id|label]]  → a glossary term: a quiet dotted word that pops its two-sentence
//                       definition where it stands (components/GlossaryTerm). The id
//                       must match a term in lib/glossary.ts. Réglages/Comprendre only
//                       — reading the manual is a one-off, so the mark costs a daily
//                       user nothing; the same underline on the board would be a tax.
//   [[card:id|label]] → a calm in-text link that opens another Guide card. It
//                       deep-links to /settings?tab=guide&card=<id>; inside the
//                       Guide the ?card effect opens + scrolls to that card. This
//                       turns the manual into a browsable graph — features can
//                       cross-reference each other instead of sitting as islands.
//                       The id must match a GuideEntry id in guideContent.ts.
// `stripTokens` (used for search + length math) drops icon tokens entirely and
// keeps a card token's visible LABEL, so a search still matches the words a reader
// actually sees.
const TOKEN = /\[\[(icon|card|mot):([^\]]+)\]\]/g

export const stripTokens = (s: string) =>
  // A card link and a glossary term both keep the words a reader SEES, so Guide search
  // still matches them; an icon token leaves nothing behind.
  s.replace(TOKEN, (_m, kind: string, body: string) =>
    kind === 'card' || kind === 'mot' ? (body.split('|')[1] ?? body) : '',
  )

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
    } else if (kind === 'mot') {
      const bar = body.indexOf('|')
      const id = bar === -1 ? body : body.slice(0, bar)
      const label = bar === -1 ? body : body.slice(bar + 1)
      out.push(
        <Suspense key={m.index} fallback={label}>
          <GlossaryTermMark id={id} label={label} />
        </Suspense>,
      )
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
