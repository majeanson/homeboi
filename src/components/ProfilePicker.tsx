import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { useProfile } from '../lib/profile'
import { imgUrl } from '../lib/image'
import { useModal } from '../lib/useModal'
import { useSwipeToDismiss } from '../lib/useSwipeToDismiss'

// "Qui es-tu ?" — pick-your-face. A bottom sheet of the household's members (the
// same faces as the toddler routine picker), so a phone knows who's holding it.
// Reuses the shared .sheet/.scrim chrome (see AddSheet). Selecting sets the
// device profile (lib/profile); "tout le monde" clears it.
interface Member {
  id: string
  display_name: string
  avatar_kind: string
  avatar_ref: string
  colour: string
}

export function ProfilePicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const { memberId, setMemberId } = useProfile()
  const { data } = useQuery({ queryKey: ['members'], queryFn: () => api<{ members: Member[] }>('members'), enabled: open })
  const members = data?.members ?? []

  const sheetRef = useRef<HTMLDivElement>(null)
  useModal(sheetRef, onClose, { open })
  useSwipeToDismiss(sheetRef, onClose, { open })

  function pick(id: string | null) {
    setMemberId(id)
    // Let the picked face show its selected state for a beat before the sheet
    // slides away — an instant close reads as "did that even register?".
    window.setTimeout(onClose, 250)
  }

  return (
    <>
      <div className={'scrim' + (open ? ' show' : '')} onClick={onClose} aria-hidden="true" />
      <div ref={sheetRef} className={'sheet' + (open ? ' show' : '')} role="dialog" aria-modal="true" aria-label={t.profile.who}>
        <div className="grab" aria-hidden="true" />
        <h3>{t.profile.who}</h3>
        <div className="profile-faces">
          {members.map((m) => {
            const photo = m.avatar_kind === 'photo' && m.avatar_ref ? imgUrl(m.avatar_ref) : null
            const sel = m.id === memberId
            return (
              <button
                key={m.id}
                type="button"
                className={'profile-face' + (sel ? ' is-sel' : '')}
                onClick={() => pick(m.id)}
                aria-pressed={sel}
              >
                <span className="profile-face__av" style={{ background: photo ? undefined : m.colour }}>
                  {photo ? <img src={photo} alt="" /> : (m.display_name[0] ?? '?').toUpperCase()}
                </span>
                <span className="profile-face__name">{m.display_name}</span>
              </button>
            )
          })}
          <button
            type="button"
            className={'profile-face' + (memberId === null ? ' is-sel' : '')}
            onClick={() => pick(null)}
            aria-pressed={memberId === null}
          >
            <span className="profile-face__av profile-face__av--all" aria-hidden="true">
              👥
            </span>
            <span className="profile-face__name">{t.profile.household}</span>
          </button>
        </div>
      </div>
    </>
  )
}
