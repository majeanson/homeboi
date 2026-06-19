import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { TopBar } from '../components/TopBar'
import { StatusMessage } from '../components/StatusMessage'
import { InlineIcon } from '../components/Icon'
import { useT } from '../i18n'
import { api, isStatus } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useSurface } from '../lib/surface'

// Self-serve household creation — the front door for a brand-new family. One
// short form (household name, email, password), then straight into Réglages ▸
// La maisonnée to add the family members. When the deployment is gated
// (LOGIN_PASSWORD set), /api/health says so and an invite-code field appears —
// the same code the shared login uses, so the gate posture doesn't change.
export function Signup() {
  const t = useT()
  const nav = useNavigate()
  const { refresh } = useAuth()
  const { surface, chosen, setSurface } = useSurface()
  const [householdName, setHouseholdName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [invite, setInvite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<'exists' | 'badInvite' | 'error' | null>(null)

  // Public liveness read — `invite: true` means this installation wants the code.
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: () => api<{ invite?: boolean }>('health') })
  const inviteRequired = !!health?.invite

  const ready = householdName.trim().length > 0 && email.trim().length > 0 && password.length >= 8

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      await api('auth/signup', {
        method: 'POST',
        body: {
          email: email.trim().toLowerCase(),
          password,
          householdName: householdName.trim(),
          invite: invite || undefined,
        },
      })
      await refresh()
      // Creating a household is usually the personal-device path — but when the
      // family started on the wall tablet (Pair's signup link), keep the kiosk
      // role they already chose instead of stamping the phone layout on a wall.
      if (!(chosen && surface === 'kiosk')) setSurface('mobile')
      // Land in Réglages ▸ La maisonnée so the obvious next step (add your
      // family) is right there. (?tab= selects the sub-tab — Guide is the
      // default now; a bare /settings would land there instead. See tabParam.)
      nav('/settings?tab=household')
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
        <h1>{t.signup.title}</h1>
        <p className="lead">{t.signup.lead}</p>
        <form className="form auth__card" onSubmit={submit}>
          <label className="field">
            <span className="field__label">{t.signup.householdName}</span>
            <input
              className="input"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              placeholder={t.signup.householdPlaceholder}
              required
              maxLength={60}
            />
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
            {/* Live progress toward the 8-char minimum — otherwise the only
                signal is a disabled submit button with no visible reason. */}
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
          {error && (
            <StatusMessage tone="error">
              {t.signup[error]}
              {error === 'exists' && (
                <>
                  {' '}
                  <Link to="/login">{t.signup.gotoLogin}</Link>
                </>
              )}
            </StatusMessage>
          )}
          <button type="submit" className="btn btn--primary" disabled={busy || !ready}>
            {t.signup.submit}
          </button>
          {!error && <p className="auth__hint mono">{t.signup.nextStep}</p>}
        </form>
        <p className="auth__alt mono">
          {t.signup.haveAccount} <Link to="/login">{t.signup.gotoLogin}</Link>
        </p>
      </main>
    </div>
  )
}
