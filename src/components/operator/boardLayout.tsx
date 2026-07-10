import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { InlineIcon } from '../Icon'
import { Cluster } from '../Layout'
import { usePointerDnd, DragGhost, DND_HOLD_MS } from '../../lib/dnd'
import { DragPill } from '../DragPill'
import {
  useBoardCards,
  setCardPrefs,
  resetCardPrefs,
  cardMeta,
  cardMode,
  cardSize,
  moveCard,
  nextSize,
  parseZoneKey,
  zoneKey,
  type BoardCardId,
  type CardMode,
  type CardZone,
} from '../../lib/boardCards'

// « Disposition du babillard » — per-device control over which board cards show, how wide
// they are, and in what order (lib/boardCards). A wall kiosk and a phone keep their own.
//
// This is the ACCESSIBLE MIRROR of the board's own long-press editor: same store, same
// three knobs, but reachable by keyboard and legible to a screen reader, which a
// press-and-drag gesture never will be. The shared « Voir dans l'app » row above the
// section (SUB_GOTO → /board?edit=1) is the way over for anyone who'd rather do it
// in place.
//
// Both groups are drag-reorderable and a card can be dragged BETWEEN them — the band used
// to be a fixed, show/hide-only strip, and that asymmetry is gone. Drop-zone ids are
// namespaced `"{zone}:{index}"` (the itinerary's precedent) so one dnd session serves both
// lists; each list ends in a "{zone}:end" target so a card can be moved into an emptied
// group. Reuses OperatorSection + DragPill + usePointerDnd — no new primitives.
//
// Calm: it only places, sizes and hides cards that already exist. No counts, no ranks.
//
// Every knob here writes localStorage, never the server, so there is nothing to gate on
// `isGuest()` — a babysitter or a demo visitor rearranging THEIR screen changes nothing for
// the household. (See the note on isGuest() in lib/device.)

const MODE_CYCLE: CardMode[] = ['always', 'auto', 'never']
// Always shown / shown ~sometimes (only when it has something to say) / never. Drawn from
// the existing Phosphor set (lib/pipIcons) — no new glyphs for a settings row.
const MODE_ICON = { always: 'check-bold', auto: 'approximate-equals-bold', never: 'x-bold' } as const

export function BoardLayoutSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const prefs = useBoardCards()

  // Both lists share ONE session; the zone travels in the drop-zone id. Hold-to-drag so a
  // tap or a scroll-flick on the handle never starts a move.
  const dnd = usePointerDnd({
    onDrop: (fromKey, toKey) => {
      const from = parseZoneKey(fromKey)
      const to = parseZoneKey(toKey)
      if (!from || !to || from.before === 'end') return
      // Drop keys name the CARD, not its row index: a row index would be read against the
      // rendered list while `moveCard` splices the stored one, and it would mean different
      // things dragging up vs down. `from.before` is the dragged card itself.
      setCardPrefs(moveCard(prefs, from.before, to.zone, to.before))
    },
    canDrop: (fromKey, toKey) => fromKey !== toKey,
    holdMs: DND_HOLD_MS,
  })

  const setMode = (id: BoardCardId, mode: CardMode) => setCardPrefs({ mode: { ...prefs.mode, [id]: mode } })
  const bumpSize = (id: BoardCardId) => setCardPrefs({ size: { ...prefs.size, [id]: nextSize(cardSize(prefs, id)) } })

  // What an EMPTY card does, as one cycling control rather than two flags that can
  // contradict each other. `never` is also the only mode that skips mounting the card.
  const modeBtn = (id: BoardCardId) => {
    const mode = cardMode(prefs, id)
    const label =
      mode === 'always'
        ? t.operator.boardLayoutModeAlways
        : mode === 'auto'
          ? t.operator.boardLayoutModeAuto
          : t.operator.boardLayoutModeNever
    return (
      <button
        type="button"
        className={`btn btn--sm${mode !== 'never' ? ' btn--primary' : ''} board-layout__toggle`}
        onClick={() => setMode(id, MODE_CYCLE[(MODE_CYCLE.indexOf(mode) + 1) % MODE_CYCLE.length]!)}
        aria-label={`${t.operator.boardLayoutMode(t.boardCard[id])} — ${label}`}
      >
        <InlineIcon name={MODE_ICON[mode]} size={15} /> {label}
      </button>
    )
  }

  const sizeBtn = (id: BoardCardId) => {
    const size = cardSize(prefs, id)
    const label = size === 'full' ? t.operator.boardLayoutSizeFull : t.operator.boardLayoutSizeN(size)
    return (
      <button
        type="button"
        className="btn btn--ghost btn--sm board-layout__size"
        onClick={() => bumpSize(id)}
        aria-label={`${t.operator.boardLayoutSize(t.boardCard[id])} — ${label}`}
      >
        <InlineIcon name="square-bold" size={15} /> {size === 'full' ? t.board.editSizeFull : size}
      </button>
    )
  }

  const list = (zone: CardZone, title: string) => (
    <>
      <p className="board-layout__group mono">{title}</p>
      <ul className="board-layout">
        {prefs[zone].map((id, i) => {
          const meta = cardMeta(id)
          if (!meta) return null
          return (
            <DragPill
              key={id}
              dnd={dnd}
              index={i}
              zone={zoneKey(zone, id)}
              label={t.boardCard[id]}
              className={'board-layout__row' + (cardMode(prefs, id) === 'never' ? ' is-hidden' : '')}
              showGrip
            >
              <span className="board-layout__name">
                <InlineIcon name={meta.icon} size={16} /> {t.boardCard[id]}
              </span>
              <Cluster>
                {sizeBtn(id)}
                {modeBtn(id)}
              </Cluster>
            </DragPill>
          )
        })}
        {/* The tail target: drop here to append, which is the only way to move a card
            back into a group you emptied. */}
        <li
          data-dnd-zone={zoneKey(zone, 'end')}
          className={'board-layout__end mono' + (dnd.over === zoneKey(zone, 'end') ? ' dnd-over' : '')}
        >
          {t.operator.boardLayoutDropHere}
        </li>
      </ul>
    </>
  )

  return (
    <OperatorSection
      title={t.operator.boardLayout}
      hint={t.operator.boardLayoutHint}
      help={help}
      helpKey="boardLayout"
      action={
        // The old « Réorganiser sur le babillard » link moved to the shared
        // « Voir dans l'app » row (SUB_GOTO in lib/settingsNav) — one pattern
        // for every sub, not a bespoke button here.
        <button type="button" className="btn btn--ghost btn--sm mono" onClick={resetCardPrefs}>
          {t.operator.boardLayoutReset}
        </button>
      }
    >
      {list('band', t.operator.boardLayoutBand)}
      {list('grid', t.operator.boardLayoutGrid)}
      <DragGhost ghost={dnd.ghost} />
    </OperatorSection>
  )
}
