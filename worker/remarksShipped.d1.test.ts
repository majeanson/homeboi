import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { anon, household } from '../functions/test/d1'

// The deploy callback, through the REAL Worker: the CSRF exemption, the secret gate, the
// two-statement write and the refusal that makes « only a human confirms » true.
//
// The secret is bound in vitest.d1.config.ts, so these exercise the CONFIGURED path. The
// unconfigured path — the one that must fail CLOSED — is held purely in
// functions/_lib/deployHook.test.ts, which is the entire reason that gate is a separate
// pure module: you cannot unbind a variable per-test here.

const SECRET = 'd1-deploy-secret-d1-deploy-secret-32'
const HDR = 'X-Deploy-Secret'

const ship = (body: Record<string, unknown>, secret: string | null = SECRET) =>
  anon('/api/remarks/shipped', {
    method: 'POST',
    body,
    headers: secret === null ? {} : { [HDR]: secret },
  })

async function fileOne(label: string) {
  const a = await household(label)
  await a.fetch('/api/remarks', { method: 'POST', body: { title: 'La liste saute' } })
  const { remarks } = (await (await a.fetch('/api/remarks')).json()) as {
    remarks: { id: string; status: string; events: { kind: string; text: string; sha: string | null }[] }[]
  }
  return { a, id: remarks[0].id }
}

const read = async (a: Awaited<ReturnType<typeof household>>) =>
  ((await (await a.fetch('/api/remarks')).json()) as {
    remarks: { id: string; status: string; events: { kind: string; text: string; sha: string | null }[] }[]
  }).remarks[0]

describe('POST /api/remarks/shipped', () => {
  it('refuses with NO secret at all — checked first, because everything else assumes it', async () => {
    const { a, id } = await fileOne('sh-nosecret')
    const res = await ship({ id, sha: 'abc1234' }, null)
    expect(res.status).toBe(401)
    expect((await read(a)).status).toBe('open')
  })

  it('refuses a WRONG secret, including one that is a correct prefix', async () => {
    const { a, id } = await fileOne('sh-wrong')
    expect((await ship({ id, sha: 'abc1234' }, 'nope')).status).toBe(401)
    expect((await ship({ id, sha: 'abc1234' }, SECRET.slice(0, -1))).status).toBe(401)
    expect((await read(a)).status).toBe('open')
  })

  it('refuses an OPERATOR SESSION — a session is not a deploy', async () => {
    // The endpoint is CSRF-exempt, so if it ALSO honoured a cookie, any page on any
    // origin could drive it with the operator's credentials attached.
    const { a, id } = await fileOne('sh-session')
    const res = await a.fetch('/api/remarks/shipped', { method: 'POST', body: { id, sha: 'abc1234' } })
    expect(res.status).toBe(401)
  })

  it('ships an open remark, and the journal carries the commit + the explanation', async () => {
    const { a, id } = await fileOne('sh-ok')
    const res = await ship({ id, sha: 'A3F21C9', explanation: 'la sweep lisait la mauvaise colonne' })
    expect(res.status).toBe(200)

    const r = await read(a)
    expect(r.status).toBe('shipped')
    const shipped = r.events.find((e) => e.kind === 'shipped')!
    // Lower-cased on the way in, so a link built from it is stable.
    expect(shipped.sha).toBe('a3f21c9')
    expect(shipped.text).toBe('la sweep lisait la mauvaise colonne')
  })

  it('an unknown id is a 404 and creates NOTHING', async () => {
    // Pins the "no INSERT path" claim the whole threat model rests on: this endpoint can
    // only ever move a row that already exists.
    const before = await env.DB.prepare('SELECT COUNT(*) AS n FROM remarks').first<{ n: number }>()
    const res = await ship({ id: 'zzzzzzzzzzzz', sha: 'abc1234' })
    expect(res.status).toBe(404)
    const after = await env.DB.prepare('SELECT COUNT(*) AS n FROM remarks').first<{ n: number }>()
    expect(after!.n).toBe(before!.n)
  })

  it('refuses a malformed id or sha before touching the database', async () => {
    const { id } = await fileOne('sh-shape')
    expect((await ship({ id: '../../etc/passwd', sha: 'abc1234' })).status).toBe(400)
    expect((await ship({ id, sha: 'abc; DROP TABLE remarks' })).status).toBe(400)
    expect((await ship({ id, sha: 'NOTHEX!' })).status).toBe(400)
    expect((await ship({ id })).status).toBe(400)
  })

  it('a re-run of the same workflow writes nothing and says so', async () => {
    const { a, id } = await fileOne('sh-rerun')
    expect((await ship({ id, sha: 'deadbee', explanation: 'une fois' })).status).toBe(200)
    const again = await ship({ id, sha: 'deadbee', explanation: 'une fois' })
    expect(again.status).toBe(200)
    expect(((await again.json()) as { duplicate?: boolean }).duplicate).toBe(true)
    expect((await read(a)).events.filter((e) => e.kind === 'shipped')).toHaveLength(1)
  })

  it('a SECOND, different commit is allowed — and keeps both explanations', async () => {
    // The over-strict version (`AND status = 'open'` on the UPDATE) would silently drop
    // the second fix's explanation, which is the thing this feature exists to keep.
    const { a, id } = await fileOne('sh-second')
    await ship({ id, sha: 'aaaaaaa', explanation: 'première tentative' })
    await ship({ id, sha: 'bbbbbbb', explanation: 'deuxième tentative' })
    const shipped = (await read(a)).events.filter((e) => e.kind === 'shipped')
    expect(shipped.map((e) => e.text)).toEqual(['première tentative', 'deuxième tentative'])
  })

  it('REFUSES a remark the household already confirmed — the human verdict wins', async () => {
    // The one refusal that matters. Without it, a late deploy could silently reopen a
    // question somebody had already answered.
    const { a, id } = await fileOne('sh-confirmed')
    await ship({ id, sha: 'ccccccc' })
    await a.fetch('/api/remarks', { method: 'PATCH', body: { id, action: 'confirm' } })

    const res = await ship({ id, sha: 'ddddddd', explanation: 'trop tard' })
    expect(res.status).toBe(409)
    expect(((await res.json()) as { code?: string }).code).toBe('already-confirmed')

    const r = await read(a)
    expect(r.status).toBe('confirmed')
    expect(r.events.map((e) => e.text)).not.toContain('trop tard')
  })

  it('treats a soft-deleted remark as unknown — a deploy never resurrects one', async () => {
    const { a, id } = await fileOne('sh-deleted')
    await a.fetch('/api/remarks', { method: 'DELETE', body: { id } })
    expect((await ship({ id, sha: 'eeeeeee' })).status).toBe(404)
  })

  it('refuses an oversized body', async () => {
    const { id } = await fileOne('sh-big')
    expect((await ship({ id, sha: 'fffffff', explanation: 'x'.repeat(20_000) })).status).toBe(400)
  })

  it('truncates a long explanation rather than refusing the notification', async () => {
    const { a, id } = await fileOne('sh-long')
    expect((await ship({ id, sha: '1111111', explanation: 'y'.repeat(3000) })).status).toBe(200)
    const shipped = (await read(a)).events.find((e) => e.kind === 'shipped')!
    expect(shipped.text).toHaveLength(2000)
  })

  it('never answers a GET', async () => {
    expect((await anon('/api/remarks/shipped')).status).toBe(405)
  })
})
