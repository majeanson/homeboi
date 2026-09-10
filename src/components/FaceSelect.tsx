import { useState } from 'react'
import { Icon } from './Icon'
import { FaceSheet } from './FaceSheet'
import { type MemberFace } from './MemberSwitcher'

// The COLLAPSED "pick-a-face" control — a small chip showing the current face that
// opens the shared face sheet (`FaceSheet`) on tap. It's the same tap-to-select
// behaviour as the board's "Aujourd'hui" header on mobile (the profile chip +
// ProfilePicker sheet), but CONTROLLED + identity-agnostic: callers pass `faces` +
// `value`/`onChange`, so a surface can drive its OWN local pick (Le cercle's focus
// lens, the Notes "whose notes" face) instead of the device profile.
//
// Pairs with MemberSwitcher (the always-in-view face ROW): use the row on a kiosk
// wall where space is cheap and a glanceable switch helps, and this chip on mobile
// where the row would crowd the page — mirroring how the board picks between them.
// Reuses the .profile-chip chrome (styles/profile.css); the sheet body itself lives
// in FaceSheet, shared with ProfilePicker (it was copied into both until 2026-09-09).
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
  // Any face (other than the one shown on the chip) carrying a presence dot → mark the
  // collapsed chip too, so a waiting mot is discoverable without opening the sheet.
  const anyDot = faces.some((f) => f.dot && f.id !== value)

  return (
    <>
      <button type="button" className="profile-chip profile-chip--labeled" onClick={() => setOpen(true)} aria-label={ariaLabel}>
        {sel ? (
          <span className="profile-chip__av" style={{ background: sel.photoUrl ? undefined : (sel.colour ?? undefined) }}>
            {sel.photoUrl ? <img src={sel.photoUrl} alt="" /> : (sel.name?.[0] ?? '?').toUpperCase()}
          </span>
        ) : (
          <span className="profile-chip__av profile-chip__av--all" aria-hidden="true">
            <Icon name="users-three-bold" size={18} />
          </span>
        )}
        {anyDot && <span className="face-dot" aria-hidden="true" />}
        <span className="profile-chip__name">{sel ? sel.name : allLabel}</span>
        <Icon name="caret-down-bold" size={12} />
      </button>

      <FaceSheet
        open={open}
        onClose={() => setOpen(false)}
        faces={faces}
        value={value}
        onChange={onChange}
        allLabel={allLabel}
        ariaLabel={ariaLabel}
        title={title}
      />
    </>
  )
}
