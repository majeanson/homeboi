import { describe, expect, it } from 'vitest'
import { mdToTiptapHtml, tiptapDocToMd, type TiptapNode } from './noteTiptap'

// The BETA editor's Markdown bridge. The storage format is the classic editor's
// grammar (noteGrammar) — both directions must speak it exactly, or a note
// edited in one editor corrupts in the other.

describe('mdToTiptapHtml', () => {
  it('groups consecutive checklist lines into ONE taskList', () => {
    expect(mdToTiptapHtml('- [ ] lait\n- [x] pain')).toBe(
      '<ul data-type="taskList">' +
        '<li data-type="taskItem" data-checked="false"><p>lait</p></li>' +
        '<li data-type="taskItem" data-checked="true"><p>pain</p></li>' +
        '</ul>',
    )
  })

  it('maps headings, bullets, numbers, quotes and inline marks', () => {
    expect(mdToTiptapHtml('# Titre')).toBe('<h1>Titre</h1>')
    expect(mdToTiptapHtml('## Sous')).toBe('<h2>Sous</h2>')
    expect(mdToTiptapHtml('- a\n- b')).toBe('<ul><li><p>a</p></li><li><p>b</p></li></ul>')
    expect(mdToTiptapHtml('1. a\n2. b')).toBe('<ol><li><p>a</p></li><li><p>b</p></li></ol>')
    expect(mdToTiptapHtml('> mot')).toBe('<blockquote><p>mot</p></blockquote>')
    expect(mdToTiptapHtml('**gras** et *penché*')).toBe('<p><strong>gras</strong> et <em>penché</em></p>')
  })

  it('a list interrupted by a plain line starts a NEW list after it', () => {
    expect(mdToTiptapHtml('- a\ntexte\n- b')).toBe(
      '<ul><li><p>a</p></li></ul><p>texte</p><ul><li><p>b</p></li></ul>',
    )
  })

  it('escapes raw HTML in the note text', () => {
    expect(mdToTiptapHtml('<img src=x>')).toBe('<p>&lt;img src=x&gt;</p>')
  })
})

describe('tiptapDocToMd', () => {
  const doc = (...content: TiptapNode[]): TiptapNode => ({ type: 'doc', content })
  const p = (...content: TiptapNode[]): TiptapNode => ({ type: 'paragraph', content })
  const txt = (text: string, ...marks: string[]): TiptapNode => ({
    type: 'text',
    text,
    marks: marks.map((type) => ({ type })),
  })

  it('serializes a task list back to checkbox lines', () => {
    const d = doc({
      type: 'taskList',
      content: [
        { type: 'taskItem', attrs: { checked: false }, content: [p(txt('lait'))] },
        { type: 'taskItem', attrs: { checked: true }, content: [p(txt('pain'))] },
      ],
    })
    expect(tiptapDocToMd(d)).toBe('- [ ] lait\n- [x] pain')
  })

  it('serializes headings, lists, quotes and marks', () => {
    const d = doc(
      { type: 'heading', attrs: { level: 1 }, content: [txt('Titre')] },
      { type: 'heading', attrs: { level: 3 }, content: [txt('Profond')] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [p(txt('a'))] }] },
      { type: 'orderedList', content: [{ type: 'listItem', content: [p(txt('b'))] }] },
      { type: 'blockquote', content: [p(txt('mot'))] },
      p(txt('gras', 'bold'), txt(' '), txt('barré', 'strike')),
    )
    expect(tiptapDocToMd(d)).toBe('# Titre\n## Profond\n- a\n1. b\n> mot\n**gras** ~~barré~~')
  })

  it('keeps text under unknown marks and unknown blocks (never drops content)', () => {
    const d = doc(
      p(txt('souligné', 'underline')),
      { type: 'mysteryBlock', content: [txt('gardé')] },
    )
    expect(tiptapDocToMd(d)).toBe('souligné\ngardé')
  })

  it('round-trips through the classic grammar', () => {
    const md = '# Épicerie\n- [ ] lait\n- [x] pain\n- pommes\n1. premier\n> penser à jeudi\n**gras** et *doux*'
    // md → TipTap HTML is covered above; here assert the JSON path lands on the
    // exact same md a classic-editor save would store.
    const d = doc(
      { type: 'heading', attrs: { level: 1 }, content: [txt('Épicerie')] },
      {
        type: 'taskList',
        content: [
          { type: 'taskItem', attrs: { checked: false }, content: [p(txt('lait'))] },
          { type: 'taskItem', attrs: { checked: true }, content: [p(txt('pain'))] },
        ],
      },
      { type: 'bulletList', content: [{ type: 'listItem', content: [p(txt('pommes'))] }] },
      { type: 'orderedList', content: [{ type: 'listItem', content: [p(txt('premier'))] }] },
      { type: 'blockquote', content: [p(txt('penser à jeudi'))] },
      p(txt('gras', 'bold'), txt(' et '), txt('doux', 'italic')),
    )
    expect(tiptapDocToMd(d)).toBe(md)
  })
})
