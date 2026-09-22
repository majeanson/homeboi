import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { anon, household, login } from '../functions/test/d1'

// DELETE /api/household — « Supprimer la maisonnée » (STATE §4-K Wave 4), through the
// real Worker against a real D1.
//
// THIS IS THE MOST IRREVERSIBLE ENDPOINT IN THE APP, so what is tested is not the happy
// path — it is every way in that must NOT open, and the blast radius when it does. A
// delete that works is easy; a delete that takes one household and leaves the one beside
// it untouched is the property that matters, and it is the one nothing else here checks:
// `isolation.d1.test.ts` walks every route with a NEIGHBOUR's ids, which is the mirror
// of this file's last case.
//
// The unit tests cannot cover any of it: the locks are `authed(…, 'operator')`,
// `requirePassword` (a real bcrypt-ish verify against a real row) and a real cascade
// across ~90 tables. All three only exist at runtime.

const del = (s: Awaited<ReturnType<typeof household>>, body: Record<string, unknown>) =>
  s.fetch('/api/household', { method: 'DELETE', body })

const rowsFor = async (id: string) => {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM households WHERE id = ?').bind(id).first<{ n: number }>()
  return r?.n ?? 0
}

describe('supprimer la maisonnée', () => {
  it('refuses a wrong password, and refuses a right password with the wrong name', async () => {
    const a = await household('leave-locks')

    const noPassword = await del(a, { name: 'Maisonnée leave-locks' })
    expect(noPassword.status).toBe(400)

    const wrongPassword = await del(a, { password: 'not it', name: 'Maisonnée leave-locks' })
    expect(wrongPassword.status).toBe(403)

    // The password is right; the name is not. This is the lock that exists because a
    // password is something you know by heart and can type while thinking about
    // something else — the name has to be read off the screen.
    const wrongName = await del(a, { password: a.password, name: 'une autre maisonnée' })
    expect(wrongName.status).toBe(400)

    // …and after three refusals the household is still entirely there.
    expect(await rowsFor(a.householdId)).toBe(1)
  })

  it('accepts the name with different case and accents — a typing accident is not a different household', async () => {
    const a = await household('leave-fold')
    const res = await del(a, { password: a.password, name: '  maisonnee LEAVE-FOLD  ' })
    expect(res.status).toBe(200)
    expect(await rowsFor(a.householdId)).toBe(0)
  })

  it('takes the content, the account and the session with it — and leaves the neighbour alone', async () => {
    const a = await household('leave-gone')
    const b = await household('leave-stays')

    // Give A something to lose, so "the household row is gone" is not the only evidence.
    await a.fetch('/api/list', { method: 'POST', body: { text: 'des œufs' } })
    await b.fetch('/api/list', { method: 'POST', body: { text: 'du lait' } })

    expect((await del(a, { password: a.password, name: 'Maisonnée leave-gone' })).status).toBe(200)

    // The household, its rows and its operator are gone…
    expect(await rowsFor(a.householdId)).toBe(0)
    const items = await env.DB.prepare('SELECT COUNT(*) AS n FROM list_items WHERE household_id = ?')
      .bind(a.householdId)
      .first<{ n: number }>()
    expect(items?.n ?? 0).toBe(0)
    const op = await env.DB.prepare('SELECT COUNT(*) AS n FROM operators WHERE household_id = ?')
      .bind(a.householdId)
      .first<{ n: number }>()
    expect(op?.n ?? 0).toBe(0)

    // …so the cookie it was holding now names nobody. This is the session kill switch:
    // no token was revoked, the row it pointed at simply stopped existing.
    const after = await a.fetch('/api/list')
    expect(after.status).toBe(401)

    // AND THE NEIGHBOUR IS UNTOUCHED — the property this whole file exists for.
    expect(await rowsFor(b.householdId)).toBe(1)
    const bItems = (await (await b.fetch('/api/list')).json()) as { items?: unknown[] }
    expect(Array.isArray(bItems.items) ? bItems.items.length : 0).toBeGreaterThan(0)
  })

  it('cannot be done by a device token, whatever that device knows', async () => {
    const a = await household('leave-device')
    // A device credential is not the account: a tablet left on a counter cannot end the
    // household even if someone standing at it types the password correctly.
    //
    // WHAT THIS ACTUALLY PINS, since the difference matters and a green test that claims
    // too much is worse than none: the token is minted as an `agent` (the one kind a test
    // can mint in a line), and an agent is refused every non-GET centrally by route.ts.
    // Proven by experiment — removing `'operator'` from the handler leaves this case
    // green — so the 403 here is the read-only gate, and `authed(…, 'operator')` is the
    // SECOND, redundant lock rather than the one under test. Pinning the scope itself
    // would need a real kiosk token, which only the pairing-code flow produces.
    const mint = await a.fetch('/api/pair/devices', { method: 'POST', body: { mintAgent: true, label: 'Tablette' } })
    const { token } = (await mint.json()) as { token: string }
    const res = await anon('/api/household', {
      method: 'DELETE',
      body: { password: a.password, name: 'Maisonnée leave-device' },
      headers: { 'X-Device-Token': token },
    })
    expect(res.status).toBe(403)
    expect(await rowsFor(a.householdId)).toBe(1)
  })

  it('a second operator on the same household can still sign in — until the household goes', async () => {
    // Guarding the ORDER of the cascade rather than a policy: `operators` is deleted by
    // household_id, so a co-operator's row goes too. If that ever stopped being true,
    // a deleted household would leave a signed-in account pointing at nothing, which is
    // a much worse state than being signed out.
    const a = await household('leave-coop')
    const again = await login(a.email, a.password)
    expect((await again.fetch('/api/list')).status).toBe(200)

    expect((await del(a, { password: a.password, name: 'Maisonnée leave-coop' })).status).toBe(200)
    expect((await again.fetch('/api/list')).status).toBe(401)
  })
})
