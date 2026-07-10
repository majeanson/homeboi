import { describe, it, expect } from 'vitest'
import { templateOptions } from './comboOptions'
import type { TodoTemplate } from '../../lib/todos'
import type { useT } from '../../i18n'

// Only the two strings templateOptions reads — the rest of `t` never comes near it.
const t = {
  todos: {
    templatesLabel: 'Modèles :',
    templateItemsCount: (n: number) => `${n} élément${n > 1 ? 's' : ''}`,
  },
} as unknown as ReturnType<typeof useT>

const tpl = (id: string, title: string, items: TodoTemplate['items']): TodoTemplate => ({
  id,
  title,
  items,
  position: 0,
})
const item = (label: string) => ({ kind: 'item', label }) as const
const ref = (refId: string) => ({ kind: 'ref', refId }) as const

describe('templateOptions (the « Modèles : » dropdown rows)', () => {
  it('names the first four items and defers the rest to a +N', () => {
    const t1 = tpl('t1', 'Avant de partir', [
      item('Clés'),
      item('Portefeuille'),
      item('Bouteille d’eau'),
      item('Manteau'),
      item('Lunch'),
      item('Souliers'),
    ])
    const [opt] = templateOptions([t1], t)
    expect(opt.label).toBe('Avant de partir')
    expect(opt.hint).toBe('Clés · Portefeuille · Bouteille d’eau · Manteau · +2')
    expect(opt.badge).toBeTruthy()
  })

  it('drops the +N when the list fits entirely in the hint', () => {
    const t1 = tpl('t1', 'Court', [item('Sac à dos'), item('Collation')])
    expect(templateOptions([t1], t)[0].hint).toBe('Sac à dos · Collation')
  })

  it('previews what will ACTUALLY be added: refs expanded, deduped', () => {
    // A composed list — "Famille" pulls in "Alexis" and adds one of its own. The
    // hint must show the flattened labels, not the ref, and drop the repeat.
    const kid = tpl('k', 'Alexis', [item('Doudou'), item('Tuque')])
    const fam = tpl('f', 'Famille', [ref('k'), item('Tuque'), item('Poussette')])
    const opts = templateOptions([kid, fam], t)
    const famOpt = opts.find((o) => o.id === 'f')!
    expect(famOpt.hint).toBe('Doudou · Tuque · Poussette')
    // …and the same labels feed the type-to-filter, so typing an ITEM finds the list.
    expect(famOpt.keywords).toEqual(['Doudou', 'Tuque', 'Poussette'])
  })

  it('stays quiet for an empty list rather than badging it "0 éléments"', () => {
    const [opt] = templateOptions([tpl('t1', 'Vide', [])], t)
    expect(opt.hint).toBeUndefined()
    expect(opt.badge).toBeUndefined()
  })

  it('groups every row under the Modèles heading', () => {
    const opts = templateOptions([tpl('a', 'A', [item('x')]), tpl('b', 'B', [item('y')])], t)
    expect(opts.map((o) => o.group)).toEqual(['Modèles :', 'Modèles :'])
  })
})
