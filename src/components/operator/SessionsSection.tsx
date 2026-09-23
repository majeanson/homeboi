import { useState } from 'react'
import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { api, isStatus } from '../../lib/api'
import { useConfirm } from '../../lib/confirm'
import { useOnline } from '../../lib/online'
import { useAuth } from '../../lib/auth'
import { useSandbox } from '../../lib/demo'
import { isGuest, isPaired } from '../../lib/device'
import { Cluster } from '../Layout'
import { Disclosure } from '../Disclosure'
import { StatusMessage } from '../StatusMessage'
import { InlineIcon } from '../Icon'

// « Mes connexions » — Réglages ▸ Système ▸ Appareils & accès (STATE.md §4-L L12).
//
// Two doors an account had never had:
//   · « Changer mon mot de passe » — until 0134 the ONLY way to change a password was
//     the emailed reset, and a deployment with no mail wired had none at all;
//   · « Déconnecter partout ailleurs » — a session was a stateless cookie nothing could
//     end before its 30 days; a lost phone stayed an operator for a month.
// Both bump `operators.session_version` server-side and re-issue THIS device's cookie
// in the same response, so the person pressing the button stays exactly where they
// are while every other device is signed out. Both are password-gated (sudo.ts): a
// stolen unlocked phone must not be able to lock the owner out.
//
// Operator-only, like every card in this sub: a kiosk's credential is a device token
// (revoked from the devices card), a guest has no account, and a sandbox operator has
// a password nobody knows. `[~]` A LIST of sessions is deliberately not here — sessions
// are stateless by design (no row to list), and the revoke-all door is the whole case.
//
// write-rule: both writes are raw api() calls, ALLOWED with the reason — the outbox
// would be actively wrong (a password change replayed hours later replaces whatever
// was set since; « sign me out everywhere » is a now-or-never).
export function SessionsSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const online = useOnline()
  const auth = useAuth()
  const confirm = useConfirm()
  const sandbox = useSandbox()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  if (isGuest() || isPaired() || sandbox) return null
  const s = t.sessions

  const fail = (e: unknown) =>
    setMsg({ tone: 'error', text: isStatus(e, 403) ? s.wrong : isStatus(e, 429) ? t.common.tooMany : t.common.saveFailed })

  // « Renvoie-moi le lien » (0138). The endpoint sends to the address on the ACCOUNT and
  // takes no parameter — a resend that named an address would be a way to make this app
  // mail a stranger. It answers 200 whether or not anything went out (mail unwired, or
  // three links already in flight), so the message here is the same either way rather
  // than inventing a distinction the person cannot act on.
  async function resendVerification() {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      await api('auth/verify?resend', { method: 'POST', body: {} })
      setMsg({ tone: 'success', text: t.verify.resent })
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (next !== again) return setMsg({ tone: 'error', text: s.mismatch })
    if (next.length < 8) return setMsg({ tone: 'error', text: s.tooShort })
    setBusy(true)
    setMsg(null)
    try {
      await api('auth/password', { method: 'POST', body: { current, next } })
      setCurrent('')
      setNext('')
      setAgain('')
      setMsg({ tone: 'success', text: s.changed })
      // The response re-issued this device's cookie; the shell re-reads who it is.
      await auth.refresh()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  async function revokeOthers() {
    if (busy) return
    const password = await confirm({ message: s.revokeConfirm, confirmLabel: s.revoke, tone: 'default', input: { kind: 'password', label: s.passwordLabel } })
    if (password === null) return
    setBusy(true)
    setMsg(null)
    try {
      await api('auth/sessions/revoke', { method: 'POST', body: { password } })
      setMsg({ tone: 'success', text: s.revoked })
      await auth.refresh()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <OperatorSection title={s.title} hint={s.hint} help={help} helpKey="sessions">
      {online && !auth.verified && (
        <StatusMessage tone="info">
          {t.verify.pending}{' '}
          <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void resendVerification()}>
            {t.verify.resend}
          </button>
        </StatusMessage>
      )}
      {!online ? (
        <p className="operator__hint mono">{t.offline.unavailable}</p>
      ) : (
        <>
          <Disclosure label={s.changeTitle}>
            <form className="form" onSubmit={changePassword}>
              <label className="field">
                <span className="field__label">{s.current}</span>
                <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
              </label>
              <label className="field">
                <span className="field__label">{s.next}</span>
                <input className="input" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
              </label>
              <label className="field">
                <span className="field__label">{s.again}</span>
                <input className="input" type="password" autoComplete="new-password" minLength={8} value={again} onChange={(e) => setAgain(e.target.value)} required />
              </label>
              <Cluster>
                <button type="submit" className="btn btn--primary" disabled={busy || !current || next.length < 8 || !again}>
                  <InlineIcon name="key-bold" /> {s.change}
                </button>
              </Cluster>
            </form>
          </Disclosure>
          <p className="operator__hint">{s.revokeHint}</p>
          <Cluster>
            <button type="button" className="btn" disabled={busy} onClick={() => void revokeOthers()}>
              <InlineIcon name="door-bold" /> {s.revoke}
            </button>
          </Cluster>
          {msg && <StatusMessage tone={msg.tone}>{msg.text}</StatusMessage>}
        </>
      )}
    </OperatorSection>
  )
}
