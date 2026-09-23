import type { Env } from './env'
import { charge } from './usage'

/**
 * THE ONE PLACE A MODEL IS RUN (STATE.md §4-K Wave 5).
 *
 * Every Workers AI call in this app goes through here: eleven in `_lib/ai.ts` (capture
 * classification, recipe drafting/structuring, the vision reader, suggestions, the ask
 * answer…), the mot transcript, and `/api/transcribe`. Before this existed there were
 * thirteen `env.AI.run(...)` sites and no seam — so there was nowhere to put a spend
 * bound except thirteen copies of it, which is the fork shape this codebase keeps paying
 * for (see `write-owners.test.ts` for the same lesson about writes).
 *
 * `usageRule.test.ts` keeps it that way: a raw `env.AI.run(` anywhere under `functions/`
 * fails the build.
 *
 * WHAT IT DOES, and deliberately all it does:
 *   · charges ONE AI call against the household's daily budget (`_lib/usage.ts`);
 *   · throws `AiBudgetError` when that budget is spent, so the call never reaches
 *     Cloudflare — the point is not to report the overspend, it is not to make it.
 *
 * It does NOT catch model errors, retry, or reshape the response. Every caller already
 * has its own error handling (`AiReport`, the degraded paths), and taking that over here
 * would make this a second AI layer rather than a meter.
 *
 * WHICH MEANS A SPENT BUDGET IS ALREADY HANDLED, and that is the design rather than an
 * accident: every caller treats a throw as « the model did not answer » and takes the
 * path it already has for an unwired `AI` binding — the capture falls back to the manual
 * type-picker, the recipe reader says so, and `transcribe` journals it. The household
 * sees an app that is briefly AI-less, which is a state this app has always known how to
 * be, with the reason in the AI error journal (`app_health`) in plain numbers.
 *
 * Outside a request there is no household in scope and `charge` is a no-op — the nightly
 * cron's own work is not a visitor's spend.
 */
export class AiBudgetError extends Error {
  readonly used: number
  readonly limit: number
  constructor(used: number, limit: number) {
    super(`AI daily budget spent (${used}/${limit})`)
    this.name = 'AiBudgetError'
    this.used = used
    this.limit = limit
  }
}

type AiRunner = { run: (model: string, input: unknown) => Promise<unknown> }

export async function runModel(env: Env, model: string, input: unknown): Promise<unknown> {
  const verdict = await charge(env, 'ai', 1)
  if (!verdict.allowed) throw new AiBudgetError(verdict.used, verdict.limit)
  // Callers reach here only when `env.AI` is wired — each checks its own binding first
  // and takes its degraded path when it is not (`_lib/env.ts`'s optional-binding rule).
  return (env.AI as unknown as AiRunner).run(model, input)
}
