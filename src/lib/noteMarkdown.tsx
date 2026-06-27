import { Fragment, type ReactNode } from 'react'
import { Icon } from '../components/Icon'

// Lightweight Markdown for « Le cercle » → Notes (the iOS-Notes-style rich body).
// The body is stored as plain Markdown in family_notes.text, so there is no schema
// change for formatting and search/preview keep working on the raw string. We render a
// deliberately small, calm subset — no raw HTML, no links/images-by-syntax, no tables:
//
//   inline : **bold**  ·  *italic* / _italic_  ·  ~~strike~~
//   block  : # / ## headings  ·  - / * bullets  ·  1. numbered  ·  - [ ] / - [x] checklist
//            ·  > quote  ·  plain lines → paragraphs (single \n becomes <br>)
//
// `renderNoteBody` turns it into JSX (never dangerouslySetInnerHTML); `plainText` strips
// the markers for the row preview, search and the derived row title; `applyFormat` powers
// the editor toolbar (wrap / line-prefix a selection); `toggleCheckAt` flips one checklist
// box for the tappable read view. Kept framework-pure + unit-tested (noteMarkdown.test.ts).

// ── inline ──────────────────────────────────────────────────────────────────────
// Recursive: find the earliest marker, render its inner recursively, then the rest.
function parseInline(text: string, keyBase: string): ReactNode[] {
  if (!text) return []
  let best: { index: number; len: number; inner: string; tag: 'strong' | 'em' | 'del' } | null = null
  const consider = (re: RegExp, tag: 'strong' | 'em' | 'del') => {
    const m = re.exec(text)
    if (m && (best === null || m.index < best.index)) best = { index: m.index, len: m[0].length, inner: m[1], tag }
  }
  consider(/\*\*([^*]+?)\*\*/, 'strong') // bold before single-star italic
  consider(/~~([^~]+?)~~/, 'del')
  consider(/\*([^*\n]+?)\*/, 'em')
  consider(/_([^_\n]+?)_/, 'em')
  if (best === null) return [text]
  const b: { index: number; len: number; inner: string; tag: 'strong' | 'em' | 'del' } = best
  const out: ReactNode[] = []
  if (b.index > 0) out.push(text.slice(0, b.index))
  const inner = parseInline(b.inner, keyBase + 'i')
  const k = keyBase + b.index
  out.push(
    b.tag === 'strong' ? (
      <strong key={k}>{inner}</strong>
    ) : b.tag === 'em' ? (
      <em key={k}>{inner}</em>
    ) : (
      <del key={k}>{inner}</del>
    ),
  )
  out.push(...parseInline(text.slice(b.index + b.len), keyBase + 'r'))
  return out
}

const CHECK_RE = /^[-*]\s+\[([ xX])\]\s+(.*)$/
const BULLET_RE = /^[-*]\s+(.*)$/
const NUMBER_RE = /^\d+\.\s+(.*)$/
const HEAD_RE = /^(#{1,6})\s+(.*)$/
const QUOTE_RE = /^>\s?(.*)$/

export function renderNoteBody(md: string, opts: { onToggleCheck?: (lineIndex: number) => void } = {}): ReactNode {
  const lines = (md ?? '').replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let para: ReactNode[] = []
  let key = 0
  const flush = () => {
    if (para.length) {
      blocks.push(
        <p key={'p' + key++} className="note-md__p">
          {para}
        </p>,
      )
      para = []
    }
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    let m: RegExpExecArray | null
    if (!line.trim()) {
      flush()
      i++
      continue
    }
    if ((m = HEAD_RE.exec(line))) {
      flush()
      const inner = parseInline(m[2], 'h' + i)
      blocks.push(
        m[1].length === 1 ? (
          <h3 key={'h' + key++} className="note-md__h note-md__h1">
            {inner}
          </h3>
        ) : (
          <h4 key={'h' + key++} className="note-md__h note-md__h2">
            {inner}
          </h4>
        ),
      )
      i++
      continue
    }
    if (CHECK_RE.test(line)) {
      flush()
      const items: ReactNode[] = []
      while (i < lines.length && (m = CHECK_RE.exec(lines[i]))) {
        const checked = m[1].toLowerCase() === 'x'
        const idx = i
        items.push(
          <li key={'c' + idx} className="note-md__check">
            <button
              type="button"
              className={'note-md__box' + (checked ? ' is-on' : '')}
              onClick={opts.onToggleCheck ? () => opts.onToggleCheck!(idx) : undefined}
              disabled={!opts.onToggleCheck}
              aria-pressed={checked}
            >
              {checked ? <Icon name="check-bold" size={14} /> : null}
            </button>
            <span className={'note-md__checktext' + (checked ? ' is-done' : '')}>{parseInline(m[2], 'c' + idx)}</span>
          </li>,
        )
        i++
      }
      blocks.push(
        <ul key={'cl' + key++} className="note-md__checklist">
          {items}
        </ul>,
      )
      continue
    }
    if (BULLET_RE.test(line) && !CHECK_RE.test(line)) {
      flush()
      const items: ReactNode[] = []
      while (i < lines.length && !CHECK_RE.test(lines[i]) && (m = BULLET_RE.exec(lines[i]))) {
        items.push(
          <li key={'b' + i} className="note-md__li">
            {parseInline(m[1], 'b' + i)}
          </li>,
        )
        i++
      }
      blocks.push(
        <ul key={'ul' + key++} className="note-md__ul">
          {items}
        </ul>,
      )
      continue
    }
    if (NUMBER_RE.test(line)) {
      flush()
      const items: ReactNode[] = []
      while (i < lines.length && (m = NUMBER_RE.exec(lines[i]))) {
        items.push(
          <li key={'n' + i} className="note-md__li">
            {parseInline(m[1], 'n' + i)}
          </li>,
        )
        i++
      }
      blocks.push(
        <ol key={'ol' + key++} className="note-md__ol">
          {items}
        </ol>,
      )
      continue
    }
    if (QUOTE_RE.test(line)) {
      flush()
      const q: ReactNode[] = []
      while (i < lines.length && (m = QUOTE_RE.exec(lines[i]))) {
        if (q.length) q.push(<br key={'qb' + i} />)
        q.push(<Fragment key={'q' + i}>{parseInline(m[1], 'q' + i)}</Fragment>)
        i++
      }
      blocks.push(
        <blockquote key={'bq' + key++} className="note-md__quote">
          {q}
        </blockquote>,
      )
      continue
    }
    // plain line → fold into the current paragraph, preserving the single line break
    if (para.length) para.push(<br key={'br' + i} />)
    para.push(<Fragment key={'t' + i}>{parseInline(line, 't' + i)}</Fragment>)
    i++
  }
  flush()
  return <>{blocks}</>
}

// Strip the Markdown markers — for the row preview, search and the derived row title.
export function plainText(md: string): string {
  return (md ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) =>
      l
        .replace(/^#{1,6}\s+/, '')
        .replace(/^>\s?/, '')
        .replace(/^[-*]\s+\[[ xX]\]\s+/, '')
        .replace(/^[-*]\s+/, '')
        .replace(/^\d+\.\s+/, ''),
    )
    .join('\n')
    .replace(/\*\*([^*]+?)\*\*/g, '$1')
    .replace(/~~([^~]+?)~~/g, '$1')
    .replace(/\*([^*\n]+?)\*/g, '$1')
    .replace(/_([^_\n]+?)_/g, '$1')
    .trim()
}

// The first non-empty, marker-stripped line — the heading shown on a note row when it
// has no explicit title.
export function firstLine(md: string): string {
  return plainText(md).split('\n').find((l) => l.trim()) ?? ''
}

// Flip one checklist line's box (for the tappable read view). No-op if that line isn't
// a checklist item.
export function toggleCheckAt(md: string, lineIndex: number): string {
  const lines = (md ?? '').replace(/\r\n/g, '\n').split('\n')
  const l = lines[lineIndex]
  if (l === undefined) return md
  const m = /^([-*]\s+\[)([ xX])(\]\s+.*)$/.exec(l)
  if (!m) return md
  lines[lineIndex] = m[1] + (m[2].toLowerCase() === 'x' ? ' ' : 'x') + m[3]
  return lines.join('\n')
}
