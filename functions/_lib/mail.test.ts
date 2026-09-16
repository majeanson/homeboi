import { describe, expect, it, vi } from 'vitest'
import { mailEnabled, sendMail } from './mail'
import type { Env } from './env'

// The ONE mail seam (lib/mail): optional like AI/PHOTOS, and a single POST to Resend.
// Pinned here because the reset flow's whole promise rests on two facts — nothing is
// sent unless BOTH settings exist, and the request carries exactly what Resend reads.

const env = (over: Partial<Env>): Env => ({ DB: {} as D1Database, SESSION_SECRET: 'x'.repeat(32), ...over }) as Env

describe('mailEnabled', () => {
  it('needs BOTH the key and the from address — one without the other is off', () => {
    expect(mailEnabled(env({}))).toBe(false)
    expect(mailEnabled(env({ RESEND_API_KEY: 're_1' }))).toBe(false)
    expect(mailEnabled(env({ MAIL_FROM: 'Babillard <b@x.ca>' }))).toBe(false)
    expect(mailEnabled(env({ RESEND_API_KEY: 're_1', MAIL_FROM: 'Babillard <b@x.ca>' }))).toBe(true)
  })
})

describe('sendMail', () => {
  it('refuses to send when the seam is off — never a fetch to nowhere', async () => {
    const fetchImpl = vi.fn()
    await expect(sendMail(env({}), { to: 'a@b.ca', subject: 's', text: 't' }, fetchImpl)).rejects.toThrow(/unset/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('posts Resend’s shape with the bearer key and the configured sender', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'em_123' }), { status: 200 }))
    const r = await sendMail(
      env({ RESEND_API_KEY: 're_1', MAIL_FROM: 'Babillard <b@x.ca>' }),
      { to: 'a@b.ca', subject: 'Salut', text: 'Texte', html: '<p>Texte</p>' },
      fetchImpl as unknown as typeof fetch,
    )
    expect(r.id).toBe('em_123')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_1')
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'Babillard <b@x.ca>',
      to: ['a@b.ca'],
      subject: 'Salut',
      text: 'Texte',
      html: '<p>Texte</p>',
    })
  })

  it('turns a provider refusal into an error that names the status — for the log, not the visitor', async () => {
    const fetchImpl = vi.fn(async () => new Response('domain not verified', { status: 403 }))
    await expect(
      sendMail(env({ RESEND_API_KEY: 're_1', MAIL_FROM: 'b@x.ca' }), { to: 'a@b.ca', subject: 's', text: 't' }, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/403 domain not verified/)
  })
})
