import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { TopBar } from '../components/TopBar'
import { StatusMessage } from '../components/StatusMessage'
import { InlineIcon } from '../components/Icon'
import { useT } from '../i18n'
import { api, isStatus } from '../lib/api'
import { HEALTH_KEY } from '../lib/queryKeys'
import { useAuth } from '../lib/auth'
import { isSandboxEmail } from '../lib/demo'
import { useOnline } from '../lib/online'

// « Garder ma maisonnée » — the sandbox claim form (POST /api/demo/claim). The
// mirror of Signup, deliberately: same page shell, same .field styles, same
// invite-code reveal — except nothing is created. The visitor already owns a real
// household; picking an email + password simply rewrites their throwaway operator
// credential in place, so everything they tried in the demo stays put and the
// 24-hour sweep can never take it. Only reachable from a sandbox session (the
// board claim banner links here); anyone else bounces to their home.
export function ClaimPage() {
  const t = useT()
  const nav = useNavigate()
  const { loading, signedIn, email: sessionEmail, household, refresh } = useAuth()
  const online = useOnline()
  const [householdName, setHouseholdName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [invite, setInvite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<'exists' | 'badInvite' | 'mismatch' | 'error' | null>(null)

  // Same gate posture as signup: an invite-gated deployment wants the code here too.
  const { data: health } = useQuery({ queryKey: HEALTH_KEY, queryFn: () => api<{ invite?: boolean }>('health') })
  const inviteRequired = !!health?.invite

  // Sandbox-only door. Wait out the auth check, then bounce anyone who isn't a
  // sandbox operator: a signed-in real account has nothing to claim (→ /board),
  // a signed-out visitor belongs on the front door (→ /).
  if (loading) return null
  if (!signedIn || !isSandboxEmail(sessionEmail)) {
    return <Navigate to={signedIn ? '/board' : '/'} replace />
  }

  const ready = email.trim().length > 0 && password.length >= 8 && confirm.length >= 8

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || busy || !online) return
    if (password !== confirm) {
      setError('mismatch')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // Online-only auth action (like login/signup) — raw api(), not useWrite.
      await api('demo/claim', {
        method: 'POST',
        body: {
          email: email.trim().toLowerCase(),
          password,
          householdName: householdName.trim() || undefined,
          invite: invite || undefined,
        },
      })
      // The response re-issued the session cookies for the new email; re-ask
      // auth/me so the SPA (and this page's sandbox gate) see the real account.
      await refresh()
      nav('/board')
    } catch (err) {
      setError(isStatus(err, 409) ? 'exists' : isStatus(err, 403) ? 'badInvite' : 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <TopBar />
      <main className="narrow auth">
        <h1>{t.claim.title}</h1>
        <p className="lead">{t.claim.lead}</p>
        <form className="form auth__card" onSubmit={submit}>
          <label className="field">
            <span className="field__label">{t.signup.householdName}</span>
            <input
              className="input"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              placeholder={household?.name ?? t.signup.householdPlaceholder}
              maxLength={60}
            />
            {/* Optional: leave it blank to keep the current name. */}
            <span className="field__hint mono">{t.claim.nameHint}</span>
          </label>
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
            <span className="field__label">{t.signup.password}</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            {/* Live progress toward the 8-char minimum — same affordance as Signup. */}
            <span className={'field__hint mono' + (password.length >= 8 ? ' field__hint--ok' : '')}>
              {password.length === 0
                ? t.signup.passwordHint
                : password.length < 8
                  ? `${t.signup.passwordHint} (${password.length}/8)`
                  : (
                      <>
                        {t.signup.passwordHint} <InlineIcon name="check-bold" />
                      </>
                    )}
            </span>
          </label>
          <label className="field">
            <span className="field__label">{t.claim.confirm}</span>
            <input
              className="input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          {inviteRequired && (
            <label className="field">
              <span className="field__label">{t.signup.invite}</span>
              <input
                className="input"
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                autoComplete="off"
              />
              <span className="field__hint mono">{t.signup.inviteHint}</span>
            </label>
          )}
          {error && <StatusMessage tone="error">{t.claim[error]}</StatusMessage>}
          {!online && <StatusMessage tone="info">{t.offline.unavailable}</StatusMessage>}
          <button type="submit" className="btn btn--primary" disabled={busy || !ready || !online}>
            {busy ? t.claim.claiming : t.claim.submit}
          </button>
          {!error && <p className="auth__hint mono">{t.claim.nextStep}</p>}
        </form>
      </main>
    </div>
  )
}
