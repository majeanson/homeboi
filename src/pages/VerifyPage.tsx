import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { StatusMessage } from '../components/StatusMessage'
import { useT } from '../i18n'
import { api } from '../lib/api'

// « Courriel confirmé » — /verifier?t=<token>, the link from the signup email (0138).
//
// IT REDEEMS ON ARRIVAL. Every other token page in this app asks for something first (a
// new password, a name) because the token alone is not the whole act. Here it is: the
// person already did the deciding when they clicked, and a button saying « yes, really
// confirm » would be asking them to agree twice. So the page's whole job is to report.
//
// The link may land in a browser that has never met this app — a phone opening a mail
// on a different device — which is why the endpoint is CSRF-exempt and why this page
// asks for no session. It says what happened and offers the way in; it does not sign
// anyone in, because the token proves an ADDRESS, not a person at a keyboard.
export function VerifyPage() {
  const t = useT()
  const token = new URLSearchParams(location.search).get('t') ?? ''
  const [state, setState] = useState<'working' | 'done' | 'spent'>('working')
  // StrictMode mounts effects twice in dev, and this one SPENDS a single-use token:
  // without the latch the second run redeems nothing and the page reports « déjà servi »
  // over a verification that had just succeeded.
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    if (!token) {
      setState('spent')
      return
    }
    void api('auth/verify', { method: 'POST', body: { token } })
      .then(() => setState('done'))
      .catch(() => setState('spent'))
  }, [token])

  return (
    <div className="page">
      <TopBar />
      <main className="narrow auth">
        <h1>{t.verify.title}</h1>
        {state === 'working' && <p className="lead">{t.verify.working}</p>}
        {state === 'done' && (
          <div className="form auth__card" data-state="done">
            <StatusMessage tone="success">{t.verify.done}</StatusMessage>
            <p className="auth__alt mono">
              <Link to="/board">{t.verify.toBoard}</Link>
            </p>
          </div>
        )}
        {state === 'spent' && (
          <div className="form auth__card" data-state="spent">
            <StatusMessage tone="error">{t.verify.spent}</StatusMessage>
            <p className="auth__alt mono">
              <Link to="/settings?tab=settings&sub=tablets">{t.verify.resendThere}</Link>
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
