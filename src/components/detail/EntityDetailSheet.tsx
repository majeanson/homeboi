import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../i18n'
import { useModal } from '../../lib/useModal'
import { useSwipeToDismiss } from '../../lib/useSwipeToDismiss'
import { wash, tintInk, edge } from '../../lib/colors'
import { Icon } from '../Icon'
import { Avatar } from '../Avatar'
import { ZoomableImg } from '../ZoomableImg'
import { HeartButton } from '../HeartButton'
import type { DetailAction, DetailBlock, DetailModel } from '../../lib/detail'

// The generalized "entity detail" peek: one calm bottom sheet that renders any
// DetailModel (lib/detail) — a quick picture, a date, the relevant text, the face
// it belongs to, and a couple of smart actions. Opened from any board/kitchen row
// through useEntityDetail (DetailProvider). Same sheet stack as AddSheet (useModal
// + useSwipeToDismiss), so Esc / scrim-tap / swipe-down all close it.
//
// Always mounted; `model` toggles the `.show` slide. We retain the LAST model
// while closing so the content doesn't blink away mid-animation.
export function EntityDetailSheet({ model, onClose }: { model: DetailModel | null; onClose: () => void }) {
  const t = useT()
  const nav = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const open = !!model
  useModal(ref, onClose, { open })
  useSwipeToDismiss(ref, onClose, { open })

  // Keep showing the last model through the slide-out (model goes null on close).
  const [shown, setShown] = useState<DetailModel | null>(model)
  useEffect(() => {
    if (model) setShown(model)
  }, [model])
  const m = model ?? shown

  // Any action closes the peek first, then runs / navigates.
  const runAction = (a: DetailAction) => {
    onClose()
    a.run?.()
    if (a.href) nav(a.href)
  }

  return (
    <>
      <div className={'scrim' + (open ? ' show' : '')} onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        className={'sheet detail-sheet' + (open ? ' show' : '')}
        role="dialog"
        aria-modal="true"
        aria-label={m?.title ?? t.detail.aria}
      >
        <button type="button" className="sheet__close" onClick={onClose} aria-label={t.common.close}>
          <Icon name="x-bold" size={18} />
        </button>
        <div className="grab" aria-hidden="true" />
        {m && <DetailBody model={m} onAction={runAction} />}
      </div>
    </>
  )
}

function DetailBody({ model, onAction }: { model: DetailModel; onAction: (a: DetailAction) => void }) {
  // wash()/tintInk() need a concrete hex (string concat) — builders always set a
  // hex accent; this fallback just keeps them valid if one ever doesn't.
  const accent = model.accent ?? '#9b8d7d'
  return (
    <div className="detail-sheet__body">
      <div className="detail-sheet__head">
        <span className="detail-sheet__spine" style={{ background: accent }} aria-hidden="true" />
        {model.photo ? (
          <ZoomableImg src={model.photo} className="detail-sheet__photo" alt={model.title} />
        ) : (
          <span className="detail-sheet__tile" style={{ background: wash(accent) }} aria-hidden="true">
            {model.emoji ? (
              <span className="detail-sheet__emoji">{model.emoji}</span>
            ) : (
              model.icon && <Icon name={model.icon} size={34} color={accent} />
            )}
          </span>
        )}
        <div className="detail-sheet__heading">
          {model.when && <span className="detail-sheet__when mono">{model.when}</span>}
          <h3 className="detail-sheet__title" style={{ color: tintInk(accent) }}>
            {model.title}
          </h3>
          {model.whoLabel && <span className="detail-sheet__sub">{model.whoLabel}</span>}
          {model.who && (
            <span className="detail-sheet__who">
              <Avatar
                kind={model.who.avatarKind}
                photo={model.who.avatarRef}
                colour={model.who.colour}
                name={model.who.name}
                size={26}
              />
              <span>
                {model.who.role ? `${model.who.role} ` : ''}
                {model.who.name}
              </span>
            </span>
          )}
          {model.loveRecipeId && <HeartButton recipeId={model.loveRecipeId} />}
        </div>
      </div>

      {model.blocks?.map((b, i) => (
        <Block key={i} block={b} />
      ))}

      {model.actions && model.actions.length > 0 && (
        <div className="detail-sheet__actions">
          {model.actions.map((a) => (
            <button
              key={a.key}
              type="button"
              className={'btn' + (a.primary ? ' btn--primary' : '') + (a.tone === 'danger' ? ' btn--danger' : '')}
              onClick={() => onAction(a)}
            >
              {a.icon && <Icon name={a.icon} size={18} />}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Block({ block }: { block: DetailBlock }) {
  switch (block.kind) {
    case 'text':
      return <p className={'detail-sheet__text' + (block.hand ? ' detail-sheet__text--hand' : '')}>{block.text}</p>
    case 'chips':
      return (
        <div className="detail-sheet__chips">
          {block.label && <span className="detail-sheet__blocklabel mono">{block.label}</span>}
          <span className="detail-sheet__chiprow">
            {block.chips.map((c, i) => {
              // A per-chip household tag colour (recipe peek) tints it the SAME way
              // RecipeSheet/RecipesTab do; absent → the default berry chip.
              const hex = block.tones?.[i]
              return (
                <span key={i} className="chip" style={hex ? { background: wash(hex), color: tintInk(hex), borderColor: edge(hex) } : undefined}>
                  {c}
                </span>
              )
            })}
          </span>
        </div>
      )
    case 'pictos':
      // A routine's step pictos: each card shows its parent-set photo when there is
      // one, else its emoji — the SAME photo-wins rule the Routines grid + kid run
      // use, so the peek never disagrees with them (feature #17 C).
      return (
        <div className="detail-sheet__chips">
          {block.label && <span className="detail-sheet__blocklabel mono">{block.label}</span>}
          <span className="detail-sheet__chiprow">
            {block.items.map((it, i) => (
              <span key={i} className={'detail-sheet__picto' + (it.photo ? ' detail-sheet__picto--photo' : '')}>
                {it.photo ? <img src={it.photo} alt="" loading="lazy" /> : <span>{it.emoji || '○'}</span>}
              </span>
            ))}
          </span>
        </div>
      )
    case 'list':
      return (
        <div className="detail-sheet__listwrap">
          {block.label && <span className="detail-sheet__blocklabel mono">{block.label}</span>}
          <ul className="detail-sheet__list">
            {block.items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        </div>
      )
    case 'image':
      return <ZoomableImg src={block.src} alt={block.alt ?? ''} className="detail-sheet__img" />
    case 'audio':
      // eslint-disable-next-line jsx-a11y/media-has-caption -- a personal memo, no caption track
      return <audio className="detail-sheet__audio" controls src={block.src} />
    case 'togglechips':
      return <ToggleChips block={block} />
  }
}

// Tappable membership chips (a person's named groups): toggles optimistically and
// fires onToggle to persist. Stays interactive while the peek is open; on reopen it
// reflects the refetched truth.
function ToggleChips({ block }: { block: Extract<DetailBlock, { kind: 'togglechips' }> }) {
  const [on, setOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(block.options.map((o) => [o.id, o.on])),
  )
  return (
    <div className="detail-sheet__chips">
      {block.label && <span className="detail-sheet__blocklabel mono">{block.label}</span>}
      <span className="detail-sheet__chiprow">
        {block.options.map((o) => {
          const active = on[o.id]
          return (
            <button
              key={o.id}
              type="button"
              className={'chip chip--toggle' + (active ? ' is-on' : '')}
              aria-pressed={active}
              onClick={() => {
                const next = !active
                setOn((s) => ({ ...s, [o.id]: next }))
                block.onToggle(o.id, next)
              }}
            >
              <Icon name={active ? 'check-bold' : 'plus-bold'} size={11} /> {o.label}
            </button>
          )
        })}
      </span>
    </div>
  )
}
