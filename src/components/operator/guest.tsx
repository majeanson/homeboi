import { useState } from 'react'
import { useT } from '../../i18n'
import { HelpTitle, type HelpMode } from '../../lib/helpMode'
import { api } from '../../lib/api'
import { isGuest } from '../../lib/device'
import { InlineIcon } from '../Icon'

// Babysitter / guest access. The operator picks how long the access lasts and
// generates a time-boxed, READ-ONLY token. We hand back a share link
// (?guest=<token>) the babysitter opens once — main.tsx stashes the token and
// strips it from the URL. The token is stateless: it just stops working at its
// TTL. There is NO revoke-before-expiry (keep TTLs short) — see auth.ts.
const TTL_OPTIONS = [
  { seconds: 1800, key: 'ttl30m' as const },
  { seconds: 3600, key: 'ttl1h' as const },
  { seconds: 4 * 3600, key: 'ttl4h' as const },
  { seconds: 12 * 3600, key: 'ttl12h' as const },
  { seconds: 24 * 3600, key: 'ttl24h' as const },
]

export function GuestSection({ help }: { help?: HelpMode }) {
  const t = useT()
  // Issuing a guest token is operator-only — a read-only guest can't mint more
  // guests, so the whole section is hidden for them.
  const ro = isGuest()
  const [ttl, setTtl] = useState(3600)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function generate() {
    if (busy) return
    setBusy(true)
    setErr(null)
    setCopied(false)
    try {
      const res = await api<{ guestToken: string }>('guest/start', {
        method: 'POST',
        body: { ttlSeconds: ttl },
      })
      // The link the babysitter opens. ?guest= boots a read-only session.
      setLink(`${window.location.origin}/board?guest=${encodeURIComponent(res.guestToken)}`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      /* clipboard blocked — the link is shown for manual copy */
    }
  }

  async function share() {
    if (!link || !navigator.share) return
    try {
      await navigator.share({ title: t.guest.title, url: link })
    } catch {
      /* user dismissed the share sheet — nothing to do */
    }
  }

  if (ro) return null

  return (
    <section className="surface operator__section">
      <HelpTitle help={help} k="guest">{t.guest.title}</HelpTitle>
      {help?.bubbleFor('guest')}

      <label className="operator__seg">
        <span className="operator__seg-label mono">{t.guest.ttlLabel}</span>
        <select className="input" value={ttl} onChange={(e) => setTtl(Number(e.target.value))} disabled={busy}>
          {TTL_OPTIONS.map((o) => (
            <option key={o.seconds} value={o.seconds}>
              {t.guest[o.key]}
            </option>
          ))}
        </select>
      </label>

      <button type="button" className="btn btn--primary" onClick={generate} disabled={busy}>
        <InlineIcon name="key-bold" /> {busy ? t.guest.generating : t.guest.generate}
      </button>

      {err && <p className="error mono">{err}</p>}

      {link && (
        <div className="operator__guest-link">
          <p className="operator__hint mono">{t.guest.linkReady}</p>
          <input className="input mono" readOnly value={link} onFocus={(e) => e.target.select()} aria-label={t.guest.title} />
          <div className="operator__inline-form">
            <button type="button" className="btn" onClick={copy}>
              <InlineIcon name="link-bold" /> {copied ? t.guest.copied : t.guest.copy}
            </button>
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button type="button" className="btn" onClick={share}>
                <InlineIcon name="arrow-right-bold" /> {t.guest.share}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
