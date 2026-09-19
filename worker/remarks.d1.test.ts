import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household } from '../functions/test/d1'

// « Les remarques » through the REAL Worker: the route table, authed(), the two-table
// write, and the human verdict that is the whole point of the loop.
//
// What this file is really guarding is the JOURNAL. The tempting shape was one row with
// a JSON array, and the reason it was rejected is that an explanation must never be
// overwritten — so the test that matters here is the one where a remark is fixed, sent
// back, and fixed again, and ALL of it is still readable afterwards.

interface Remark {
  id: string
  kind: string
  title: string
  body: string
  status: string
  seen_path: string | null
  seen_build: string | null
  events: { kind: string; text: string; sha: string | null; author_member_id: string | null }[]
}

const file = (s: Awaited<ReturnType<typeof household>>, body: Record<string, unknown>) =>
  s.fetch('/api/remarks', { method: 'POST', body })

const list = async (s: Awaited<ReturnType<typeof household>>) =>
  ((await (await s.fetch('/api/remarks')).json()) as { remarks: Remark[] }).remarks

describe('les remarques', () => {
  it('files one, keeps the context, and opens the journal', async () => {
    const a = await household('rm-file')
    const res = await file(a, {
      kind: 'bug',
      title: 'Les « ## » partent à l’épicerie',
      body: 'Vu en ouvrant la recette.',
      help_key: 'kitchen.recipes',
      seen_path: '/kitchen?sub=recettes',
      seen_build: 'a3f21c9bb',
      context: { theme: 'night', surface: 'kiosk' },
    })
    expect(res.status).toBe(200)

    const [r] = await list(a)
    expect(r.status).toBe('open')
    expect(r.kind).toBe('bug')
    expect(r.seen_build).toBe('a3f21c9bb')
    expect(r.seen_path).toBe('/kitchen?sub=recettes')
    // The opening entry exists from the start, so the journal is never empty.
    expect(r.events.map((e) => e.kind)).toEqual(['filed'])
  })

  it('defaults an unknown kind to a bug rather than refusing the report', async () => {
    // Someone trying to tell us something broke must not be stopped by a bad enum.
    const a = await household('rm-kind')
    await file(a, { kind: 'catastrophe', title: 'Quelque chose' })
    expect((await list(a))[0].kind).toBe('bug')
  })

  it('refuses a remark with no title', async () => {
    const a = await household('rm-empty')
    expect((await file(a, { title: '   ' })).status).toBe(400)
  })

  it('KEEPS EVERY EXPLANATION across fix → not fixed → fix again', async () => {
    // The reason this is two tables. A journal_json read-modify-write from the deploy
    // callback — which has no session, no transaction and a real chance of two
    // concurrent POSTs — would lose one of these, and the thing lost would be an
    // explanation. Which is the one thing the feature exists to keep.
    const a = await household('rm-journal')
    await file(a, { title: 'La liste saute' })
    const id = (await list(a))[0].id
    // EVERY event in this test lands in the SAME SECOND — which is the point. Timestamps
    // here are unix seconds, so a journal ordered on created_at alone comes back
    // shuffled (it did: « shipped, shipped, filed, reopened, confirmed »). The handler
    // tiebreaks on rowid, i.e. insertion order, and this is what holds that.
    const now = Math.floor(Date.now() / 1000)

    // Two deploys claim it, with different commits (only the pipeline writes these).
    await env.DB.prepare(
      "INSERT INTO remark_events (id, remark_id, kind, text, sha, author_member_id, created_at) VALUES ('ev_s1', ?1, 'shipped', 'première tentative', 'aaaaaaa', NULL, ?2)",
    )
      .bind(id, now)
      .run()
    await env.DB.prepare("UPDATE remarks SET status = 'shipped' WHERE id = ?1").bind(id).run()

    // Marc says no, with his own words.
    const no = await a.fetch('/api/remarks', {
      method: 'PATCH',
      body: { id, action: 'reopen', note: 'ça le fait encore avec les demi-portions' },
    })
    expect(no.status).toBe(200)
    expect((await list(a))[0].status).toBe('open')

    await env.DB.prepare(
      "INSERT INTO remark_events (id, remark_id, kind, text, sha, author_member_id, created_at) VALUES ('ev_s2', ?1, 'shipped', 'deuxième tentative', 'bbbbbbb', NULL, ?2)",
    )
      .bind(id, now)
      .run()
    await env.DB.prepare("UPDATE remarks SET status = 'shipped' WHERE id = ?1").bind(id).run()

    const yes = await a.fetch('/api/remarks', { method: 'PATCH', body: { id, action: 'confirm' } })
    expect(yes.status).toBe(200)

    const r = (await list(a))[0]
    expect(r.status).toBe('confirmed')
    expect(r.events.map((e) => e.kind)).toEqual(['filed', 'shipped', 'reopened', 'shipped', 'confirmed'])
    // Both explanations AND the rejection survived, in order.
    const said = r.events.map((e) => e.text).filter(Boolean)
    expect(said).toEqual(['première tentative', 'ça le fait encore avec les demi-portions', 'deuxième tentative'])
    expect(r.events.filter((e) => e.sha).map((e) => e.sha)).toEqual(['aaaaaaa', 'bbbbbbb'])
  })

  it('never lets a machine event wear a face', async () => {
    // author_member_id is NULL on 'shipped' by schema and by the endpoint. A deploy is
    // not a person, and a journal that let it borrow one would be lying in the calmest
    // possible way.
    const a = await household('rm-face')
    await file(a, { title: 'Quelque chose' })
    const id = (await list(a))[0].id
    await env.DB.prepare(
      "INSERT INTO remark_events (id, remark_id, kind, text, sha, author_member_id, created_at) VALUES ('ev_face', ?1, 'shipped', 'x', 'ccccccc', NULL, ?2)",
    )
      .bind(id, Math.floor(Date.now() / 1000))
      .run()
    const shipped = (await list(a))[0].events.find((e) => e.kind === 'shipped')!
    expect(shipped.author_member_id).toBeNull()
  })

  it('the ship-once index refuses the same commit twice', async () => {
    // The deploy callback's idempotency, enforced by the database rather than by the
    // handler remembering to check. A re-run of the workflow must write nothing.
    const a = await household('rm-once')
    await file(a, { title: 'Quelque chose' })
    const id = (await list(a))[0].id
    const at = Math.floor(Date.now() / 1000)
    const ins = (evId: string) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO remark_events (id, remark_id, kind, text, sha, author_member_id, created_at)
         VALUES (?1, ?2, 'shipped', '', 'deadbee', NULL, ?3)`,
      )
        .bind(evId, id, at)
        .run()
    await ins('ev_once_1')
    const second = await ins('ev_once_2')
    expect(second.meta.changes).toBe(0)
    expect((await list(a))[0].events.filter((e) => e.kind === 'shipped')).toHaveLength(1)

    // …but a DIFFERENT commit on the same remark is allowed: a second fix attempt is
    // the normal case, and over-tightening this is how the second explanation is lost.
    await env.DB.prepare(
      "INSERT INTO remark_events (id, remark_id, kind, text, sha, author_member_id, created_at) VALUES ('ev_once_3', ?1, 'shipped', '', 'feedfac', NULL, ?2)",
    )
      .bind(id, at + 1)
      .run()
    expect((await list(a))[0].events.filter((e) => e.kind === 'shipped')).toHaveLength(2)
  })

  it('a deleted remark reads as gone, and stays gone through a poll', async () => {
    const a = await household('rm-del')
    await file(a, { title: 'À supprimer' })
    const id = (await list(a))[0].id
    expect((await a.fetch('/api/remarks', { method: 'DELETE', body: { id } })).status).toBe(200)
    expect(await list(a)).toHaveLength(0)
    // Soft, so the row is still there — which is what lets the deploy callback answer
    // « inconnue » instead of resurrecting it.
    const row = await env.DB.prepare('SELECT deleted_at FROM remarks WHERE id = ?1').bind(id).first<{ deleted_at: number }>()
    expect(row?.deleted_at).toBeGreaterThan(0)
    // …and acting on a deleted remark is a 404, not a silent success.
    expect((await a.fetch('/api/remarks', { method: 'PATCH', body: { id, action: 'confirm' } })).status).toBe(404)
  })

  it("one household never sees another's remarks", async () => {
    const a = await household('rm-iso-a')
    const b = await household('rm-iso-b')
    await file(b, { title: 'Chez B seulement' })
    expect(await list(a)).toHaveLength(0)
    expect((await list(b)).map((r) => r.title)).toEqual(['Chez B seulement'])
  })

  it('refuses a media_kind without a key, and a key without a kind', async () => {
    // The pair is an invariant, and data_invariants now checks it against live rows —
    // so the endpoint must not be the thing that creates a violation.
    const a = await household('rm-media')
    expect((await file(a, { title: 'x', media_kind: 'image' })).status).toBe(400)
    expect((await file(a, { title: 'x', media_kind: 'bidon', media_key: 'rm_abc' })).status).toBe(400)
  })
})
