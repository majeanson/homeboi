// WYSIWYG bridge for the rich note editor. The note body is stored as Markdown
// (family_notes.text) and READ via lib/noteMarkdown (renderNoteBody). The EDITOR is a
// contentEditable that is ALWAYS formatted — the user never sees raw Markdown — so this
// module converts Markdown ⇄ editor-HTML and exposes the per-line block transforms the
// toolbar buttons run.
//
// The editor uses a deliberately FLAT model: every visual line is ONE top-level element
// (a `<div>`, `.ne-bullet`, `.ne-number`, `.ne-check`, `.ne-quote`, or `<h3>/<h4>`) — no
// nested <ul>/<ol>. That makes every button a single, pure element transform (no list
// splitting/merging), so the whole thing is unit-testable and renders the same 100% of
// the time. Lists look like lists via CSS (bullets / counters / checkboxes).

import { HEAD_RE, CHECK_RE, BULLET_RE, NUMBER_RE, QUOTE_RE } from './noteGrammar'

export type LineKind = 'heading' | 'bullet' | 'numbered' | 'check' | 'quote' | 'plain'

const CB = '<span class="ne-cb" contenteditable="false"></span>'

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ── inline: **bold** *italic* _italic_ ~~strike~~ ⇄ <strong>/<em>/<s> ───────────────
export function inlineMdToHtml(text: string): string {
  let s = escHtml(text ?? '')
  s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>') // bold before single-star italic
  s = s.replace(/~~([^~]+?)~~/g, '<s>$1</s>')
  s = s.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
  s = s.replace(/_([^_\n]+?)_/g, '<em>$1</em>')
  return s
}

export function inlineHtmlToMd(node: Node): string {
  let out = ''
  node.childNodes.forEach((c) => {
    if (c.nodeType === 3) {
      // contentEditable inserts non-breaking spaces; fold them back to plain spaces.
      out += (c.textContent ?? '').replace(/\u00a0/g, ' ')
      return
    }
    if (c.nodeType !== 1) return
    const el = c as HTMLElement
    const tag = el.tagName
    if (tag === 'BR') {
      out += '\n'
      return
    }
    if (el.classList.contains('ne-cb')) return // the checkbox widget carries no text
    const inner = inlineHtmlToMd(el)
    if (tag === 'B' || tag === 'STRONG') out += inner ? `**${inner}**` : ''
    else if (tag === 'I' || tag === 'EM') out += inner ? `*${inner}*` : ''
    else if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') out += inner ? `~~${inner}~~` : ''
    else out += inner
  })
  return out
}

// ── one Markdown line → one editor element's outer HTML ─────────────────────────────
function inner(t: string): string {
  const h = inlineMdToHtml(t)
  return h || '<br>' // an empty line still needs height + a caret target
}
export function lineToHtml(line: string): string {
  let m: RegExpExecArray | null
  if ((m = HEAD_RE.exec(line))) return m[1].length === 1 ? `<h3>${inner(m[2])}</h3>` : `<h4>${inner(m[2])}</h4>`
  if ((m = CHECK_RE.exec(line))) return `<div class="ne-check" data-checked="${m[1].toLowerCase() === 'x'}">${CB}${inner(m[2])}</div>`
  if (!CHECK_RE.test(line) && (m = BULLET_RE.exec(line))) return `<div class="ne-bullet">${inner(m[1])}</div>`
  if ((m = NUMBER_RE.exec(line))) return `<div class="ne-number">${inner(m[1])}</div>`
  if ((m = QUOTE_RE.exec(line))) return `<div class="ne-quote">${inner(m[1])}</div>`
  return `<div>${inner(line)}</div>`
}
export function mdToHtml(md: string): string {
  return (md ?? '').replace(/\r\n/g, '\n').split('\n').map(lineToHtml).join('') || '<div><br></div>'
}

// ── editor HTML → Markdown (the inverse; every top-level child = one line) ───────────
export function htmlToMd(root: HTMLElement): string {
  const out: string[] = []
  root.childNodes.forEach((node) => {
    if (node.nodeType === 3) {
      const txt = (node.textContent ?? '').trim()
      if (txt) out.push(txt)
      return
    }
    if (node.nodeType !== 1) return
    const el = node as HTMLElement
    const tag = el.tagName
    const cls = el.classList
    const text = inlineHtmlToMd(el)
    if (tag === 'H1' || tag === 'H2' || tag === 'H3') out.push('# ' + text.trim())
    else if (tag === 'H4' || tag === 'H5' || tag === 'H6') out.push('## ' + text.trim())
    else if (cls.contains('ne-check')) out.push((el.getAttribute('data-checked') === 'true' ? '- [x] ' : '- [ ] ') + text.trim())
    else if (cls.contains('ne-bullet')) out.push('- ' + text.trim())
    else if (cls.contains('ne-number')) out.push('1. ' + text.trim())
    else if (cls.contains('ne-quote') || tag === 'BLOCKQUOTE') out.push('> ' + text.trim())
    else if (tag === 'BR') out.push('')
    else if (!text.trim()) out.push('')
    else text.split('\n').forEach((l) => out.push(l))
  })
  while (out.length && out[out.length - 1] === '') out.pop()
  return out.join('\n')
}

// ── block transforms the toolbar runs (pure: element in → new element out) ──────────
export function blockKindOf(el: Element): LineKind {
  if (/^H[1-6]$/.test(el.tagName)) return 'heading'
  const c = el.classList
  if (c.contains('ne-check')) return 'check'
  if (c.contains('ne-bullet')) return 'bullet'
  if (c.contains('ne-number')) return 'numbered'
  if (c.contains('ne-quote')) return 'quote'
  return 'plain'
}
function innerHtmlNoCb(el: Element): string {
  const clone = el.cloneNode(true) as HTMLElement
  clone.querySelectorAll('.ne-cb').forEach((n) => n.remove())
  return clone.innerHTML
}
export function makeLine(kind: LineKind, innerHtml: string, checked = false): HTMLElement {
  const html = innerHtml && innerHtml !== '<br>' ? innerHtml : '<br>'
  if (kind === 'heading') {
    const h = document.createElement('h3')
    h.innerHTML = html
    return h
  }
  const d = document.createElement('div')
  if (kind === 'bullet') d.className = 'ne-bullet'
  else if (kind === 'numbered') d.className = 'ne-number'
  else if (kind === 'quote') d.className = 'ne-quote'
  else if (kind === 'check') {
    d.className = 'ne-check'
    d.setAttribute('data-checked', checked ? 'true' : 'false')
    d.innerHTML = CB + html
    return d
  }
  d.innerHTML = html
  return d
}
// Force a line to a kind (used for a multi-line selection where the caller has already
// decided the target).
export function convertLine(el: Element, kind: LineKind): HTMLElement {
  return makeLine(kind, innerHtmlNoCb(el), el.getAttribute('data-checked') === 'true')
}
// Toggle a single line to a kind (press again on the same kind → back to a plain line).
export function setLineKind(el: Element, kind: LineKind): HTMLElement {
  return convertLine(el, blockKindOf(el) === kind ? 'plain' : kind)
}
// Flip a checklist line's box. Returns whether it changed (no-op on a non-check line).
export function toggleCheckbox(el: Element): boolean {
  if (!el.classList.contains('ne-check')) return false
  el.setAttribute('data-checked', el.getAttribute('data-checked') === 'true' ? 'false' : 'true')
  return true
}
