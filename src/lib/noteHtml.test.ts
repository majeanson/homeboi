import { describe, expect, it } from 'vitest'
import {
  blockKindOf,
  convertLine,
  htmlToMd,
  inlineHtmlToMd,
  inlineMdToHtml,
  lineToHtml,
  mdToHtml,
  setLineKind,
  toggleCheckbox,
} from './noteHtml'

// Build a detached element / root from HTML (happy-dom).
const firstEl = (html: string): HTMLElement => {
  const d = document.createElement('div')
  d.innerHTML = html
  return d.firstElementChild as HTMLElement
}
const root = (html: string): HTMLElement => {
  const d = document.createElement('div')
  d.innerHTML = html
  return d
}
// Markdown → editor HTML → Markdown round-trip (the display-correctness guarantee).
const rt = (md: string): string => htmlToMd(root(mdToHtml(md)))

describe('inline ⇄ html', () => {
  it('renders bold / italic / strike', () => {
    expect(inlineMdToHtml('a **b** *c* ~~d~~')).toBe('a <strong>b</strong> <em>c</em> <s>d</s>')
  })
  it('escapes raw HTML so notes can never inject markup', () => {
    expect(inlineMdToHtml('<script>x</script>')).toBe('&lt;script&gt;x&lt;/script&gt;')
  })
  it('serializes <b>/<strong>, <i>/<em>, <s>/<del> back to markdown', () => {
    expect(inlineHtmlToMd(firstEl('<div><b>a</b> <i>b</i> <del>c</del></div>'))).toBe('**a** *b* ~~c~~')
  })
})

describe('lineToHtml — one markdown line → one editor element', () => {
  it('maps each block kind to the right element/class', () => {
    expect(lineToHtml('# Big')).toBe('<h3>Big</h3>')
    expect(lineToHtml('## Small')).toBe('<h4>Small</h4>')
    expect(lineToHtml('- milk')).toBe('<div class="ne-bullet">milk</div>')
    expect(lineToHtml('1. first')).toBe('<div class="ne-number">first</div>')
    expect(lineToHtml('> quote')).toBe('<div class="ne-quote">quote</div>')
    expect(lineToHtml('plain')).toBe('<div>plain</div>')
    expect(lineToHtml('')).toBe('<div><br></div>')
  })
  it('renders a checklist line with a non-editable checkbox + state', () => {
    expect(lineToHtml('- [ ] todo')).toBe('<div class="ne-check" data-checked="false"><span class="ne-cb" contenteditable="false"></span>todo</div>')
    expect(lineToHtml('- [x] done')).toContain('data-checked="true"')
  })
})

describe('md → html → md round-trips (every format, displays correctly 100%)', () => {
  const cases: [string, string][] = [
    ['bold', '**bold** text'],
    ['italic', '*italic* text'],
    ['strike', '~~strike~~ text'],
    ['heading 1', '# Heading'],
    ['heading 2', '## Sub'],
    ['bullet', '- one\n- two'],
    ['numbered', '1. one\n1. two'],
    ['checklist', '- [ ] todo\n- [x] done'],
    ['quote', '> quoted'],
    ['plain', 'just text'],
    ['mixed', '# Title\nintro\n- a\n- [x] b\n1. c\n> note\n**bold** end'],
  ]
  for (const [name, md] of cases) {
    it(name, () => expect(rt(md)).toBe(md))
  }
})

describe('block buttons — setLineKind toggles a line (intuitive press)', () => {
  it('press bullet on a plain line → bullet; press again → plain', () => {
    const plain = firstEl('<div>milk</div>')
    const bul = setLineKind(plain, 'bullet')
    expect(bul.outerHTML).toBe('<div class="ne-bullet">milk</div>')
    expect(blockKindOf(bul)).toBe('bullet')
    expect(setLineKind(bul, 'bullet').outerHTML).toBe('<div>milk</div>')
  })
  it('switches list type without stacking (bullet → numbered → check)', () => {
    let el: HTMLElement = firstEl('<div>x</div>')
    el = setLineKind(el, 'bullet')
    el = setLineKind(el, 'numbered')
    expect(el.outerHTML).toBe('<div class="ne-number">x</div>')
    el = setLineKind(el, 'check')
    expect(htmlToMd(root(el.outerHTML))).toBe('- [ ] x')
  })
  it('heading and quote toggle on and off', () => {
    expect(setLineKind(firstEl('<div>t</div>'), 'heading').tagName).toBe('H3')
    expect(setLineKind(firstEl('<h3>t</h3>'), 'heading').outerHTML).toBe('<div>t</div>')
    expect(setLineKind(firstEl('<div>t</div>'), 'quote').outerHTML).toBe('<div class="ne-quote">t</div>')
  })
  it('drops the checkbox widget when leaving a checklist', () => {
    const chk = firstEl('<div class="ne-check" data-checked="true"><span class="ne-cb" contenteditable="false"></span>x</div>')
    expect(convertLine(chk, 'plain').outerHTML).toBe('<div>x</div>')
  })
  it('preserves inline formatting through a block change', () => {
    const el = firstEl('<div><strong>a</strong> b</div>')
    expect(setLineKind(el, 'bullet').innerHTML).toBe('<strong>a</strong> b')
  })
})

describe('checkbox button — toggleCheckbox', () => {
  it('flips a checklist line and reports the change', () => {
    const li = firstEl('<div class="ne-check" data-checked="false"><span class="ne-cb"></span>x</div>')
    expect(toggleCheckbox(li)).toBe(true)
    expect(li.getAttribute('data-checked')).toBe('true')
    expect(htmlToMd(root(li.outerHTML))).toBe('- [x] x')
    toggleCheckbox(li)
    expect(htmlToMd(root(li.outerHTML))).toBe('- [ ] x')
  })
  it('is a no-op on a non-checklist line', () => {
    expect(toggleCheckbox(firstEl('<div>x</div>'))).toBe(false)
  })
})

describe('robustness', () => {
  it('an empty editor serializes to an empty string', () => {
    expect(htmlToMd(root('<div><br></div>'))).toBe('')
    expect(htmlToMd(root(''))).toBe('')
  })
  it('ignores stray top-level text nodes and <br>', () => {
    expect(htmlToMd(root('hello<div>world</div>'))).toBe('hello\nworld')
  })
})
