import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { useConfirm } from '../../lib/confirm'
import { ShareModal } from '../ShareModal'
import { Icon } from '../Icon'
import { Avatar } from '../Avatar'
import { type SharedTrip } from './voyage'

// « Voyage partagé » → the invite sheet (opened from the « Partagé » header chip or the
// foot « Inviter »). Now a thin wrapper over the generic ShareModal: it supplies the
// invite-mint (POST /api/shared-trip-invite → a signed capability token baked with the
// trip's invite_nonce) and, below the link, the member-household roster + the owner's
// « Réinitialiser le lien » (rotates the nonce → old links die).
//
// ShareModal is the PRESENTATION seam only — this is a LIVE-synced share, but generalizing
// that would swap only `onCreate` (mint) and the store behind it, never the DO/membership
// model. Membership lifecycle (leave / dissolve) deliberately does NOT live here — it sits
// in the SharedVoyagePage foot, always visible: the way out must never hide behind « Inviter ».
export function VoyageShareModal({
  open,
  onClose,
  trip,
  myHouseholdId,
}: {
  open: boolean
  onClose: () => void
  trip: SharedTrip
  myHouseholdId: string
}) {
  const t = useT()
  const confirm = useConfirm()
  const isOwner = trip.myRole === 'owner'

  return (
    <ShareModal
      open={open}
      onClose={onClose}
      title={t.sharedVoyage.shareTitle}
      intro={t.sharedVoyage.shareIntro}
      createLabel={t.sharedVoyage.createLink}
      creatingLabel={t.sharedVoyage.creating}
      linkHint={t.sharedVoyage.linkHint}
      onCreate={async () => {
        const res = await api<{ url: string }>('shared-trip-invite', { method: 'POST', body: { sharedTripId: trip.id } })
        return { url: res.url }
      }}
    >
      {({ clearLink }) => (
        <section className="cercle-share__list">
          <h3 className="cercle-share__title">{t.sharedVoyage.households}</h3>
          <ul className="review__list">
            {trip.members.map((m) => (
              <li key={m.household_id} className="cercle-share__row">
                <Avatar kind={null} colour={m.colour} name={m.label} size={24} />
                <span className="review__name">
                  {m.label}
                  {m.household_id === myHouseholdId ? ` (${t.sharedVoyage.you})` : ''}
                </span>
                <span className="review__sub mono">
                  {m.role === 'owner' ? t.sharedVoyage.roleOwner : t.sharedVoyage.roleMember}
                </span>
              </li>
            ))}
          </ul>

          {isOwner && (
            <div className="voyage-share__actions">
              <button
                type="button"
                className="btn btn--ghost mono"
                onClick={async () => {
                  if (!(await confirm({ message: t.sharedVoyage.resetLinkConfirm, confirmLabel: t.sharedVoyage.resetLink, tone: 'danger' })))
                    return
                  await api('shared-trip-invite', { method: 'DELETE', body: { sharedTripId: trip.id } })
                  clearLink() // the shown link is now dead — drop it
                }}
              >
                <Icon name="arrow-counter-clockwise-bold" size={15} /> {t.sharedVoyage.resetLink}
              </button>
            </div>
          )}
        </section>
      )}
    </ShareModal>
  )
}
