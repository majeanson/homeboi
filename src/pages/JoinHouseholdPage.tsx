import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { TopBar } from '../components/TopBar'
import { StatusMessage } from '../components/StatusMessage'
import { Loading } from '../components/Fallback'
import { InlineIcon } from '../components/Icon'
import { useT } from '../i18n'
import { api, errorCode, isStatus } from '../lib/api'
import { operatorJoinKey } from '../lib/queryKeys'
import { useAuth } from '../lib/auth'
import { useSurface } from '../lib/surface'

// « Rejoindre une maisonnée » — where an operator-invite link lands (functions/api/
// operator-join.ts, migration 0128). The second adult's front door.
//
// Deliberately a SIBLING of Signup rather than a mode of it. The forms look alike —
// email, password — but they mean opposite things: signup CREATES a household, this
// one joins an existing one, and the failure this whole feature exists to fix is
// precisely a partner who could not tell those apart and ended up alone in a fake
// household. A page that says « Rejoindre la maisonnée de <nom> » at the top cannot
// be mistaken for the other thing.
//
// No household-name field and no invite-code field: the link carries the household,
// and it is itself the narrower gate (see the endpoint on why LOGIN_PASSWORD does not
// apply here).
export function JoinHouseholdPage() {
  const t = useT()
  const nav = useNavigate()
  const { refresh } = useAuth()
  const { surface, chosen, setSurface } = useSurface()
  const [params] = useSearchParams()
  const token = params.get('j') ?? ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<'exists' | 'elsewhere' | 'badLink' | 'error' | null>(null)

  // The preview. Whose household is this? Asked BEFORE the form is worth filling —
  // a dead link should say so now, not after someone has chosen a password.
  const preview = useQuery({
    queryKey: operatorJoinKey(token),
    queryFn: () => api<{ householdName: string }>(`operator-join?j=${encodeURIComponent(token)}`),
    enabled: token.length > 0,
    // A bad or rotated link will not recover on retry — surface it immediately.
    retry: (count, err) => !isStatus(err, 403) && !isStatus(err, 404) && count < 2,
  })

  const ready = email.trim().length > 0 && password.length >= 8 && !!preview.data

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      await api('operator-join', {
        method: 'POST',
        body: { token, email: email.trim().toLowerCase(), password },
      })
      await refresh()
      // The joiner is, by construction, the person who is NOT standing at the wall
      // tablet — they were sent a link. Phone layout, unless this device already
      // chose to be a kiosk (same reasoning as Signup).
      if (!(chosen && surface === 'kiosk')) setSurface('mobile')
      // Straight to the board. Nothing is seeded and nothing needs setting up: they
      // are joining a household that is already alive, and the first thing they
      // should see is that their family's real week is there.
      nav('/board')
    } catch (err) {
      // Both 409s are honestly conflicts, so they are told apart by the body's
      // `code` (ApiError.code) rather than by matching words in the message — which
      // would break on a copy edit and was already wrong in English.
      setError(
        isStatus(err, 409)
          ? errorCode(err) === 'other-household'
            ? 'elsewhere'
            : 'exists'
          : isStatus(err, 403) || isStatus(err, 404)
            ? 'badLink'
            : 'error',
      )
    } finally {
      setBusy(false)
    }
  }

  // No token at all — somebody typed /rejoindre by hand, or a messaging app ate the
  // query string. Say what the page is for rather than rendering a form that cannot
  // possibly work.
  if (!token) {
    return (
      <div className="page">
        <TopBar />
        <main className="narrow auth">
          <h1>{t.join.title}</h1>
          <StatusMessage tone="error">{t.join.noToken}</StatusMessage>
          <p className="auth__alt mono">
            {t.signup.haveAccount} <Link to="/login">{t.signup.gotoLogin}</Link>
          </p>
        </main>
      </div>
    )
  }

  return (
    <div className="page">
      <TopBar />
      <main className="narrow auth">
        {preview.isLoading ? (
          <Loading />
        ) : preview.isError ? (
          <>
            <h1>{t.join.title}</h1>
            <StatusMessage tone="error">{t.join.badLink}</StatusMessage>
            <p className="auth__alt mono">
              {t.signup.haveAccount} <Link to="/login">{t.signup.gotoLogin}</Link>
            </p>
          </>
        ) : (
          <>
            <h1>{t.join.titleFor(preview.data?.householdName ?? '')}</h1>
            <p className="lead">{t.join.lead}</p>
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
                <span className="field__hint mono">{t.join.emailHint}</span>
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
                {/* Same live 8-char progress as Signup — a disabled button with no
                    stated reason is the thing that hint exists to prevent. */}
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
              {error && (
                <StatusMessage tone="error">
                  {t.join[error]}
                  {error === 'exists' && (
                    <>
                      {' '}
                      <Link to="/login">{t.signup.gotoLogin}</Link>
                    </>
                  )}
                </StatusMessage>
              )}
              <button type="submit" className="btn btn--primary" disabled={busy || !ready}>
                {t.join.submit}
              </button>
              {!error && <p className="auth__hint mono">{t.join.nextStep}</p>}
            </form>
          </>
        )}
      </main>
    </div>
  )
}
