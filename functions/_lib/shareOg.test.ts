import { describe, it, expect } from 'vitest'
import { shareOgMeta } from './shareOg'

const ORIGIN = 'https://babillard.test'

describe('shareOgMeta', () => {
  it('builds recipe copy + resolves an R2-key image to an absolute /api/img url', () => {
    const meta = shareOgMeta('recipe', 'Soupe', JSON.stringify({ title: 'Soupe', image: 'sh_abc' }), ORIGIN, 'id1')
    expect(meta?.title).toBe('Soupe — une recette partagée sur Babillard')
    expect(meta?.image).toBe('https://babillard.test/api/img/sh_abc')
  })

  it('passes a remote https recipe image through untouched', () => {
    const meta = shareOgMeta('recipe', 'X', JSON.stringify({ image: 'https://cdn.test/a.jpg' }), ORIGIN, 'id1')
    expect(meta?.image).toBe('https://cdn.test/a.jpg')
  })

  it('uses a routine’s first card photo, and none when no card has one', () => {
    const withPhoto = shareOgMeta('routine', 'Dodo', JSON.stringify({ cards: [{ photoKey: '' }, { photoKey: 'rp_x' }] }), ORIGIN, 'id')
    expect(withPhoto?.image).toBe('https://babillard.test/api/img/rp_x')
    const none = shareOgMeta('routine', 'Dodo', JSON.stringify({ cards: [{ photoKey: '' }] }), ORIGIN, 'id')
    expect(none?.image).toBeUndefined()
  })

  it('falls back the name from the label, then the payload title/name', () => {
    expect(shareOgMeta('event', 'BBQ', '{}', ORIGIN, 'id')?.title).toBe('BBQ — un rendez-vous partagé')
    expect(shareOgMeta('routine', '', JSON.stringify({ name: 'Bain' }), ORIGIN, 'id')?.title).toBe('Bain — une routine illustrée')
    expect(shareOgMeta('recipe', '', '{}', ORIGIN, 'id')?.title).toBe('Babillard — une recette partagée sur Babillard')
  })

  it('family gets a title-only card (no image); an unknown kind → null', () => {
    const fam = shareOgMeta('family', 'Les Tremblay', '{}', ORIGIN, 'id')
    expect(fam?.title).toBe('Les Tremblay — partagé sur Babillard')
    expect(fam?.image).toBeUndefined()
    expect(shareOgMeta('trip', 'x', '{}', ORIGIN, 'id')).toBeNull()
  })

  it('tolerates a corrupt payload (bare title from the label)', () => {
    const meta = shareOgMeta('recipe', 'Tarte', 'not json', ORIGIN, 'id')
    expect(meta?.title).toBe('Tarte — une recette partagée sur Babillard')
    expect(meta?.image).toBeUndefined()
  })
})
