import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household } from '../functions/test/d1'
import { AI_CALLS_PER_DAY, UPLOAD_BYTES_PER_DAY, charge, usageToday } from '../functions/_lib/usage'
import { runWithRequest } from '../functions/_lib/tz'

// THE DAILY SPEND BOUND (Wave 5, migration 0137), in the real runtime.
//
// What a unit test cannot reach: the UPSERT is the whole mechanism — one statement that
// increments and returns the new total in the same breath — and whether it is atomic is a
// fact about D1, not about the code. So is « does the row actually land against the right
// household ». Both are checked here against a real database.

const spend = <T>(householdId: string, sandbox: boolean, fn: () => Promise<T>) =>
  runWithRequest({ householdId, sandbox }, fn)

describe('le budget quotidien', () => {
  it('counts per household, and one household cannot spend another’s budget', async () => {
    const a = await household('use-a')
    const b = await household('use-b')

    await spend(a.householdId, false, async () => {
      await charge(env, 'ai', 3)
      await charge(env, 'upload', 1_000)
    })
    await spend(b.householdId, false, () => charge(env, 'ai', 1))

    expect(await usageToday(env, a.householdId)).toEqual({ ai: 3, bytes: 1_000 })
    expect(await usageToday(env, b.householdId)).toEqual({ ai: 1, bytes: 0 })
  })

  it('refuses past the cap, and a SANDBOX hits its own much sooner', async () => {
    const real = await household('use-real')
    const sandbox = await household('use-sandbox')

    // A sandbox's ceiling, reached exactly: the last allowed call is the one that lands
    // ON the limit, and the next is refused.
    const last = await spend(sandbox.householdId, true, () => charge(env, 'ai', AI_CALLS_PER_DAY.sandbox))
    expect(last).toMatchObject({ allowed: true, limit: AI_CALLS_PER_DAY.sandbox })
    const over = await spend(sandbox.householdId, true, () => charge(env, 'ai', 1))
    expect(over.allowed).toBe(false)

    // The SAME spend is nothing to a real household — the point of two ceilings.
    const fine = await spend(real.householdId, false, () => charge(env, 'ai', AI_CALLS_PER_DAY.sandbox + 1))
    expect(fine).toMatchObject({ allowed: true, limit: AI_CALLS_PER_DAY.household })
  })

  it('charges a REFUSED call too — the bound cannot be walked past by racing it', async () => {
    const h = await household('use-race')
    await spend(h.householdId, true, () => charge(env, 'upload', UPLOAD_BYTES_PER_DAY.sandbox))
    const refused = await spend(h.householdId, true, () => charge(env, 'upload', 10))
    expect(refused.allowed).toBe(false)
    // The refused bytes are still counted. That is deliberate (see `charge`): a
    // check-then-charge ordering would let two simultaneous requests both read « just
    // under » and both proceed.
    const after = await usageToday(env, h.householdId)
    expect(after.bytes).toBe(UPLOAD_BYTES_PER_DAY.sandbox + 10)
  })

  it('concurrent charges do not lose each other (the UPSERT is atomic, not read-then-write)', async () => {
    const h = await household('use-concurrent')
    // Twenty at once. A read-modify-write would drop most of them; the single-statement
    // UPSERT cannot. This is the assertion the whole design rests on and the one no unit
    // test can make.
    await spend(h.householdId, false, () => Promise.all(Array.from({ length: 20 }, () => charge(env, 'ai', 1))))
    expect((await usageToday(env, h.householdId)).ai).toBe(20)
  })

  it('charges nothing outside a request — the cron is not a visitor', async () => {
    const h = await household('use-cron')
    // No `runWithRequest`: there is no household in scope, which is the nightly cron's
    // real situation. It must be allowed and must write no row.
    const verdict = await charge(env, 'ai', 5)
    expect(verdict.allowed).toBe(true)
    expect(await usageToday(env, h.householdId)).toEqual({ ai: 0, bytes: 0 })
  })
})
