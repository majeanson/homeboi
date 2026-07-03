import { useT } from '../i18n'
import { Icon } from './Icon'

// The terminal state for a guest scene whose share link 401/403'd — expired or
// revoked. Deliberately DISTINCT from EmptyState: a relative landing on a dead
// « Gardienne » / « Accueil » / « Fenêtre » link must see "ce lien ne fonctionne
// plus", not a blank "rien à afficher" that reads like an empty household. Used by
// HandoffPage / WelcomePage / FamilyWindowPage when their window query errors.
export function GuestExpired() {
  const t = useT()
  return (
    <div className="guest-expired" role="status">
      <Icon name="link-bold" size={40} />
      <h3 className="guest-expired__title">{t.shareMode.expiredTitle}</h3>
      <p className="guest-expired__lead">{t.shareMode.expiredLead}</p>
    </div>
  )
}
