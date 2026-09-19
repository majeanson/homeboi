import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household } from '../functions/test/d1'
import { checkInvariants, loadSchema, INVARIANTS, summarize, type InvariantReport } from '../functions/_lib/invariants'

// THE RITUAL, AS A TEST FILE.
//
// CLAUDE.md's standing rule: « a new guard must be run against the bug it was written
// for, before it is trusted », and it earns that rule with a story —
// nested-interactive.test.ts reported GREEN over exactly the defect it was written to
// catch, because it walked JSX by indentation and prettier had moved the tag.
//
// A data-invariant scan is MORE prone to that failure than a source grep, not less: a
// scoped SELECT that finds nothing looks identical whether the law holds, the WHERE is
// wrong, the column was renamed, or the scope clause silently matched no rows at all.
// « I looked and it is fine » and « I could not look » are the same shape on screen.
//
// So every invariant here is planted before it is believed. Each test writes the real
// broken row into the real D1, watches that ONE invariant go red and name the row, and
// asserts every OTHER invariant stayed quiet — because a scan that reddens everything
// at once is a scan nobody reads.

const nowSec = () => Math.floor(Date.now() / 1000)
const only = (reports: InvariantReport[], key: string) => reports.find((r) => r.key === key)!
const violatedKeys = (reports: InvariantReport[]) =>
  reports.filter((r) => r.outcome.status === 'violated').map((r) => r.key)

/** Every invariant, for one household, as { key → outcome }. */
async function check(householdId: string) {
  const { reports } = await checkInvariants(env.DB, householdId)
  return reports
}

describe('data invariants', () => {
  it('a fresh household breaks nothing, and nothing is silently unchecked', async () => {
    const a = await household('inv-clean')
    const reports = await check(a.householdId)

    expect(violatedKeys(reports)).toEqual([])
    expect(reports).toHaveLength(INVARIANTS.length)

    // THE HALF THAT MATTERS. A green report is worthless if the checks never ran — and
    // 'skipped' is precisely how this file refuses to pretend otherwise. On a real
    // schema with every migration applied, all of them must have been able to look.
    const skipped = reports.filter((r) => r.outcome.status === 'skipped')
    expect(skipped.map((r) => `${r.key}: ${r.outcome.status === 'skipped' ? r.outcome.reason : ''}`)).toEqual([])
  })

  it('table-scope agrees with the build guard — on the LIVE schema, not on the migration files', async () => {
    // demoHousehold.test.ts asserts this by replaying the .sql files. This asserts it
    // against the database those files actually produced. The two can disagree (a
    // migration that half-applied, a table created outside a migration), and when they
    // do, this is the one that is telling the truth.
    const a = await household('inv-scope')
    const out = only(await check(a.householdId), 'table-scope').outcome
    expect(out.status, JSON.stringify(out)).toBe('ok')
  })

  it('catches a media_key with no media_kind — the documented pair, broken', async () => {
    const a = await household('inv-media')
    await env.DB.prepare(
      "INSERT INTO notes (id, household_id, text, created_at, media_key) VALUES ('nt_orphan', ?1, 'un mot', ?2, 'nm_blob_sans_genre')",
    )
      .bind(a.householdId, nowSec())
      .run()

    const reports = await check(a.householdId)
    expect(violatedKeys(reports)).toEqual(['media-pair'])
    const out = only(reports, 'media-pair').outcome
    expect(out.status).toBe('violated')
    if (out.status !== 'violated') throw new Error('unreachable')
    expect(out.total).toBe(1)
    expect(out.violations[0]).toMatchObject({ table: 'notes', id: 'nt_orphan' })
    expect(out.violations[0].detail).toContain('nm_blob_sans_genre')
  })

  it('catches a media_kind with no media_key — the pair broken the OTHER way', async () => {
    // Both directions, because a one-sided WHERE is the likeliest way this check rots
    // and it would still pass the test above.
    const a = await household('inv-media2')
    await env.DB.prepare(
      "INSERT INTO notes (id, household_id, text, created_at, media_kind) VALUES ('nt_kindless', ?1, 'un mot', ?2, 'image')",
    )
      .bind(a.householdId, nowSec())
      .run()

    const out = only(await check(a.householdId), 'media-pair').outcome
    expect(out.status).toBe('violated')
    if (out.status !== 'violated') throw new Error('unreachable')
    expect(out.violations[0].detail).toContain('sans clé')
  })

  it('catches a scene_key on something that is not a drawing', async () => {
    const a = await household('inv-scene')
    await env.DB.prepare(
      "INSERT INTO notes (id, household_id, text, created_at, media_kind, media_key, scene_key) VALUES ('nt_scene', ?1, 'un mot', ?2, 'audio', 'nm_clip', 'sc_scene')",
    )
      .bind(a.householdId, nowSec())
      .run()

    const reports = await check(a.householdId)
    expect(violatedKeys(reports)).toEqual(['scene-key-drawing'])
    const out = only(reports, 'scene-key-drawing').outcome
    if (out.status !== 'violated') throw new Error(JSON.stringify(out))
    expect(out.violations[0].detail).toContain('audio')
  })

  it('catches an empty string in a NOT NULL JSON column', async () => {
    // The DEFAULT protects an INSERT that omits the column. It does nothing about an
    // UPDATE that writes '' — which is exactly what an over-eager form posts.
    const a = await household('inv-json')
    const t = nowSec()
    await env.DB.prepare(
      "INSERT INTO recipes (id, household_id, title, created_at, updated_at) VALUES ('rc_json', ?1, 'Tarte', ?2, ?2)",
    )
      .bind(a.householdId, t)
      .run()
    await env.DB.prepare("UPDATE recipes SET ingredients_json = '' WHERE id = 'rc_json'").run()

    const reports = await check(a.householdId)
    expect(violatedKeys(reports)).toEqual(['json-columns'])
    const out = only(reports, 'json-columns').outcome
    if (out.status !== 'violated') throw new Error(JSON.stringify(out))
    expect(out.violations[0].detail).toContain('ingredients_json')
  })

  it('catches JSON of the WRONG CONTAINER — an object where an array was promised', async () => {
    // Valid JSON, so json_valid() alone would call this fine. The container is the
    // half that makes `.map()` throw at the call site.
    const a = await household('inv-json2')
    const t = nowSec()
    await env.DB.prepare(
      "INSERT INTO recipes (id, household_id, title, created_at, updated_at, steps_json) VALUES ('rc_obj', ?1, 'Tarte', ?2, ?2, '{\"a\":1}')",
    )
      .bind(a.householdId, t)
      .run()

    const out = only(await check(a.householdId), 'json-columns').outcome
    if (out.status !== 'violated') throw new Error(JSON.stringify(out))
    expect(out.violations[0].detail).toContain('steps_json')
  })

  it('catches a member ref pointing at nobody', async () => {
    // `list_items.added_by` and NOT `notes.member_id`, and the reason is a finding in
    // itself: the first draft of this test used notes.member_id and D1 threw
    // FOREIGN KEY constraint failed. Most columns this repo DOCUMENTS as soft refs —
    // « soft ref: kept if the member goes », written in the migration — actually carry
    // `REFERENCES members(id)`. `added_by` arrived by ALTER TABLE (0011), which cannot
    // add a constraint, so it is one of the few that genuinely is one.
    const a = await household('inv-ref')
    await env.DB.prepare(
      "INSERT INTO list_items (id, household_id, text, created_at, added_by) VALUES ('li_ghost', ?1, 'Lait', ?2, 'mb_parti')",
    )
      .bind(a.householdId, nowSec())
      .run()

    const reports = await check(a.householdId)
    expect(violatedKeys(reports)).toEqual(['member-refs'])
    const out = only(reports, 'member-refs').outcome
    if (out.status !== 'violated') throw new Error(JSON.stringify(out))
    expect(out.violations[0]).toMatchObject({ table: 'list_items', id: 'li_ghost' })
    expect(out.violations[0].detail).toContain('mb_parti')
  })

  it("catches a member ref pointing at ANOTHER household's member", async () => {
    // The nastier half: the id resolves, so a bare `EXISTS (SELECT 1 FROM members …)`
    // without the household clause would call this clean. That is a tenant leak
    // wearing a valid foreign key.
    const a = await household('inv-ref-a')
    const b = await household('inv-ref-b')
    const other = await env.DB.prepare('SELECT id FROM members WHERE household_id = ?1 LIMIT 1')
      .bind(b.householdId)
      .first<{ id: string }>()
    expect(other?.id, "household B should have seeded at least one member").toBeTruthy()

    await env.DB.prepare(
      "INSERT INTO notes (id, household_id, text, created_at, member_id) VALUES ('nt_cross', ?1, 'un mot', ?2, ?3)",
    )
      .bind(a.householdId, nowSec(), other!.id)
      .run()

    const out = only(await check(a.householdId), 'member-refs').outcome
    if (out.status !== 'violated') throw new Error(JSON.stringify(out))
    expect(out.violations[0].id).toBe('nt_cross')
  })

  it('catches an expired flyer deal still waiting to be bought', async () => {
    const a = await household('inv-deal')
    await env.DB.prepare(
      `INSERT INTO list_items (id, household_id, text, created_at, deal_json)
       VALUES ('li_stale', ?1, 'Yogourt', ?2, '{"validTo":"2020-01-05"}')`,
    )
      .bind(a.householdId, nowSec())
      .run()

    const reports = await check(a.householdId)
    expect(violatedKeys(reports)).toEqual(['expired-deals'])
    const out = only(reports, 'expired-deals').outcome
    if (out.status !== 'violated') throw new Error(JSON.stringify(out))
    expect(out.violations[0].detail).toContain('Yogourt')
  })

  it('does NOT flag a deal that is still good, nor one already checked off', async () => {
    // The other half of the ritual. A guard that reddens on a healthy row costs more
    // than it saves — people stop reading it, which is how the real one gets missed.
    const a = await household('inv-deal-ok')
    const future = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)
    await env.DB.prepare(
      `INSERT INTO list_items (id, household_id, text, created_at, deal_json) VALUES ('li_good', ?1, 'Pain', ?2, ?3)`,
    )
      .bind(a.householdId, nowSec(), JSON.stringify({ validTo: future }))
      .run()
    await env.DB.prepare(
      `INSERT INTO list_items (id, household_id, text, created_at, checked_at, deal_json)
       VALUES ('li_bought', ?1, 'Miel', ?2, ?2, '{"validTo":"2020-01-05"}')`,
    )
      .bind(a.householdId, nowSec())
      .run()

    expect(violatedKeys(await check(a.householdId))).toEqual([])
  })

  it('catches two list lines fighting over one hand-placed position', async () => {
    const a = await household('inv-pos')
    const t = nowSec()
    await env.DB.batch([
      env.DB.prepare("INSERT INTO list_items (id, household_id, text, created_at, position) VALUES ('li_p1', ?1, 'Lait', ?2, 3)").bind(a.householdId, t),
      env.DB.prepare("INSERT INTO list_items (id, household_id, text, created_at, position) VALUES ('li_p2', ?1, 'Oeufs', ?2, 3)").bind(a.householdId, t),
      // NULL is « never hand-placed » (mig 0078) — several of those is the normal state
      // of a list nobody has dragged, and must not be a violation.
      env.DB.prepare("INSERT INTO list_items (id, household_id, text, created_at) VALUES ('li_p3', ?1, 'Beurre', ?2)").bind(a.householdId, t),
      env.DB.prepare("INSERT INTO list_items (id, household_id, text, created_at) VALUES ('li_p4', ?1, 'Farine', ?2)").bind(a.householdId, t),
    ])

    const reports = await check(a.householdId)
    expect(violatedKeys(reports)).toEqual(['list-positions'])
    const out = only(reports, 'list-positions').outcome
    if (out.status !== 'violated') throw new Error(JSON.stringify(out))
    expect(out.total).toBe(1)
    expect(out.violations[0].detail).toContain('position 3')
  })

  it('catches a row modified before it existed', async () => {
    const a = await household('inv-time')
    const t = nowSec()
    await env.DB.prepare(
      "INSERT INTO recipes (id, household_id, title, created_at, updated_at) VALUES ('rc_time', ?1, 'Soupe', ?2, ?3)",
    )
      .bind(a.householdId, t, t - 600)
      .run()

    const reports = await check(a.householdId)
    expect(violatedKeys(reports)).toEqual(['timestamps'])
    const out = only(reports, 'timestamps').outcome
    if (out.status !== 'violated') throw new Error(JSON.stringify(out))
    expect(out.violations[0]).toMatchObject({ table: 'recipes', id: 'rc_time' })
  })

  it('is SCOPED: one household never sees another household\'s breakage', async () => {
    // The single most important assertion in this file. A scan that forgets its scope
    // still finds every real violation — it just also hands household A a list of
    // household B's rows, by id. It would look like a working guard right up until it
    // was read.
    const a = await household('inv-iso-a')
    const b = await household('inv-iso-b')
    await env.DB.prepare(
      "INSERT INTO notes (id, household_id, text, created_at, media_key) VALUES ('nt_b_only', ?1, 'chez B', ?2, 'nm_b')",
    )
      .bind(b.householdId, nowSec())
      .run()

    expect(violatedKeys(await check(a.householdId))).toEqual([])

    const bReports = await check(b.householdId)
    expect(violatedKeys(bReports)).toEqual(['media-pair'])
    const out = only(bReports, 'media-pair').outcome
    if (out.status !== 'violated') throw new Error(JSON.stringify(out))
    expect(out.violations.map((v) => v.id)).toEqual(['nt_b_only'])
  })

  it('reads the live schema, and the summary names what broke', async () => {
    const a = await household('inv-sum')
    const schema = await loadSchema(env.DB)
    expect(schema.size).toBeGreaterThan(50)
    expect(schema.get('notes')?.columns.has('media_kind')).toBe(true)
    // No internal bookkeeping tables leak into the scan.
    expect([...schema.keys()].filter((n) => n.startsWith('sqlite_') || n.startsWith('_cf'))).toEqual([])

    await env.DB.prepare(
      "INSERT INTO notes (id, household_id, text, created_at, media_key) VALUES ('nt_sum', ?1, 'un mot', ?2, 'nm_x')",
    )
      .bind(a.householdId, nowSec())
      .run()
    const text = summarize(await checkInvariants(env.DB, a.householdId))
    expect(text).toContain('nt_sum')
    expect(text).toContain('1 invariant(s) brisé(s)')
  })
})
