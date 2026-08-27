import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { useConfirm } from '../../lib/confirm'
import { Modal } from '../Modal'
import { QrCode } from '../QrCode'
import { Icon } from '../Icon'
import { StatusMessage } from '../StatusMessage'
import { EmptyState } from '../EmptyState'
import type { IntakeSubmission } from '../../lib/intake'

// « Partager une famille » — the SENDER's share sheet. Given a MATERIALIZED family
// (label + IntakeSubmission snapshot, built by lib/cercleShare.familyToShare), it POSTs
// /api/family-share to mint an unguessable share link, then shows the URL + a scannable
// QR (reusing QrCode). It also lists this household's active shares so the operator can
// REVOKE one (DELETE) — the same manage-and-revoke shape as the guest-links ledger.
//
// The recipient opens the link on their OWN account and merges the family into their
// cercle (src/pages/FamilyImportPage.tsx). A share is a one-time copy, expiring on its
// own; nothing is shared live.

const SHARES_KEY = ['family-shares'] as const

export function FamilyShareModal({
  open,
  onClose,
  family,
}: {
  open: boolean
  onClose: () => void
  // The family to share (its display name + materialized snapshot). null → just manage.
  family: { label: string; payload: IntakeSubmission } | null
}) {
  const t = useT()
  const qc = useQueryClient()
  const confirm = useConfirm()

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Set when the family was bigger than the share ceiling and got clipped — so we can
  // say "shared N of M" instead of dropping people silently.
  const [trunc, setTrunc] = useState<{ shared: number; total: number } | null>(null)

  const { data } = useQuery({
    queryKey: SHARES_KEY,
    queryFn: () => api<{ shares: { id: string; label: string; createdAt: number; expiresAt: number | null }[] }>('family-share'),
    enabled: open,
  })
  const shares = data?.shares ?? []

  function reset() {
    setUrl(null)
    setErr(null)
    setCopied(false)
    setTrunc(null)
  }

  async function createLink() {
    if (!family) return
    setBusy(true)
    setErr(null)
    try {
      const res = await api<{ url: string; sharedPeople: number; totalPeople: number }>('family-share', {
        method: 'POST',
        body: { label: family.label, payload: family.payload },
      })
      setUrl(res.url)
      setTrunc(res.sharedPeople < res.totalPeople ? { shared: res.sharedPeople, total: res.totalPeople } : null)
      qc.invalidateQueries({ queryKey: SHARES_KEY })
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

  async function revoke(id: string) {
    if (!(await confirm({ message: t.familyShare.revokeConfirm, confirmLabel: t.familyShare.revoke, tone: 'danger' }))) return
    await api('family-share', { method: 'DELETE', body: { id } })
    qc.invalidateQueries({ queryKey: SHARES_KEY })
  }

  const peopleCount = family ? 1 + family.payload.household.length : 0

  return (
    <Modal
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title={t.familyShare.shareTitle}
    >
      {family && (
        <div className="sharesheet">
          <p className="operator__hint mono">{t.familyShare.shareIntro}</p>
          <p className="mono">
            {family.label ? `${family.label} · ` : ''}
            {t.familyShare.peopleN(peopleCount)}
            {family.payload.pets.length > 0 ? ` · ${family.payload.pets.length} 🐾` : ''}
          </p>
          {err && <StatusMessage tone="error">{err}</StatusMessage>}

          {trunc && <StatusMessage tone="info">{t.familyShare.truncated(trunc.shared, trunc.total)}</StatusMessage>}

          {url ? (
            <div className="sharesheet__link">
              <input className="input mono" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label={t.familyShare.copyLink} />
              <button type="button" className="btn btn--sm btn--primary" onClick={() => void copy()}>
                <Icon name={copied ? 'check-bold' : 'link-bold'} size={15} /> {copied ? t.familyShare.copied : t.familyShare.copyLink}
              </button>
              <p className="operator__hint mono">{t.familyShare.scanHint}</p>
              <QrCode value={url} />
            </div>
          ) : (
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void createLink()}>
              <Icon name="link-bold" size={16} /> {busy ? t.familyShare.creating : t.familyShare.createLink}
            </button>
          )}
        </div>
      )}

      {/* Active shares — revoke any early. */}
      <section className="sharesheet__list">
        <h3 className="sharesheet__title">{t.familyShare.activeShares}</h3>
        {shares.length === 0 ? (
          <EmptyState>{t.familyShare.noShares}</EmptyState>
        ) : (
          <ul className="review__list">
            {shares.map((s) => (
              <li key={s.id} className="sharesheet__row">
                <span className="review__name">{s.label || t.familyShare.importTitle}</span>
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => void revoke(s.id)}>
                  <Icon name="trash-bold" size={15} /> {t.familyShare.revoke}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="operator__hint mono">{t.familyShare.sharesHint}</p>
      </section>
    </Modal>
  )
}
