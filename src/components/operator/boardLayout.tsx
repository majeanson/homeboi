import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { InlineIcon } from '../Icon'
import { isGuest } from '../../lib/device'
import { usePointerDnd, DragGhost, DND_HOLD_MS } from '../../lib/dnd'
import { DragPill } from '../DragPill'
import { useBoardCards, setCardPrefs, resetCardPrefs, BOARD_CARD_META, type BoardCardId } from '../../lib/boardCards'

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
      const order = [...prefs.order]
      const [moved] = order.splice(fromI, 1)
      order.splice(toI, 0, moved)
      setCardPrefs({ order })
    },
    canDrop: (from, to) => from !== to,
    holdMs: DND_HOLD_MS,
  })

  const toggle = (id: BoardCardId) => {
    const hidden = prefs.hidden.includes(id) ? prefs.hidden.filter((x) => x !== id) : [...prefs.hidden, id]
    setCardPrefs({ hidden })
  }

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
      <ul className="board-layout">
        {prefs.order.map((id, i) => {
          const meta = BOARD_CARD_META.find((m) => m.id === id)
          if (!meta) return null
          const visible = !prefs.hidden.includes(id)
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
              {!ro && (
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
              )}
            </DragPill>
          )
        })}
      </ul>
      <DragGhost ghost={dnd.ghost} />
    </OperatorSection>
  )
}
