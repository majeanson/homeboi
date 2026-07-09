import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { InlineIcon } from '../Icon'
import { isGuest } from '../../lib/device'
import { usePointerDnd, DragGhost, DND_HOLD_MS } from '../../lib/dnd'
import { DragPill } from '../DragPill'
import {
  useBoardCards,
  setCardPrefs,
  resetCardPrefs,
  cardMeta,
  cardMode,
  moveCard,
  type BoardCardId,
} from '../../lib/boardCards'

// « Disposition du babillard » — per-device control over which Grille cards show and
// in what order (lib/boardCards). A wall kiosk and a phone keep their own layout. Each
// row is a DragPill (reorder via usePointerDnd, the shared touch DnD) with a show/hide
// toggle. Reuses OperatorSection + DragPill + usePointerDnd — no new primitives. Calm:
// it only hides/reorders cards already on the board, adds no surface.
export function BoardLayoutSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const ro = isGuest()
  const prefs = useBoardCards()

  // Reorder: move the dragged row (index `from`) to the drop row (index `to`), then
  // persist the new order. Hold-to-drag so a tap/scroll on the handle never starts one.
  const dnd = usePointerDnd({
    onDrop: (from, to) => {
      const fromI = Number(from)
      const toI = Number(to)
      if (Number.isNaN(fromI) || Number.isNaN(toI) || fromI === toI) return
      const id = prefs.grid[fromI]
      if (!id) return
      setCardPrefs(moveCard(prefs, id, 'grid', toI))
    },
    canDrop: (from, to) => from !== to,
    holdMs: DND_HOLD_MS,
  })

  // Show/hide is the `never` end of the per-card mode. Turning a card back ON drops the
  // override entirely, so it returns to its own default ('auto' for the cards that
  // collapse when empty, 'always' for the four that hold their place) rather than being
  // pinned to a mode the user never chose.
  const toggle = (id: BoardCardId) => {
    const mode = { ...prefs.mode }
    if (cardMode(prefs, id) === 'never') delete mode[id]
    else mode[id] = 'never'
    setCardPrefs({ mode })
  }

  // The show/hide toggle button — identical for band + grid rows (only their wrapper
  // differs: a plain <li> for the fixed band, a draggable DragPill for the grid).
  const toggleBtn = (id: BoardCardId, visible: boolean) => (
    <button
      type="button"
      className={`btn btn--sm${visible ? ' btn--primary' : ''} board-layout__toggle`}
      onClick={() => toggle(id)}
      aria-pressed={visible}
      aria-label={`${t.boardCard[id]} — ${visible ? t.operator.boardLayoutShown : t.operator.boardLayoutHidden}`}
    >
      <InlineIcon name={visible ? 'check-bold' : 'x-bold'} size={15} />{' '}
      {visible ? t.operator.boardLayoutShown : t.operator.boardLayoutHidden}
    </button>
  )

  return (
    <OperatorSection
      title={t.operator.boardLayout}
      hint={t.operator.boardLayoutHint}
      help={help}
      helpKey="boardLayout"
      action={
        !ro ? (
          <button type="button" className="btn btn--ghost btn--sm mono" onClick={resetCardPrefs}>
            {t.operator.boardLayoutReset}
          </button>
        ) : undefined
      }
    >
      {/* The fixed top band (« Ce soir »/météo, « À régler », « Moments ») — show/hide
          only: these keep their glance position on top, so no drag grip. */}
      <p className="board-layout__group mono">{t.operator.boardLayoutBand}</p>
      <ul className="board-layout">
        {prefs.band.map((id) => {
          const meta = cardMeta(id)
          if (!meta) return null
          const visible = cardMode(prefs, id) !== 'never'
          return (
            <li key={id} className={'board-layout__row board-layout__row--fixed' + (visible ? '' : ' is-hidden')}>
              <span className="board-layout__name">
                <InlineIcon name={meta.icon} size={16} /> {t.boardCard[id]}
              </span>
              {!ro && toggleBtn(id, visible)}
            </li>
          )
        })}
      </ul>
      {/* The reorderable masonry cards below the band — show/hide AND drag-reorder. */}
      <p className="board-layout__group mono">{t.operator.boardLayoutGrid}</p>
      <ul className="board-layout">
        {prefs.grid.map((id, i) => {
          const meta = cardMeta(id)
          if (!meta) return null
          const visible = cardMode(prefs, id) !== 'never'
          return (
            <DragPill
              key={id}
              dnd={dnd}
              index={i}
              label={t.boardCard[id]}
              className={'board-layout__row' + (visible ? '' : ' is-hidden')}
              showGrip={!ro}
            >
              <span className="board-layout__name">
                <InlineIcon name={meta.icon} size={16} /> {t.boardCard[id]}
              </span>
              {!ro && toggleBtn(id, visible)}
            </DragPill>
          )
        })}
      </ul>
      <DragGhost ghost={dnd.ghost} />
    </OperatorSection>
  )
}
