// Markdown ⇄ TipTap bridge for the BETA note editor (NoteEditorTiptap). Storage
// stays the SAME lightweight Markdown the classic editor + read renderer speak
// (lib/noteGrammar / lib/noteHtml / lib/noteMarkdown), so a note edited in either
// editor round-trips through the other — the beta is an entry surface, never a
// second storage format.
//
//   • mdToTiptapHtml — Markdown → the HTML TipTap parses on seed. Unlike the
//     classic editor's FLAT one-element-per-line model, TipTap wants real nested
//     lists: consecutive same-kind lines group into ONE <ul>/<ol>/taskList.
//   • tiptapDocToMd — the editor's JSON document (editor.getJSON()) → Markdown.
//     Walking the JSON (not the HTML) keeps this DOM-free and unit-testable.
//     Tolerant by design: an unknown mark keeps its text, an unknown block
//     serializes as its plain lines — content is never dropped on save.
import { HEAD_RE, CHECK_RE, BULLET_RE, NUMBER_RE, QUOTE_RE } from './noteGrammar'
import { inlineMdToHtml } from './noteHtml'

// ── Markdown → TipTap HTML ───────────────────────────────────────────────────────

type LineGroup =
  | { kind: 'task'; items: { checked: boolean; html: string }[] }
  | { kind: 'bullet' | 'numbered'; items: string[] }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'heading'; level: number; html: string }
  | { kind: 'plain'; html: string }

function groupLines(md: string): LineGroup[] {
  const out: LineGroup[] = []
  const last = () => out[out.length - 1]
  for (const line of (md ?? '').replace(/\r\n/g, '\n').split('\n')) {
    let m: RegExpExecArray | null
    if ((m = HEAD_RE.exec(line))) {
      // The stored grammar only distinguishes '# ' vs '## ' (htmlToMd folds deeper
      // levels) — map to h1/h2 and let the serializer fold back the same way.
      out.push({ kind: 'heading', level: Math.min(m[1].length, 2), html: inlineMdToHtml(m[2]) })
    } else if ((m = CHECK_RE.exec(line))) {
      const item = { checked: m[1].toLowerCase() === 'x', html: inlineMdToHtml(m[2]) }
      const g = last()
      if (g?.kind === 'task') g.items.push(item)
      else out.push({ kind: 'task', items: [item] })
    } else if ((m = BULLET_RE.exec(line))) {
      const g = last()
      if (g?.kind === 'bullet') g.items.push(inlineMdToHtml(m[1]))
      else out.push({ kind: 'bullet', items: [inlineMdToHtml(m[1])] })
    } else if ((m = NUMBER_RE.exec(line))) {
      const g = last()
      if (g?.kind === 'numbered') g.items.push(inlineMdToHtml(m[1]))
      else out.push({ kind: 'numbered', items: [inlineMdToHtml(m[1])] })
    } else if ((m = QUOTE_RE.exec(line))) {
      const g = last()
      if (g?.kind === 'quote') g.lines.push(inlineMdToHtml(m[1]))
      else out.push({ kind: 'quote', lines: [inlineMdToHtml(m[1])] })
    } else {
      out.push({ kind: 'plain', html: inlineMdToHtml(line) })
    }
  }
  return out
}

export function mdToTiptapHtml(md: string): string {
  return groupLines(md)
    .map((g) => {
      switch (g.kind) {
        case 'heading':
          return `<h${g.level}>${g.html}</h${g.level}>`
        case 'task':
          return (
            '<ul data-type="taskList">' +
            g.items
              .map((i) => `<li data-type="taskItem" data-checked="${i.checked}"><p>${i.html}</p></li>`)
              .join('') +
            '</ul>'
          )
        case 'bullet':
          return '<ul>' + g.items.map((i) => `<li><p>${i}</p></li>`).join('') + '</ul>'
        case 'numbered':
          return '<ol>' + g.items.map((i) => `<li><p>${i}</p></li>`).join('') + '</ol>'
        case 'quote':
          return '<blockquote>' + g.lines.map((l) => `<p>${l}</p>`).join('') + '</blockquote>'
        case 'plain':
          return g.html ? `<p>${g.html}</p>` : '<p></p>'
      }
    })
    .join('')
}

// ── TipTap JSON → Markdown ───────────────────────────────────────────────────────

// The slice of ProseMirror's JSON shape we walk. Everything is optional on
// purpose — the serializer must survive any node TipTap (or a future extension)
// hands it.
export interface TiptapNode {
  type?: string
  text?: string
  attrs?: { level?: number; checked?: boolean } & Record<string, unknown>
  marks?: { type?: string }[]
  content?: TiptapNode[]
}

// Inline: a text run with its marks folded back to the note grammar's markers.
// Mark order is normalized (strike outside, bold, then italic) so round-trips are
// stable; unknown marks (underline, link, code…) keep their text unadorned.
function inlineToMd(nodes: TiptapNode[] | undefined): string {
  let out = ''
  for (const n of nodes ?? []) {
    if (n.type === 'hardBreak') {
      out += '\n'
      continue
    }
    let t = n.text ?? inlineToMd(n.content)
    if (!t) continue
    const kinds = new Set((n.marks ?? []).map((m) => m.type))
    if (kinds.has('italic')) t = `*${t}*`
    if (kinds.has('bold')) t = `**${t}**`
    if (kinds.has('strike')) t = `~~${t}~~`
    out += t
  }
  return out
}

// The paragraphs inside a list item / blockquote, flattened to their text (the
// note grammar is line-based — a multi-paragraph item becomes hardBreak lines).
function blockText(node: TiptapNode): string {
  return (node.content ?? [])
    .map((c) => (c.type === 'paragraph' ? inlineToMd(c.content) : inlineToMd(c.content ?? [c])))
    .join('\n')
}

export function tiptapDocToMd(doc: TiptapNode): string {
  const out: string[] = []
  for (const node of doc.content ?? []) {
    switch (node.type) {
      case 'heading': {
        const level = (node.attrs?.level ?? 1) <= 1 ? '# ' : '## '
        out.push(level + inlineToMd(node.content).trim())
        break
      }
      case 'taskList':
        for (const li of node.content ?? [])
          out.push((li.attrs?.checked ? '- [x] ' : '- [ ] ') + blockText(li).replace(/\n/g, ' ').trim())
        break
      case 'bulletList':
        for (const li of node.content ?? []) out.push('- ' + blockText(li).replace(/\n/g, ' ').trim())
        break
      case 'orderedList':
        for (const li of node.content ?? []) out.push('1. ' + blockText(li).replace(/\n/g, ' ').trim())
        break
      case 'blockquote':
        for (const line of blockText(node).split('\n')) out.push('> ' + line.trim())
        break
      case 'paragraph': {
        const text = inlineToMd(node.content)
        text.split('\n').forEach((l) => out.push(l))
        break
      }
      case 'codeBlock':
        // The note grammar has no fenced blocks — keep the text as plain lines.
        ;(node.content ?? []).forEach((c) => (c.text ?? '').split('\n').forEach((l) => out.push(l)))
        break
      default: {
        // Unknown block: never drop content — serialize whatever text it holds.
        const text = node.text ?? inlineToMd(node.content)
        if (text.trim()) text.split('\n').forEach((l) => out.push(l))
      }
    }
  }
  while (out.length && out[out.length - 1] === '') out.pop()
  return out.join('\n')
}
