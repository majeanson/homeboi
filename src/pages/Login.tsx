import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { StatusMessage } from '../components/StatusMessage'
import { useT } from '../i18n'
import { useQuery } from '@tanstack/react-query'
import { api, isStatus } from '../lib/api'
import { HEALTH_KEY } from '../lib/queryKeys'
import { useAuth } from '../lib/auth'
import { useSurface } from '../lib/surface'

export function Login() {
  const t = useT()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { refresh } = useAuth()
  const { setSurface } = useSurface()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<'error' | 'tooMany' | null>(null)
  // « Mot de passe oublié ? » only where it leads somewhere: a deployment with no mail
  // wired (health.mail) would send the person to a form that can only apologise.
  // Unknown (still loading) reads as yes — the door is a Link, not a promise.
  const health = useQuery({ queryKey: HEALTH_KEY, queryFn: () => api<{ mail?: boolean }>('health') })
  const canReset = health.data?.mail !== false

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('auth/login', { method: 'POST', body: { email: email.trim().toLowerCase(), password } })
      await refresh()
      // Signing in is the personal-device path — land on the mobile home (the
      // glance + quick capture board), not the settings panel.
      setSurface('mobile')
      // Honour a same-origin ?next= (e.g. a /partage/<id> share the visitor came from
      // wanting to import) — but ONLY an internal path, never an absolute/protocol URL,
      // so the redirect can't be turned into an open-redirect off-site.
      const next = params.get('next')
      nav(next && next.startsWith('/') && !next.startsWith('//') ? next : '/board')
    } catch (err) {
      // 429 (the brute-force bound, _lib/rateLimit.ts) is not « wrong password » —
      // the person may have the right one and needs to know to wait, not retype.
      setError(isStatus(err, 429) ? 'tooMany' : 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <TopBar />
      <main className="narrow auth">
        <h1>{t.login.title}</h1>
        <p className="lead">{t.login.lead}</p>
        <form className="form auth__card" onSubmit={submit}>
          <label className="field">
            <span className="field__label">{t.login.email}</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className="field">
            <span className="field__label">{t.login.password}</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error && <StatusMessage tone="error">{error === 'tooMany' ? t.common.tooMany : t.login.error}</StatusMessage>}
          <button type="submit" className="btn btn--primary" disabled={busy || !email.trim()}>
            {t.login.submit}
          </button>
          {!error && <p className="auth__hint mono">{t.login.nextStep}</p>}
        </form>
        {canReset && (
          <p className="auth__alt mono">
            <Link to="/oubli">{t.forgot.link}</Link>
          </p>
        )}
        <p className="auth__alt mono">
          {t.login.noAccount} <Link to="/signup">{t.login.gotoSignup}</Link>
        </p>
      </main>
    </div>
  )
}
