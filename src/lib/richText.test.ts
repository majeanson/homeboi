import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { highlight, renderRich, stripTokens } from './richText'
import { guideHref } from './settingsNav'

// The promise: the manual reads as prose. A sentence shows the same icon as the button
// it points at, a card reference is a link and not a raw token, a term is a word first
// and a definition second, and Guide search finds and lights the words a reader sees.

function rich(node: ReactNode) {
  return render(createElement(MemoryRouter, null, createElement('p', { 'data-testid': 'p' }, node)))
}
const marks = (c: HTMLElement) => Array.from(c.querySelectorAll('mark.hl')).map((m) => m.textContent)

describe('stripTokens', () => {
  it('search matches what a reader sees: the label of a link and of a term', () => {
    expect(stripTokens('Voir [[card:liste|la liste]] et le [[mot:outbox|brouillon]].')).toBe(
      'Voir la liste et le brouillon.',
    )
  })

  it('an icon leaves nothing behind to match or to count', () => {
    expect(stripTokens('Touche [[icon:plus-bold]] ici')).toBe('Touche  ici')
  })

  it('a card token with no label keeps its id rather than vanishing', () => {
    expect(stripTokens('[[card:liste]]')).toBe('liste')
  })
})

describe('highlight', () => {
  it('« Réglages » lights up when the user typed « reglages »', () => {
    const { container } = rich(highlight('Ouvre Réglages puis RÉGLAGES', 'reglages'))
    expect(marks(container)).toEqual(['Réglages', 'RÉGLAGES'])
    expect(container.textContent).toBe('Ouvre Réglages puis RÉGLAGES')
  })

  it('no match returns the text untouched', () => {
    expect(highlight('La liste', 'zzz')).toBe('La liste')
  })

  it('a match at either edge loses no letter', () => {
    const { container } = rich(highlight('sel et poivre et sel', 'sel'))
    expect(container.textContent).toBe('sel et poivre et sel')
    expect(marks(container)).toEqual(['sel', 'sel'])
  })

  it('the words after the last match stay on the page', () => {
    const { container } = rich(highlight('du sel, du poivre', 'sel'))
    expect(container.textContent).toBe('du sel, du poivre')
  })
})

describe('renderRich', () => {
  it('plain prose renders as it was written', () => {
    expect(rich(renderRich('Rien de spécial.')).container.textContent).toBe('Rien de spécial.')
  })

  it('an icon token paints the app icon, and no bracket reaches the reader', () => {
    const { container } = rich(renderRich('Touche [[icon:plus-bold]] ici'))
    expect(container.textContent).toBe('Touche  ici')
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('a card reference is a link to that card, so features cross-reference instead of being islands', () => {
    rich(renderRich('Voir [[card:liste|la liste]].'))
    const link = screen.getByRole('link', { name: 'la liste' })
    expect(link.getAttribute('href')).toBe(guideHref('liste'))
    expect(link.classList.contains('guide-link')).toBe(true)
  })

  it('a card link inside a clickable summary navigates without also toggling the card', () => {
    const onSummary = vi.fn()
    function Where() {
      return createElement('output', null, useLocation().pathname)
    }
    render(
      createElement(
        MemoryRouter,
        null,
        createElement('div', { onClick: onSummary }, renderRich('[[card:liste|la liste]]')),
        createElement(Where),
      ),
    )
    fireEvent.click(screen.getByRole('link', { name: 'la liste' }))
    expect(onSummary).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe(new URL(guideHref('liste'), 'http://x').pathname)
  })

  it('a glossary term is the plain word the instant the text paints, and stays that word', async () => {
    const { container } = rich(renderRich('Le [[mot:outbox|brouillon]] attend.'))
    expect(container.textContent).toBe('Le brouillon attend.')
    await waitFor(() => expect(container.querySelector('.glossary-term, button')).not.toBeNull())
    expect(container.textContent).toContain('brouillon')
  })

  it('search marks the prose and the link label, and never reaches into a token', () => {
    const { container } = rich(renderRich('[[icon:plus-bold]] plus de [[card:plus|plus]] encore', 'plus'))
    expect(marks(container)).toEqual(['plus', 'plus'])
    expect(screen.getByRole('link').querySelector('mark.hl')?.textContent).toBe('plus')
  })

  it('a card token with no label shows its id rather than an empty link', () => {
    rich(renderRich('[[card:liste]]'))
    expect(screen.getByRole('link').textContent).toBe('liste')
  })

  it('rendering twice gives the same text: the shared token pattern keeps no position', () => {
    const text = 'a [[card:liste|b]] c'
    const once = rich(renderRich(text)).container.textContent
    const twice = rich(renderRich(text)).container.textContent
    expect(twice).toBe(once)
    expect(once).toBe('a b c')
  })
})
