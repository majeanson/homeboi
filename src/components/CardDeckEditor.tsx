import { useState } from 'react'
import { DECK_EMOJIS, type DeckCard } from '../lib/routineTemplates'
import { useT } from '../i18n'
import { usePointerDnd, DragGhost } from '../lib/dnd'
import { Icon } from './Icon'

// Edit a routine's deck of picture cards: each card is an emoji + a word. Tap
// the emoji to switch it from a palette, type the word, reorder by dragging the
// handle (touch-friendly — works on the wall tablet) or the ↑/↓ buttons.
// Controlled: the parent owns the cards array.
export function CardDeckEditor({
  cards,
  onChange,
}: {
  cards: DeckCard[]
  onChange: (cards: DeckCard[]) => void
}) {
  const t = useT()
  const [paletteFor, setPaletteFor] = useState<number | null>(null)

  const update = (i: number, patch: Partial<DeckCard>) =>
    onChange(cards.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  const remove = (i: number) => {
    onChange(cards.filter((_, idx) => idx !== i))
    setPaletteFor(null)
  }
  const add = () => onChange([...cards, { icon: '⭐', label: '' }])
  const move = (from: number, to: number) => {
    if (to < 0 || to >= cards.length || from === to) return
    const next = [...cards]
    const [m] = next.splice(from, 1)
    next.splice(to, 0, m)
    onChange(next)
  }

  // Reorder by dragging a card's grip onto another card (commit on drop, not a
  // live swap) — the same pointer DnD the meal plan uses, so it works on touch.
  const dnd = usePointerDnd({
    onDrop: (from, to) => move(Number(from), Number(to)),
    canDrop: (from, to) => from !== to,
  })

  return (
    <div className="deck">
      {cards.map((card, i) => (
        <div key={i} className="deck__row">
          <div
            data-dnd-zone={String(i)}
            className={
              'deck__card' +
              (dnd.activeId === String(i) ? ' is-dragging' : '') +
              (dnd.over === String(i) ? ' dnd-over' : '')
            }
          >
            <span
              className="deck__handle dnd-grip mono"
              data-dnd-grip=""
              onPointerDown={(e) => dnd.start(String(i), card.label || t.operator.cardWord, e)}
              role="button"
              aria-label={t.operator.dragHint}
              title={t.operator.dragHint}
            >
              ⠿
            </span>
            <button
              type="button"
              className="deck__emoji"
              onClick={() => setPaletteFor(paletteFor === i ? null : i)}
              aria-label={t.operator.emojiPick}
            >
              {card.icon || '⭐'}
            </button>
            <input
              className="input deck__word"
              value={card.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder={t.operator.cardWord}
              aria-label={t.operator.cardWord}
            />
            <div className="deck__btns">
              <button
                type="button"
                className="deck__mini mono"
                onClick={() => move(i, i - 1)}
                disabled={i === 0}
                aria-label={t.operator.moveUp}
              >
                <Icon name="caret-up-bold" size={16} />
              </button>
              <button
                type="button"
                className="deck__mini mono"
                onClick={() => move(i, i + 1)}
                disabled={i === cards.length - 1}
                aria-label={t.operator.moveDown}
              >
                <Icon name="caret-down-bold" size={16} />
              </button>
            </div>
            <button
              type="button"
              className="deck__remove mono"
              onClick={() => remove(i)}
              aria-label={t.operator.removeCard}
            >
              ×
            </button>
          </div>
          {paletteFor === i && (
            <div className="deck__palette">
              {DECK_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="deck__palette-emoji"
                  onClick={() => {
                    update(i, { icon: e })
                    setPaletteFor(null)
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <button type="button" className="btn btn--ghost mono deck__add" onClick={add}>
        ＋ {t.operator.addCard}
      </button>
      <DragGhost ghost={dnd.ghost} />
    </div>
  )
}
