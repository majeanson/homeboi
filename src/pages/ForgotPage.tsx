import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { StatusMessage } from '../components/StatusMessage'
import { useT } from '../i18n'
import { api, isStatus } from '../lib/api'

// « Mot de passe oublié » — /oubli. One field, one sentence, and the SAME success
// screen whatever was typed: the server answers 200 whether or not the address has an
// account (enumeration), so the page must not know either. A 503 is the one thing it
// says differently: this deployment has no mail wired (lib/mail) — the door on /login
// already hides then; this catches the direct URL. Same shell as /login.
export function ForgotPage() {
  const t = useT()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [state, setState] = useState<'idle' | 'sent' | 'unavailable' | 'tooMany' | 'error'>('idle')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setState('idle')
    try {
      await api('auth/forgot', { method: 'POST', body: { email: email.trim().toLowerCase() } })
      setState('sent')
    } catch (err) {
      setState(isStatus(err, 503) ? 'unavailable' : isStatus(err, 429) ? 'tooMany' : 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <TopBar />
      <main className="narrow auth">
        <h1>{t.forgot.title}</h1>
        <p className="lead">{t.forgot.lead}</p>
        {state === 'sent' ? (
          <div className="form auth__card" data-state="sent">
            <StatusMessage tone="success">{t.forgot.sent}</StatusMessage>
            <p className="auth__alt mono">
              <Link to="/login">{t.forgot.back}</Link>
            </p>
          </div>
        ) : (
          <form className="form auth__card" onSubmit={submit}>
            <label className="field">
              <span className="field__label">{t.forgot.email}</span>
              <input
                className="input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {state === 'unavailable' && <StatusMessage tone="info">{t.forgot.unavailable}</StatusMessage>}
            {state === 'tooMany' && <StatusMessage tone="error">{t.common.tooMany}</StatusMessage>}
            {state === 'error' && <StatusMessage tone="error">{t.forgot.error}</StatusMessage>}
            <button type="submit" className="btn btn--primary" disabled={busy || !email.trim()}>
              {t.forgot.submit}
            </button>
            <p className="auth__alt mono">
              <Link to="/login">{t.forgot.back}</Link>
            </p>
          </form>
        )}
      </main>
    </div>
  )
}
