import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household } from '../functions/test/d1'
import { AI_CALLS_PER_DAY, STRANGER_POOL_PER_DAY, UPLOAD_BYTES_PER_DAY, charge, strangerSpend, usageToday } from '../functions/_lib/usage'
import { runWithRequest } from '../functions/_lib/tz'
import { nowSec } from '../functions/_lib/ids'

// THE DAILY SPEND BOUND (Wave 5, migrations 0137 + 0139), in the real runtime.
//
// What a unit test cannot reach: the UPSERT is the whole mechanism — one statement that
// increments, resolves the household's TRUST from its operator rows, and returns the new
// total in the same breath — and whether that is atomic and scoped right is a fact about
// D1, not about the code. So is the strangers' pool, a sum across households.
//
// Trust is set here the way production sets it — on the operator row — never passed in:
// that is the point of 0139 (the old request-carried flag let a sandbox's paired tablet
// spend at a full household's ceiling).

const spend = <T>(householdId: string, fn: () => Promise<T>) => runWithRequest({ householdId }, fn)

// The harness has no mail wired, so signup stamps every operator verified (0138): a
// fresh household is 'household'. These two turn it into the other two kinds.
async function asSandbox(householdId: string): Promise<void> {
  await env.DB.prepare('UPDATE operators SET email = ? WHERE household_id = ?')
    .bind(`demo-${householdId.toLowerCase()}@babillard.invalid`, householdId)
    .run()
}
async function asUnverified(householdId: string): Promise<void> {
  await env.DB.prepare('UPDATE operators SET verified_at = NULL WHERE household_id = ?').bind(householdId).run()
}
// The pool is a sum across EVERY stranger in the database, and the d1 suite shares one;
// a test that measures it starts from a clean stranger slate.
async function clearStrangerSpend(): Promise<void> {
  await env.DB.prepare(`DELETE FROM usage_daily WHERE trust <> 'household'`).run()
}

describe('le budget quotidien', () => {
  it('counts per household, and one household cannot spend another’s budget', async () => {
    const a = await household('use-a', undefined, { empty: true })
    const b = await household('use-b', undefined, { empty: true })

    await spend(a.householdId, async () => {
      await charge(env, 'ai', 3)
      await charge(env, 'upload', 1_000)
    })
    await spend(b.householdId, () => charge(env, 'ai', 1))

    expect(await usageToday(env, a.householdId)).toEqual({ ai: 3, bytes: 1_000 })
    expect(await usageToday(env, b.householdId)).toEqual({ ai: 1, bytes: 0 })
  })

  it('refuses past the cap, and a SANDBOX hits its own much sooner', async () => {
    await clearStrangerSpend()
    const real = await household('use-real', undefined, { empty: true })
    const sandbox = await household('use-sandbox', undefined, { empty: true })
    await asSandbox(sandbox.householdId)

    // A sandbox's ceiling, reached exactly: the last allowed call is the one that lands
    // ON the limit, and the next is refused.
    const last = await spend(sandbox.householdId, () => charge(env, 'ai', AI_CALLS_PER_DAY.sandbox))
    expect(last).toMatchObject({ allowed: true, limit: AI_CALLS_PER_DAY.sandbox, trust: 'sandbox' })
    const over = await spend(sandbox.householdId, () => charge(env, 'ai', 1))
    expect(over.allowed).toBe(false)

    // The SAME spend is nothing to a real household — the point of two ceilings.
    const fine = await spend(real.householdId, () => charge(env, 'ai', AI_CALLS_PER_DAY.sandbox + 1))
    expect(fine).toMatchObject({ allowed: true, limit: AI_CALLS_PER_DAY.household, trust: 'household' })
  })

  it('an UNCONFIRMED household gets a visitor’s ceiling, and confirming lifts it the same day', async () => {
    // Red against 0137's rule (only a sandbox email is capped tightly): open signup would
    // hand a stranger the ceiling set for invited families.
    await clearStrangerSpend()
    const h = await household('use-unverified', undefined, { empty: true })
    await asUnverified(h.householdId)
    const at = await spend(h.householdId, () => charge(env, 'ai', AI_CALLS_PER_DAY.unverified))
    expect(at).toMatchObject({ allowed: true, trust: 'unverified', limit: AI_CALLS_PER_DAY.unverified })
    expect((await spend(h.householdId, () => charge(env, 'ai', 1))).allowed).toBe(false)

    // The link is clicked: the NEXT charge reads the new trust, with no wait for midnight.
    await env.DB.prepare('UPDATE operators SET verified_at = ? WHERE household_id = ?').bind(nowSec(), h.householdId).run()
    const after = await spend(h.householdId, () => charge(env, 'ai', 1))
    expect(after).toMatchObject({ allowed: true, trust: 'household', limit: AI_CALLS_PER_DAY.household })
  })

  it('strangers share ONE pool — and a confirmed family never draws from it', async () => {
    // Red against dropping the pool query: each stranger stays inside their own ceiling,
    // and together they pass the deployment's.
    await clearStrangerSpend()
    // Every OTHER stranger's day, as the rows their charges would have left: the pool is
    // a sum over rows, and twenty-odd real signups would only exercise signup's own rate
    // limit. Filled to HALF a visitor-afternoon short of the pool.
    const now = nowSec()
    const half = AI_CALLS_PER_DAY.sandbox / 2
    const others = STRANGER_POOL_PER_DAY.ai - half
    await env.DB.prepare(
      `INSERT INTO usage_daily (household_id, day, ai_calls, upload_bytes, trust, created_at, updated_at)
       VALUES ('pool-others-a', ?1, ?2, 0, 'sandbox', ?1, ?1), ('pool-others-b', ?1, ?3, 0, 'unverified', ?1, ?1)`,
    )
      .bind(now - 3600, Math.floor(others / 2), others - Math.floor(others / 2))
      .run()
    // A row from the day BEFORE is not today's pool: it must not count.
    await env.DB.prepare(
      `INSERT INTO usage_daily (household_id, day, ai_calls, upload_bytes, trust, created_at, updated_at)
       VALUES ('pool-yesterday', ?1, 999999, 0, 'sandbox', ?1, ?1)`,
    )
      .bind(now - 30 * 3600)
      .run()

    const visitor = await household('use-pool-visitor', undefined, { empty: true })
    await asUnverified(visitor.householdId)
    // Half their afternoon fills the pool exactly…
    const full = await spend(visitor.householdId, () => charge(env, 'ai', half))
    expect(full).toMatchObject({ allowed: true, trust: 'unverified' })
    // …and one call more is refused FOR THE POOL, though well inside their own ceiling.
    const past = await spend(visitor.householdId, () => charge(env, 'ai', 1))
    expect(past).toMatchObject({ allowed: false, pool: true })
    expect(past.used).toBeLessThan(past.limit)
    // The nightly reading: today's strangers, not yesterday's row.
    expect((await strangerSpend(env)).ai).toBe(STRANGER_POOL_PER_DAY.ai + 1)

    // A confirmed family is untouched by a full pool.
    const family = await household('use-pool-family', undefined, { empty: true })
    expect((await spend(family.householdId, () => charge(env, 'ai', 1))).allowed).toBe(true)
    await clearStrangerSpend()
  })

  it('charges a REFUSED call too — the bound cannot be walked past by racing it', async () => {
    await clearStrangerSpend()
    const h = await household('use-race', undefined, { empty: true })
    await asSandbox(h.householdId)
    await spend(h.householdId, () => charge(env, 'upload', UPLOAD_BYTES_PER_DAY.sandbox))
    const refused = await spend(h.householdId, () => charge(env, 'upload', 10))
    expect(refused.allowed).toBe(false)
    // The refused bytes are still counted. That is deliberate (see `charge`): a
    // check-then-charge ordering would let two simultaneous requests both read « just
    // under » and both proceed.
    const after = await usageToday(env, h.householdId)
    expect(after.bytes).toBe(UPLOAD_BYTES_PER_DAY.sandbox + 10)
    await clearStrangerSpend()
  })

  it('concurrent charges do not lose each other (the UPSERT is atomic, not read-then-write)', async () => {
    const h = await household('use-concurrent', undefined, { empty: true })
    // Twenty at once. A read-modify-write would drop most of them; the single-statement
    // UPSERT cannot. This is the assertion the whole design rests on and the one no unit
    // test can make.
    await spend(h.householdId, () => Promise.all(Array.from({ length: 20 }, () => charge(env, 'ai', 1))))
    expect((await usageToday(env, h.householdId)).ai).toBe(20)
  })

  it('charges nothing outside a request — the cron is not a visitor', async () => {
    const h = await household('use-cron', undefined, { empty: true })
    // No `runWithRequest`: there is no household in scope, which is the nightly cron's
    // real situation. It must be allowed and must write no row.
    const verdict = await charge(env, 'ai', 5)
    expect(verdict.allowed).toBe(true)
    expect(await usageToday(env, h.householdId)).toEqual({ ai: 0, bytes: 0 })
  })
})
