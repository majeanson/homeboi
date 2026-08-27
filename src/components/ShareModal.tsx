import { useEffect, useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { Modal } from './Modal'
import { QrCode } from './QrCode'
import { Icon } from './Icon'
import { StatusMessage } from './StatusMessage'

// The ONE share sheet. Factors the identical link-block anatomy the family + voyage
// share modals hand-rolled (Modal shell → intro → error → the `.sharesheet__link`
// block: a read-only input.mono, a copy button that flips link→check, an optional
// « Partager via… » system-share button, a scannable QR) so every "share this" surface
// looks + behaves the same. It owns the mint/copy/reset state; the caller supplies:
//   - onCreate()  → mints the link (POST /api/share, /api/shared-trip-invite, …) and
//                   returns its URL (+ an optional notice, e.g. "shared N of M people").
//   - children    → whatever sits BELOW the link (a member roster, a revoke ledger). A
//                   render-fn variant receives { clearLink } so a « Réinitialiser le
//                   lien » control can drop the now-dead URL.
// autoCreate mints on open (for a one-tap « Partager » where the intent is already
// clear); otherwise the sheet shows a « Créer le lien » button first.
//
// This is the PRESENTATION seam only: a live-synced share (Voyage) swaps just onCreate,
// never its DO/membership model. New shareable entities reuse this, not a fresh copy.
export function ShareModal({
  open,
  onClose,
  title,
  intro,
  onCreate,
  autoCreate = false,
  createLabel,
  creatingLabel,
  scanHint,
  linkHint,
  children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  intro?: ReactNode
  onCreate: () => Promise<{ url: string; notice?: ReactNode }>
  autoCreate?: boolean
  createLabel?: string
  creatingLabel?: string
  scanHint?: string
  linkHint?: ReactNode
  children?: ReactNode | ((helpers: { clearLink: () => void }) => ReactNode)
}) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [notice, setNotice] = useState<ReactNode | null>(null)
  const [copied, setCopied] = useState(false)

  async function create() {
    setBusy(true)
    setErr(null)
    try {
      const res = await onCreate()
      setUrl(res.url)
      setNotice(res.notice ?? null)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Reset every time the sheet closes; auto-mint on open when asked. Keyed on `open`
  // only — create() reads fresh state each call, so it needn't be a dependency.
  useEffect(() => {
    if (!open) {
      setBusy(false)
      setErr(null)
      setUrl(null)
      setNotice(null)
      setCopied(false)
      return
    }
    if (autoCreate) void create()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

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

  function systemShare() {
    if (!url || typeof navigator === 'undefined' || !navigator.share) return
    void navigator.share({ url }).catch(() => {
      /* user dismissed the share sheet — nothing to do */
    })
  }

  const canSystemShare = typeof navigator !== 'undefined' && !!navigator.share
  const clearLink = () => {
    setUrl(null)
    setNotice(null)
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="sharesheet">
        {intro && <p className="operator__hint mono">{intro}</p>}
        {err && <StatusMessage tone="error">{err}</StatusMessage>}
        {notice && <StatusMessage tone="info">{notice}</StatusMessage>}

        {url ? (
          <div className="sharesheet__link">
            <input
              className="input mono"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label={t.shareLink.copyLink}
            />
            <div className="sharesheet__linkbtns">
              <button type="button" className="btn btn--sm btn--primary" onClick={() => void copy()}>
                <Icon name={copied ? 'check-bold' : 'link-bold'} size={15} /> {copied ? t.shareLink.copied : t.shareLink.copyLink}
              </button>
              {canSystemShare && (
                <button type="button" className="btn btn--sm btn--ghost" onClick={systemShare}>
                  <Icon name="arrow-up-right-bold" size={15} /> {t.shareLink.shareVia}
                </button>
              )}
            </div>
            <p className="operator__hint mono">{scanHint ?? t.shareLink.scanHint}</p>
            <QrCode value={url} />
            {linkHint && <p className="operator__hint mono">{linkHint}</p>}
          </div>
        ) : (
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void create()}>
            <Icon name="link-bold" size={16} /> {busy ? creatingLabel ?? t.shareLink.creating : createLabel ?? t.shareLink.createLink}
          </button>
        )}
      </div>

      {typeof children === 'function' ? children({ clearLink }) : children}
    </Modal>
  )
}
