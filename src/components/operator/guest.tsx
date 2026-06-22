import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { api } from '../../lib/api'
import { isGuest, type GuestKind } from '../../lib/device'
import { InlineIcon } from '../Icon'
import { StatusMessage } from '../StatusMessage'
import { QrCode } from '../QrCode'

// Typed read-only share links. The operator picks a KIND (what the link can see)
// and a duration, and gets a time-boxed token (?guest=<token>). The link lands on
// the right surface per kind — main.tsx stashes the token and strips it from the
// URL. The token is stateless: it just stops working at its TTL, no revoke-before
// (keep durations short) — see functions/_lib/auth.ts GuestKind + guest/start.ts.
//
//   showcase → the full read-only hub (a "Démo" link of your real data)
//   sitter   → /handoff, the babysitter card (today + routines + à-savoir + wifi)
//   welcome  → /welcome, the visitor card (wifi + bin day + house rules)
//   family   → /family, the grandparents' window (kids' dates + birthdays + photos)
type KindLabelKey = 'kindShowcase' | 'kindSitter' | 'kindWelcome' | 'kindFamily'
type KindHintKey = 'kindShowcaseHint' | 'kindSitterHint' | 'kindWelcomeHint' | 'kindFamilyHint'
const KINDS: { kind: GuestKind; path: string; labelKey: KindLabelKey; hintKey: KindHintKey }[] = [
  { kind: 'showcase', path: '/board', labelKey: 'kindShowcase', hintKey: 'kindShowcaseHint' },
  { kind: 'sitter', path: '/handoff', labelKey: 'kindSitter', hintKey: 'kindSitterHint' },
  { kind: 'welcome', path: '/welcome', labelKey: 'kindWelcome', hintKey: 'kindWelcomeHint' },
  { kind: 'family', path: '/family', labelKey: 'kindFamily', hintKey: 'kindFamilyHint' },
]

// Per-kind duration menu (mirrors the server clamp in _lib/shareModes). showcase can
// run up to a week (a Démo link to paste somewhere); the curated kinds stay short.
type TtlKey = 'ttl30m' | 'ttl1h' | 'ttl4h' | 'ttl12h' | 'ttl24h' | 'ttl2d' | 'ttl7d'
const H = 3600
const TTL_BY_KIND: Record<GuestKind, { seconds: number; key: TtlKey }[]> = {
  showcase: [
    { seconds: H, key: 'ttl1h' },
    { seconds: 4 * H, key: 'ttl4h' },
    { seconds: 24 * H, key: 'ttl24h' },
    { seconds: 48 * H, key: 'ttl2d' },
    { seconds: 7 * 24 * H, key: 'ttl7d' },
  ],
  sitter: [
    { seconds: 1800, key: 'ttl30m' },
    { seconds: 4 * H, key: 'ttl4h' },
    { seconds: 12 * H, key: 'ttl12h' },
    { seconds: 24 * H, key: 'ttl24h' },
  ],
  welcome: [
    { seconds: H, key: 'ttl1h' },
    { seconds: 4 * H, key: 'ttl4h' },
    { seconds: 12 * H, key: 'ttl12h' },
    { seconds: 24 * H, key: 'ttl24h' },
  ],
  family: [
    { seconds: 24 * H, key: 'ttl24h' },
    { seconds: 48 * H, key: 'ttl2d' },
    { seconds: 7 * 24 * H, key: 'ttl7d' },
  ],
}
const DEFAULT_TTL: Record<GuestKind, number> = { showcase: 24 * H, sitter: 12 * H, welcome: 4 * H, family: 7 * 24 * H }

export function GuestSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const navigate = useNavigate()
  // Issuing a share link is operator-only — a read-only guest can't mint more, so
  // the whole section is hidden for them.
  const ro = isGuest()
  const [kind, setKind] = useState<GuestKind>('showcase')
  const [ttl, setTtl] = useState(DEFAULT_TTL.showcase)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function chooseKind(k: GuestKind) {
    setKind(k)
    setTtl(DEFAULT_TTL[k]) // reset the duration to the kind's sensible default
    setLink(null) // a link minted for the old kind no longer matches the picker
  }

  async function generate() {
    if (busy) return
    setBusy(true)
    setErr(null)
    setCopied(false)
    try {
      const res = await api<{ guestToken: string }>('guest/start', {
        method: 'POST',
        body: { ttlSeconds: ttl, kind },
      })
      const path = KINDS.find((k) => k.kind === kind)?.path ?? '/board'
      setLink(`${window.location.origin}${path}?guest=${encodeURIComponent(res.guestToken)}`)
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

  const ttlOptions = TTL_BY_KIND[kind]

  return (
    <>
      <OperatorSection title={t.guest.title} help={help} helpKey="guest">
        <label className="operator__seg">
          <span className="operator__seg-label mono">{t.guest.kindLabel}</span>
          <select className="input" value={kind} onChange={(e) => chooseKind(e.target.value as GuestKind)} disabled={busy}>
            {KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {t.guest[k.labelKey]}
              </option>
            ))}
          </select>
        </label>
        <p className="operator__hint mono">{t.guest[KINDS.find((k) => k.kind === kind)!.hintKey]}</p>

        <label className="operator__seg">
          <span className="operator__seg-label mono">{t.guest.ttlLabel}</span>
          <select className="input" value={ttl} onChange={(e) => setTtl(Number(e.target.value))} disabled={busy}>
            {ttlOptions.map((o) => (
              <option key={o.seconds} value={o.seconds}>
                {t.guest[o.key]}
              </option>
            ))}
          </select>
        </label>

        <div className="operator__inline-form">
          <button type="button" className="btn btn--primary" onClick={generate} disabled={busy}>
            <InlineIcon name="key-bold" /> {busy ? t.guest.generating : t.guest.generate}
          </button>
          {/* Aperçu: see exactly what this kind shows before sharing. Curated kinds
              open their scene with ?preview=<kind> (the server returns the curated
              payload for an operator); showcase IS the real hub, so open /board. */}
          <button
            type="button"
            className="btn"
            onClick={() => {
              const k = KINDS.find((x) => x.kind === kind)!
              navigate(kind === 'showcase' ? '/board' : `${k.path}?preview=${kind}`)
            }}
            disabled={busy}
          >
            <InlineIcon name="magnifying-glass-bold" /> {t.shareMode.preview}
          </button>
        </div>

        {err && <StatusMessage tone="error">{err}</StatusMessage>}

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
            {/* A QR by the door (#35): scan the link off the wall tablet, or print
                it to tape on the fridge. White tile so it scans on any theme. */}
            <QrCode value={link} />
          </div>
        )}
      </OperatorSection>

      <ShareInfoEditor help={help} />
    </>
  )
}

// The few free-text facts a "Babysitter" / "Welcome" link surfaces (migration 0072):
// wifi, house rules, bin day. Stored on the household; read by /api/guest/window.
interface ShareFields {
  wifiSsid: string
  wifiPassword: string
  houseRules: string
  binDay: string
}
const EMPTY: ShareFields = { wifiSsid: '', wifiPassword: '', houseRules: '', binDay: '' }

function ShareInfoEditor({ help }: { help?: HelpMode }) {
  const t = useT()
  const [fields, setFields] = useState<ShareFields>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let alive = true
    api<Partial<Record<keyof ShareFields, string | null>>>('household')
      .then((h) => {
        if (!alive) return
        setFields({
          wifiSsid: h.wifiSsid ?? '',
          wifiPassword: h.wifiPassword ?? '',
          houseRules: h.houseRules ?? '',
          binDay: h.binDay ?? '',
        })
      })
      .catch(() => {
        /* offline — leave blank; saving still works once back online */
      })
    return () => {
      alive = false
    }
  }, [])

  const set = (k: keyof ShareFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFields((f) => ({ ...f, [k]: e.target.value }))
    setSaved(false)
  }

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      await api('household', { method: 'PATCH', body: fields })
      setSaved(true)
    } catch {
      /* surfaced nowhere fancy — the operator can retry */
    } finally {
      setSaving(false)
    }
  }

  return (
    <OperatorSection title={t.shareMode.editorTitle} help={help} helpKey="guest">
      <p className="operator__hint mono">{t.shareMode.editorHint}</p>
      <label className="operator__seg">
        <span className="operator__seg-label mono">{t.shareMode.wifiNetwork}</span>
        <input className="input" value={fields.wifiSsid} onChange={set('wifiSsid')} autoComplete="off" />
      </label>
      <label className="operator__seg">
        <span className="operator__seg-label mono">{t.shareMode.wifiPassword}</span>
        <input className="input mono" value={fields.wifiPassword} onChange={set('wifiPassword')} autoComplete="off" />
      </label>
      <label className="operator__seg">
        <span className="operator__seg-label mono">{t.shareMode.binDay}</span>
        <input className="input" value={fields.binDay} onChange={set('binDay')} autoComplete="off" />
      </label>
      <label className="operator__seg">
        <span className="operator__seg-label mono">{t.shareMode.houseRules}</span>
        <textarea className="input" value={fields.houseRules} onChange={set('houseRules')} rows={3} />
      </label>
      <button type="button" className="btn" onClick={save} disabled={saving}>
        <InlineIcon name="check-bold" /> {saved ? t.shareMode.saved : t.shareMode.save}
      </button>
    </OperatorSection>
  )
}
