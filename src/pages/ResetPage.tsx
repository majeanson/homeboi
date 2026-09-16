import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { StatusMessage } from '../components/StatusMessage'
import { useT } from '../i18n'
import { api, isStatus } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useSurface } from '../lib/surface'

// « Nouveau mot de passe » — /reinitialiser?t=<token>, the link from the email.
// Password + confirm, then straight to the board: the server signs the person in on
// success (auth/reset), the same way signup does. A spent, expired or unknown token is
// ONE calm sentence and the door back to /oubli — the server does not say which, and
// neither does this page.
export function ResetPage() {
  const t = useT()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { refresh } = useAuth()
  const { setSurface } = useSurface()
  const token = params.get('t') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<'mismatch' | 'expired' | 'tooMany' | 'error' | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('mismatch')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api('auth/reset', { method: 'POST', body: { token, password } })
      await refresh()
      setSurface('mobile')
      nav('/board')
    } catch (err) {
      setError(isStatus(err, 400) ? 'expired' : isStatus(err, 429) ? 'tooMany' : 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <TopBar />
      <main className="narrow auth">
        <h1>{t.reset.title}</h1>
        <p className="lead">{t.reset.lead}</p>
        {!token ? (
          <div className="form auth__card" data-state="no-token">
            <StatusMessage tone="info">{t.reset.noToken}</StatusMessage>
            <p className="auth__alt mono">
              <Link to="/oubli">{t.reset.again}</Link>
            </p>
          </div>
        ) : (
          <form className="form auth__card" onSubmit={submit}>
            <label className="field">
              <span className="field__label">{t.reset.password}</span>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">{t.reset.confirm}</span>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            {error === 'mismatch' && <StatusMessage tone="error">{t.reset.mismatch}</StatusMessage>}
            {error === 'expired' && (
              <StatusMessage tone="info">
                {t.reset.expired} <Link to="/oubli">{t.reset.again}</Link>
              </StatusMessage>
            )}
            {error === 'tooMany' && <StatusMessage tone="error">{t.common.tooMany}</StatusMessage>}
            {error === 'error' && <StatusMessage tone="error">{t.login.error}</StatusMessage>}
            <button type="submit" className="btn btn--primary" disabled={busy || password.length < 8}>
              {t.reset.submit}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
