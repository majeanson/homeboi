import type { MouseEventHandler } from 'react'
import { Icon, type IconName } from './Icon'

// THE icon-only button (solidify 2.5, 2026-11-05). A ✕, a ＋, a −, a 🔍, a ← — a button
// whose whole content is one glyph — was spelled 146 ways: thirty on the `.btn` family
// with five different class orders, two with no accessible name at all (the family
// builder's ＋), the rest as bespoke close/dismiss/back/reduce classes that each
// re-declared the same 44px box. This is the one shape:
//
//   <IconButton icon="x-bold" label={t.common.close} onClick={close} />
//
// · `label` IS the accessible name (aria-label) and the hover title — required, so a
//   glyph alone can never ship nameless again (`icon-button-rule.test.ts` fails a
//   `<button>` whose only child is an <Icon> with no aria-label, and ratchets the
//   hand-spelled ones down).
// · `variant`: `ghost` (the default — a quiet bordered disc, the scene head's ✕),
//   `solid` (the card-coloured disc, a submit), `bare` (no border, no background —
//   the modal's corner ✕, where a border would fight the card's).
// · `size`: `md` = the 44px touch target, `sm` = 38px (a row's furniture).
// · `className` keeps the host's POSITION class (`kit-modal__close`, `sheet__close`,
//   `scene__head-back`) — those rules hold placement only now; the box is here.
export function IconButton({
  icon,
  label,
  onClick,
  variant = 'ghost',
  size = 'md',
  tone,
  iconSize,
  className,
  disabled,
  type = 'button',
  title,
  pressed,
}: {
  icon: IconName
  /** The accessible name — and the hover title unless `title` says otherwise. */
  label: string
  onClick?: MouseEventHandler<HTMLButtonElement>
  variant?: 'ghost' | 'solid' | 'bare'
  size?: 'md' | 'sm'
  tone?: 'danger'
  /** The glyph's pixel size; defaults follow `size` (18 / 14). */
  iconSize?: number
  className?: string
  disabled?: boolean
  type?: 'button' | 'submit'
  /** `null` = no hover title (a toggle whose label already changes). */
  title?: string | null
  /** A TOGGLE: exposes aria-pressed and the `is-on` state class. */
  pressed?: boolean
}) {
  return (
    <button
      type={type}
      className={
        'btn btn--icon' +
        (variant === 'ghost' ? ' btn--ghost' : variant === 'bare' ? ' btn--bare' : '') +
        (size === 'sm' ? ' btn--sm' : '') +
        (tone === 'danger' ? ' btn--danger' : '') +
        (pressed ? ' is-on' : '') +
        (className ? ' ' + className : '')
      }
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={title === null ? undefined : (title ?? label)}
    >
      <Icon name={icon} size={iconSize ?? (size === 'sm' ? 14 : 18)} />
    </button>
  )
}
