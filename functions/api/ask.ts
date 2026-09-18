import { badRequest, ok, readJson, withAiError } from '../_lib/json'
import { authed } from '../_lib/route'
import { answerQuestion, resolveLang, type AiReport } from '../_lib/ai'
import { aiUsable } from '../_lib/aiPref'
import { localDayStart } from '../_lib/ids'
import { gatherAskSnapshot } from '../_lib/askSnapshot'
import { buildAskPromptLines } from '../_lib/askContext'

// #12 / E-22 — natural-language Q&A over the household's OWN data. The search box
// (and the board mic « Demande à la maison ») can ask "qu'est-ce qu'on mange
// vendredi ?" / "quel est le numéro du vétérinaire ?"; we gather a compact, DATED
// snapshot (suppers, events incl. recurring, birthdays, the list, chores, notes,
// Le cercle contacts + businesses, carnet next-dues) and let answerQuestion phrase
// a calm reply tagged with the domain it reasoned over (the `kind`, which the UI
// turns into a category icon). One inference per ask — never on a render loop.
// Read-only: this never writes (capture stays the write spine).
//
// The three layers are separate on purpose, and each has its own test:
//   · _lib/askSnapshot.ts — the DB read + its windows (shared with the MCP server's
//     `household_snapshot` tool, so "what the household is right now" has ONE answer)
//   · _lib/askContext.ts  — pure formatting / recur expansion / caps, FR + EN
//   · here                — the one inference, and the degrade when AI is off
export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ question?: string }>(ctx.request)
  const question = (body?.question ?? '').trim()
  if (!question) return badRequest('question required')

  // AI off (binding unset OR household switched it off) → tell the client up front
  // so the caller (search box / AskSheet) hides "Ask", skipping the snapshot
  // gathering below entirely.
  if (!(await aiUsable(ctx.env, actor))) return ok({ answer: null, kind: 'none', degraded: true })

  const lang = resolveLang(ctx.env, ctx.request)
  const today = localDayStart(new Date(Date.now()))
  const snapshot = await gatherAskSnapshot(ctx.env, actor.householdId, today)
  const lines = buildAskPromptLines(snapshot, lang)

  const report: AiReport = { error: null }
  const result = await answerQuestion(ctx.env, question, lines.join('\n'), lang, report)
  // result null + AI present → a real failure (report.error set) → client shows the
  // "couldn't answer" + suggestions; result null + no AI → degraded path.
  return withAiError(ok({ answer: result?.answer ?? null, kind: result?.kind ?? 'none', degraded: !ctx.env.AI }), report)
})
