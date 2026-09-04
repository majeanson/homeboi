import { describe, expect, it } from 'vitest'
import { inlineMdToHtml } from './noteHtml'

describe('inlineMdToHtml', () => {
  it('renders bold / italic / strike', () => {
    expect(inlineMdToHtml('a **b** *c* ~~d~~')).toBe('a <strong>b</strong> <em>c</em> <s>d</s>')
  })
  it('escapes raw HTML so notes can never inject markup', () => {
    expect(inlineMdToHtml('<script>x</script>')).toBe('&lt;script&gt;x&lt;/script&gt;')
  })
})
