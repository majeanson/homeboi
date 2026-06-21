import { useState } from 'react'
import { Icon } from './Icon'
import { Sheet } from './Sheet'
import { type MemberFace } from './MemberSwitcher'

// The COLLAPSED "pick-a-face" control — a small chip showing the current face that
// opens a bottom sheet of the household's faces on tap. It's the same tap-to-select
// behaviour as the board's "Aujourd'hui" header on mobile (the profile chip +
// ProfilePicker sheet), but CONTROLLED + identity-agnostic: callers pass `faces` +
// `value`/`onChange`, so a surface can drive its OWN local pick (Le cercle's focus
// lens, the Notes "whose notes" face) instead of the device profile.
//
// Pairs with MemberSwitcher (the always-in-view face ROW): use the row on a kiosk
// wall where space is cheap and a glanceable switch helps, and this chip on mobile
// where the row would crowd the page — mirroring how the board picks between them.
// Reuses the .profile-chip / .profile-faces / .profile-face chrome (styles/profile.css).

export function FaceSelect({
  faces,
  value,
  onChange,
  allLabel,
  ariaLabel,
  title,
}: {
  faces: MemberFace[]
  // Selected member id, or null = the "everyone" / Maisonnée option.
  value: string | null
  onChange: (id: string | null) => void
  // Label for the neutral "everyone" option (also the chip text at that state).
  allLabel: string
  ariaLabel: string
  // Sheet heading; defaults to ariaLabel.
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const sel = faces.find((f) => f.id === value) ?? null

  function pick(id: string | null) {
    onChange(id)
    // Let the picked face show its selected state for a beat before the sheet slides
    // away — an instant close reads as "did that even register?" (mirrors ProfilePicker).
    window.setTimeout(() => setOpen(false), 250)
  }

  return (
    <>
      <button type="button" className="profile-chip profile-chip--labeled" onClick={() => setOpen(true)} aria-label={ariaLabel}>
        {sel ? (
          <span className="profile-chip__av" style={{ background: sel.photoUrl ? undefined : sel.colour ?? undefined }}>
            {sel.photoUrl ? <img src={sel.photoUrl} alt="" /> : (sel.name?.[0] ?? '?').toUpperCase()}
          </span>
        ) : (
          <span className="profile-chip__av profile-chip__av--all" aria-hidden="true">
            <Icon name="users-three-bold" size={18} />
          </span>
        )}
        <span className="profile-chip__name">{sel ? sel.name : allLabel}</span>
        <Icon name="caret-down-bold" size={12} />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} ariaLabel={ariaLabel} showClose={false}>
        <h3>{title ?? ariaLabel}</h3>
        <div className="profile-faces">
          {faces.map((f) => {
            const s = f.id === value
            return (
              <button
                key={f.id}
                type="button"
                className={'profile-face' + (s ? ' is-sel' : '')}
                onClick={() => pick(f.id)}
                aria-pressed={s}
              >
                <span className="profile-face__av" style={{ background: f.photoUrl ? undefined : f.colour ?? undefined }}>
                  {f.photoUrl ? <img src={f.photoUrl} alt="" /> : (f.name?.[0] ?? '?').toUpperCase()}
                </span>
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
    </>
  )
}
