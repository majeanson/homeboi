import { useState } from 'react'
import { DECK_EMOJIS, type DeckCard } from '../lib/routineTemplates'
import { useT } from '../i18n'

// Edit a routine's deck of picture cards: each card is an emoji + a word. Tap
// the emoji to switch it from a palette, type the word, reorder by dragging the
// handle (or the ↑/↓ buttons — reliable on touch where native drag isn't).
// Controlled: the parent owns the cards array.
export function CardDeckEditor({
  cards,
  onChange,
}: {
  cards: DeckCard[]
  onChange: (cards: DeckCard[]) => void
}) {
  const t = useT()
  const [dragIndex, setDragIndex] = useState<number | null>(null)
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

  // Live reorder: as the dragged card passes over another, swap them.
  function onDragOver(e: React.DragEvent, i: number) {
    e.preventDefault()
    if (dragIndex === null || dragIndex === i) return
    move(dragIndex, i)
    setDragIndex(i)
  }

  return (
    <div className="deck">
      {cards.map((card, i) => (
        <div key={i} className="deck__row">
          <div
            className={'deck__card' + (dragIndex === i ? ' is-dragging' : '')}
            onDragOver={(e) => onDragOver(e, i)}
          >
            <span
              className="deck__handle mono"
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragEnd={() => setDragIndex(null)}
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
                ↑
              </button>
              <button
                type="button"
                className="deck__mini mono"
                onClick={() => move(i, i + 1)}
                disabled={i === cards.length - 1}
                aria-label={t.operator.moveDown}
              >
                ↓
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
    </div>
  )
}
