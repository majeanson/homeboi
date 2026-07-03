import { useState } from 'react'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { useConfirm } from '../../lib/confirm'
import { TRIPS_KEY, BOARD_KEY, MONTH_KEY, SHARED_TRIPS_KEY } from '../../lib/queryKeys'
import { Modal } from '../Modal'
import { QrCode } from '../QrCode'
import { Icon } from '../Icon'
import { Avatar } from '../Avatar'
import { StatusMessage } from '../StatusMessage'
import { type SharedTrip } from './voyage'

// « Voyage partagé » → « Inviter » — the share sheet. Mirrors FamilyShareModal but for a
// LIVE-synced trip: it mints an invite link (POST /api/shared-trip-invite → a signed
// capability token baked with the trip's invite_nonce), shows the URL + a scannable QR,
// lists the member households with their roles, and carries the trip-membership
// lifecycle: « Réinitialiser le lien » (owner rotates the nonce → old links die),
// « Quitter le voyage » (a member drops out, optionally keeping a private copy), and
// « Dissoudre » (the owner tears the whole trip down). All destructive entries confirm.
export function VoyageShareModal({
  open,
  onClose,
  trip,
  myHouseholdId,
  onGone,
}: {
  open: boolean
  onClose: () => void
  trip: SharedTrip
  myHouseholdId: string
  // Called after the actor leaves or the owner dissolves — the page navigates away.
  onGone: () => void
}) {
  const t = useT()
  const write = useWrite()
  const confirm = useConfirm()
  const isOwner = trip.myRole === 'owner'

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [keepCopy, setKeepCopy] = useState(false)

  async function createLink() {
    setBusy(true)
    setErr(null)
    try {
      const res = await api<{ url: string }>('shared-trip-invite', { method: 'POST', body: { sharedTripId: trip.id } })
      setUrl(res.url)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — the link text is shown for manual copy */
    }
  }

  async function resetLink() {
    if (!(await confirm({ message: t.sharedVoyage.resetLinkConfirm, confirmLabel: t.sharedVoyage.resetLink, tone: 'danger' })))
      return
    try {
      await api('shared-trip-invite', { method: 'DELETE', body: { sharedTripId: trip.id } })
      setUrl(null) // the shown link is now dead — hide it
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function leave() {
    if (!(await confirm({ message: t.sharedVoyage.leaveConfirm, confirmLabel: t.sharedVoyage.leave, tone: 'danger' }))) return
    try {
      await write('shared-trip-leave', {
        method: 'POST',
        body: { sharedTripId: trip.id, keepCopy },
        // keepCopy exports a private trip → refresh the household trip surfaces too.
        affectedKeys: [SHARED_TRIPS_KEY, TRIPS_KEY, BOARD_KEY, MONTH_KEY],
      })
      onGone()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function dissolve() {
    if (!(await confirm({ message: t.sharedVoyage.dissolveConfirm, confirmLabel: t.sharedVoyage.dissolve, tone: 'danger' })))
      return
    try {
      await write('shared-trip', {
        method: 'DELETE',
        body: { id: trip.id },
        affectedKeys: [SHARED_TRIPS_KEY, TRIPS_KEY, BOARD_KEY, MONTH_KEY],
      })
      onGone()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t.sharedVoyage.shareTitle}>
      <div className="cercle-share">
        <p className="operator__hint mono">{t.sharedVoyage.shareIntro}</p>
        {err && <StatusMessage tone="error">{err}</StatusMessage>}

        {url ? (
          <div className="cercle-share__link">
            <input
              className="input mono"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label={t.sharedVoyage.copyLink}
            />
            <button type="button" className="btn btn--sm btn--primary" onClick={() => void copy()}>
              <Icon name={copied ? 'check-bold' : 'link-bold'} size={15} /> {copied ? t.sharedVoyage.copied : t.sharedVoyage.copyLink}
            </button>
            <p className="operator__hint mono">{t.sharedVoyage.scanHint}</p>
            <QrCode value={url} />
            <p className="operator__hint mono">{t.sharedVoyage.linkHint}</p>
          </div>
        ) : (
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void createLink()}>
            <Icon name="link-bold" size={16} /> {busy ? t.sharedVoyage.creating : t.sharedVoyage.createLink}
          </button>
        )}
      </div>

      {/* The households on the trip + their roles. */}
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

        {isOwner ? (
          <div className="voyage-share__actions">
            <button type="button" className="btn btn--ghost mono" onClick={() => void resetLink()}>
              <Icon name="arrow-counter-clockwise-bold" size={15} /> {t.sharedVoyage.resetLink}
            </button>
            <button type="button" className="btn btn--ghost voyage-form__delete" onClick={() => void dissolve()}>
              <Icon name="trash-bold" size={15} /> {t.sharedVoyage.dissolve}
            </button>
          </div>
        ) : (
          <div className="voyage-share__actions">
            <label className="voyage-share__keep mono">
              <input type="checkbox" checked={keepCopy} onChange={(e) => setKeepCopy(e.target.checked)} />{' '}
              {t.sharedVoyage.keepCopy}
            </label>
            <button type="button" className="btn btn--ghost voyage-form__delete" onClick={() => void leave()}>
              <Icon name="door-bold" size={15} /> {t.sharedVoyage.leave}
            </button>
          </div>
        )}
      </section>
    </Modal>
  )
}
