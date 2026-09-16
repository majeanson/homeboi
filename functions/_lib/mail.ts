// The ONE way the app sends an email — over Resend's REST API, with plain fetch.
//
// OPTIONAL, like AI / PHOTOS / REALTIME_HUB (env.ts): `RESEND_API_KEY` + `MAIL_FROM`
// unset → `mailEnabled()` is false, the reset door HIDES on /login (health.mail) and the
// endpoints answer 503 — never a half-flow that promises an email nobody sends. Marc's
// portal project already runs on Resend, so the account and the domain step are known
// (its docs/deployment/EMAIL_SETUP.md): a verified sending domain is what lets it
// deliver to anyone but the account owner.
//
// No SDK: a Worker does not need one for a single POST, and every dependency the
// entry pulls is a byte the kiosk downloads at boot.
import type { Env } from './env'

export interface Mail {
  to: string
  subject: string
  text: string
  html?: string
}

export function mailEnabled(env: Env): boolean {
  return !!env.RESEND_API_KEY && !!env.MAIL_FROM
}

/** Send, or throw. Callers decide what a failure means for the user (a reset request
 *  answers 200 either way; the failure is for the log, which observability keeps). */
export async function sendMail(env: Env, mail: Mail, fetchImpl: typeof fetch = fetch): Promise<{ id: string }> {
  if (!mailEnabled(env)) throw new Error('mail: RESEND_API_KEY / MAIL_FROM unset')
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
  })
  if (!res.ok) {
    // The provider's body names the reason (an unverified domain, a bad key); it goes
    // to the log, never to the visitor.
    const detail = await res.text().catch(() => '')
    throw new Error(`mail: resend ${res.status} ${detail.slice(0, 200)}`)
  }
  const body = (await res.json().catch(() => ({}))) as { id?: string }
  return { id: body.id ?? '' }
}
