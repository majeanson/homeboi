import { Icon } from './Icon'
import { Sheet } from './Sheet'
import { type MemberFace } from '../lib/faces'

// THE "pick a face" bottom sheet — the grid of household faces plus the neutral
// « tout le monde » tile, in one place.
//
// It was two places until 2026-09-09. `FaceSelect` (the collapsed chip) and
// `ProfilePicker` (the board's « Qui es-tu ? » on mobile) each carried their own copy
// of this body: the same `Sheet`, the same `.profile-faces` grid, the same
// photo-or-initial disc, the same boolean presence dot, the same trailing everyone
// tile, and the same 250 ms delay before closing — FaceSelect's copy even said
// « mirrors ProfilePicker » in a comment, which is a fork admitting what it is. The
// two had already drifted once in a way nobody would have caught by looking: only the
// chip marked itself when a face OTHER than the shown one carried a waiting-mot dot.
//
// Same shape as the `MemberSwitcher` fork found the same day (the parity audit): a
// controlled primitive, plus a device-profile-bound sibling that RE-IMPLEMENTED it
// instead of wrapping it. The fix is the same — extract the body, and let the bound
// one be a thin wrapper that supplies `faces`/`value`/`onChange`.
//
// The DOM and class names are unchanged on purpose (`.profile-faces`,
// `.profile-face`, `.profile-face__av`, `.face-dot`): `styles/profile.css` and the
// e2e selectors both address them, and this refactor is not the place to move them.
export function FaceSheet({
  open,
  onClose,
  faces,
  value,
  onChange,
  allLabel,
  ariaLabel,
  title,
}: {
  open: boolean
  onClose: () => void
  faces: MemberFace[]
  /** Selected member id, or null = the neutral "everyone" / Maisonnée option. */
  value: string | null
  onChange: (id: string | null) => void
  allLabel: string
  ariaLabel: string
  /** Sheet heading; defaults to `ariaLabel`. */
  title?: string
}) {
  // Let the picked face show its selected state for a beat before the sheet slides
  // away — an instant close reads as "did that even register?".
  function pick(id: string | null) {
    onChange(id)
    window.setTimeout(onClose, 250)
  }

  return (
    <Sheet open={open} onClose={onClose} ariaLabel={ariaLabel} showClose={false}>
      <h3>{title ?? ariaLabel}</h3>
      <div className="profile-faces">
        {faces.map((f) => {
          const sel = f.id === value
          return (
            <button
              key={f.id}
              type="button"
              className={'profile-face' + (sel ? ' is-sel' : '')}
              onClick={() => pick(f.id)}
              aria-pressed={sel}
            >
              <span className="profile-face__av" style={{ background: f.photoUrl ? undefined : (f.colour ?? undefined) }}>
                {f.photoUrl ? <img src={f.photoUrl} alt="" /> : (f.name?.[0] ?? '?').toUpperCase()}
              </span>
              {f.dot && <span className="face-dot" aria-hidden="true" />}
              <span className="profile-face__name">{f.name}</span>
            </button>
          )
        })}
        <button
          type="button"
          className={'profile-face' + (value === null ? ' is-sel' : '')}
          onClick={() => pick(null)}
          aria-pressed={value === null}
        >
          <span className="profile-face__av profile-face__av--all" aria-hidden="true">
            <Icon name="users-three-bold" size={24} />
          </span>
          <span className="profile-face__name">{allLabel}</span>
        </button>
      </div>
    </Sheet>
  )
}
