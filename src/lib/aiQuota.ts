// The two spent allowances, recognised by the words the server sends — ONE spelling for
// the Worker (functions/_lib/ai.ts attemptReason) and the phone (the AI-error toast).
//
// « quota »  — the ACCOUNT's free Workers AI allowance (10 000 neurons a day, shared by
//              every household and every model; back at 00:00 UTC). The binding throws
//              Cloudflare's own text (« 4006: you have used up your daily free
//              allocation… »); the REST API spells it 3036 « Account limited ».
// « budget » — the HOUSEHOLD's own daily ceiling (functions/_lib/usage.ts,
//              AiBudgetError: « AI daily budget spent (n/limit) »; back at its midnight).
const ACCOUNT_QUOTA = /\b(?:4006|3036)\b|daily free allocation|used up your daily|account limited/i
const HOUSEHOLD_BUDGET = /AI daily budget spent/i

export const isAccountQuotaMessage = (message: string): boolean => ACCOUNT_QUOTA.test(message)

export type AiSpent = 'quota' | 'budget' | null
export function aiSpentKind(message: string): AiSpent {
  return ACCOUNT_QUOTA.test(message) ? 'quota' : HOUSEHOLD_BUDGET.test(message) ? 'budget' : null
}
