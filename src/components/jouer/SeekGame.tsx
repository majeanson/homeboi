import { useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n'
import { useSpeak } from '../../lib/speak'
import { Icon } from '../Icon'
import { type SeekDeck, type SeekItem, pickSeekRound } from '../../lib/playContent'

// « Cherche et trouve » — the hear-first find-it TOY. Pick a deck (faces / animals /
// colours / foods / weather / a mix), then: "Trouve le chien !" Tap the right tile →
// a warm "Bravo !" + the next thing to find; tap anything else → it just says that
// tile's name. NO score, NO fail, NO end — calm by design (NFR-CALM): a pre-reader
// learns names by matching picture to spoken word, for as long as they like.
const BOARD_MAX = 6
const CELEBRATE_MS = 1300

export function SeekGame({ decks }: { decks: SeekDeck[] }) {
  const t = useT()
  const speak = useSpeak()
  const p = t.play
  const [deck, setDeck] = useState<SeekDeck | null>(null)
  const [round, setRound] = useState<{ board: SeekItem[]; target: SeekItem } | null>(null)
  const [found, setFound] = useState(false)
  const prevId = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => () => clear(), [])

  // Start a fresh round of `d`: a new little board + a new thing to find, spoken.
  const nextRound = (d: SeekDeck) => {
    clear()
    const r = pickSeekRound(d, Math.min(BOARD_MAX, d.items.length), prevId.current)
    prevId.current = r.target.id
    setFound(false)
    setRound(r)
    speak(p.seek.find(r.target.label), r.target.lang)
  }

  const enterDeck = (d: SeekDeck) => {
    setDeck(d)
    nextRound(d)
  }
  const leaveDeck = () => {
    clear()
    prevId.current = null
    setRound(null)
    setDeck(null)
  }

  const tap = (item: SeekItem) => {
    if (!round || found) return
    if (item.id === round.target.id) {
      setFound(true)
      speak(p.seek.bravo(round.target.label), round.target.lang)
      timer.current = setTimeout(() => deck && nextRound(deck), CELEBRATE_MS)
    } else {
      // No penalty — just name what they tapped (they learn that one too).
      speak(item.label, item.lang)
    }
  }

  // ---- deck picker -----------------------------------------------------------
  if (!deck) {
    return (
      <div className="seek seek--pick">
        <button type="button" className="sayable seek__title" onClick={() => speak(p.seek.pickHint)}>
          {p.seek.pickHint}
        </button>
        <div className="seek__decks">
          {decks.map((d) => (
            <button key={d.id} type="button" className="seek-deck" onClick={() => enterDeck(d)} aria-label={d.label}>
              <span className="seek-deck__emoji" aria-hidden="true">{d.emoji}</span>
              <span className="seek-deck__label">{d.label}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ---- a round ---------------------------------------------------------------
  return (
    <div className="seek">
      <div className="seek__bar">
        <button type="button" className="btn btn--ghost seek__back" onClick={leaveDeck} aria-label={p.seek.otherDeck}>
          <Icon name="arrow-right-bold" size={18} style={{ transform: 'scaleX(-1)' }} /> {p.seek.otherDeck}
        </button>
      </div>
      {round && (
        <>
          {/* The prompt — big, and tappable to hear it again. */}
          <button type="button" className="seek__prompt" onClick={() => speak(p.seek.find(round.target.label), round.target.lang)}>
            <Icon name="speaker-high-bold" size={26} />
            <span>{p.seek.find(round.target.label)}</span>
          </button>
          <div className={'seek__board' + (found ? ' is-found' : '')}>
            {round.board.map((item) => {
              const isTarget = item.id === round.target.id
              return (
                <button
                  key={item.id}
                  type="button"
                  className={'seek-tile' + (found && isTarget ? ' is-right' : '')}
                  onClick={() => tap(item)}
                  aria-label={item.label}
                >
                  <span
                    className={'seek-tile__face' + (item.color && !item.emoji ? ' seek-tile__face--swatch' : '')}
                    style={item.color && !item.emoji ? { background: item.color } : undefined}
                    aria-hidden="true"
                  >
                    {item.photo ? <img src={item.photo} alt="" loading="lazy" /> : item.emoji ?? ''}
                  </span>
                  <span className="seek-tile__label">{item.label}</span>
                  {found && isTarget && (
                    <span className="seek-tile__check" aria-hidden="true">
                      <Icon name="check-bold" size={24} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {found && (
            <p className="seek__bravo" aria-live="polite">
              {p.seek.bravo(round.target.label)}
            </p>
          )}
        </>
      )}
    </div>
  )
}
