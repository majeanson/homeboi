import { describe, expect, it } from 'vitest'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { firstLine, plainText, renderNoteBody, toggleCheckAt } from './noteMarkdown'

const html = (md: string) => renderToStaticMarkup(renderNoteBody(md) as ReactElement)

describe('renderNoteBody', () => {
  it('renders inline bold / italic / strike', () => {
    const out = html('a **b** c *d* e ~~f~~')
    expect(out).toContain('<strong>b</strong>')
    expect(out).toContain('<em>d</em>')
    expect(out).toContain('<del>f</del>')
  })

  it('renders headings', () => {
    expect(html('# Big')).toContain('<h3')
    expect(html('## Small')).toContain('<h4')
  })

  it('groups bullets into a ul and numbered into an ol', () => {
    const ul = html('- one\n- two')
    expect(ul).toContain('<ul')
    expect((ul.match(/<li/g) ?? []).length).toBe(2)
    expect(html('1. a\n2. b')).toContain('<ol')
  })

  it('renders a checklist with checked state', () => {
    const out = html('- [ ] todo\n- [x] done')
    expect(out).toContain('note-md__checklist')
    expect(out).toContain('aria-pressed="true"') // the done item
    expect(out).toContain('aria-pressed="false"')
  })

  it('renders a quote and paragraphs with line breaks', () => {
    expect(html('> quoted')).toContain('<blockquote')
    expect(html('line one\nline two')).toContain('<br/>')
  })

  it('does not emit raw HTML from the source', () => {
    const out = html('<script>alert(1)</script> **safe**')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })
})

describe('plainText / firstLine', () => {
  it('strips block + inline markers', () => {
    expect(plainText('## Title\n- **bold** item\n- [x] done')).toBe('Title\nbold item\ndone')
  })
  it('firstLine returns the first non-empty stripped line', () => {
    expect(firstLine('\n\n# Hello world\nmore')).toBe('Hello world')
    expect(firstLine('')).toBe('')
  })
})

describe('toggleCheckAt', () => {
  it('flips an unchecked box to checked and back', () => {
    const md = '- [ ] buy milk\n- [x] call mom'
    const once = toggleCheckAt(md, 0)
    expect(once).toBe('- [x] buy milk\n- [x] call mom')
    expect(toggleCheckAt(once, 1)).toBe('- [x] buy milk\n- [ ] call mom')
  })
  it('is a no-op on a non-checklist line', () => {
    expect(toggleCheckAt('plain', 0)).toBe('plain')
    expect(toggleCheckAt('- [ ] a', 5)).toBe('- [ ] a')
  })
})
