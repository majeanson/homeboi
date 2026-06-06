import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useSurface } from '../lib/surface'

export function Login() {
  const t = useT()
  const nav = useNavigate()
  const { refresh } = useAuth()
  const { setSurface } = useSurface()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(false)
    try {
      await api('auth/login', { method: 'POST', body: { email: email.trim().toLowerCase(), password } })
      await refresh()
      // Signing in is the personal-device path — land on the mobile home (the
      // glance + quick capture board), not the settings panel.
      setSurface('mobile')
      nav('/board')
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <TopBar />
      <main className="narrow">
        <h1>{t.login.title}</h1>
        <p className="lead">{t.login.lead}</p>
        <form className="form" onSubmit={submit}>
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
          {error && <p className="error mono">{t.login.error}</p>}
          <button type="submit" className="btn btn--primary" disabled={busy || !email.trim()}>
            {t.login.submit}
          </button>
        </form>
      </main>
    </div>
  )
}
