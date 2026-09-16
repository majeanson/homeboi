import type { Env } from './env'
import { dumpHousehold } from './takeout'
import { countDemoSandboxes, countStaleDemoSandboxes, sweepExpiredDemoSandboxes } from './demoHousehold'
import { mailEnabled, sendMail, type Mail } from './mail'
import { localDayOfWeek } from './ids'

// The nightly cron, as one function with a REPORT (STATE.md §4-L, item L7).
//
// Until 2026-09-16 the cron backed every household up to R2 and logged failures to a
// console nobody opens, and the sandbox sweep ran only on a demo mint — which is
// exactly how it stayed broken from migration 0102 to the day the real-runtime harness
// first ran (L3). Two changes:
//   1. the cron ALSO sweeps expired sandboxes (up to SWEEP_LIMIT a night), and counts
//      the ones older than the TTL that SURVIVED it — `sandboxesStale > 0` is the
//      "the sweep is broken again" signal, and the one number this file exists for;
//   2. it TELLS someone: one email through the mail seam to ALERT_EMAIL when anything
//      failed or a stale sandbox survived — and every Monday a one-paragraph
//      « Babillard va bien » digest, so the alert channel is itself exercised weekly (an
//      alert path never fired is the sweep bug in a new coat). ALERT_EMAIL unset, or
//      mail not wired → the report goes to the log only, and /api/health says `alerts:
//      false` so the gap is visible rather than silent.
//
// Deliberately NOT a dashboard: a household app for one family does not need graphs
// of itself. One line when something is wrong; one paragraph a week that it is not.

export const BACKUP_KEEP = 14
export const SWEEP_LIMIT = 50

export interface NightlyReport {
  at: number // unix seconds
  households: number
  backed: number
  failed: { id: string; error: string }[]
  noBucket: boolean
  sandboxesSwept: number
  sandboxesAlive: number
  sandboxesStale: number
}

// Every side effect behind a seam, so the unit test can hand in fakes and the
// real-runtime test can hand in nothing.
export interface NightlyDeps {
  listHouseholds: () => Promise<string[]>
  backup: (householdId: string, date: string) => Promise<void>
  sweep: () => Promise<number>
  countAlive: () => Promise<number>
  countStale: () => Promise<number>
}

export function realDeps(env: Env, now: number): NightlyDeps {
  const bucket = env.PHOTOS
  return {
    listHouseholds: async () => ((await env.DB.prepare('SELECT id FROM households').all<{ id: string }>()).results ?? []).map((r) => r.id),
    backup: async (id, date) => {
      if (!bucket) return
      const dump = await dumpHousehold(env, id)
      await bucket.put(`backup/${id}/${date}.json`, JSON.stringify(dump))
      // Prune beyond the newest KEEP (keys are date-named → lexicographic = chronological).
      const listed = await bucket.list({ prefix: `backup/${id}/` })
      const keys = listed.objects.map((o) => o.key).sort()
      for (const k of keys.slice(0, Math.max(0, keys.length - BACKUP_KEEP))) await bucket.delete(k)
    },
    sweep: () => sweepExpiredDemoSandboxes(env, now, SWEEP_LIMIT),
    countAlive: () => countDemoSandboxes(env),
    countStale: () => countStaleDemoSandboxes(env, now),
  }
}

export async function runNightly(env: Env, now: number, deps: NightlyDeps = realDeps(env, now)): Promise<NightlyReport> {
  const report: NightlyReport = {
    at: now,
    households: 0,
    backed: 0,
    failed: [],
    noBucket: !env.PHOTOS,
    sandboxesSwept: 0,
    sandboxesAlive: 0,
    sandboxesStale: 0,
  }
  // The sweep first: a sandbox older than its day is not worth a backup.
  try {
    report.sandboxesSwept = await deps.sweep()
  } catch (err) {
    report.failed.push({ id: 'sweep', error: String((err as Error)?.message ?? err) })
  }
  const date = new Date(now * 1000).toISOString().slice(0, 10)
  const ids = await deps.listHouseholds()
  report.households = ids.length
  for (const id of ids) {
    try {
      await deps.backup(id, date)
      report.backed++
    } catch (err) {
      // One household's failure must not skip the others' backups.
      report.failed.push({ id, error: String((err as Error)?.message ?? err) })
    }
  }
  try {
    report.sandboxesAlive = await deps.countAlive()
    report.sandboxesStale = await deps.countStale()
  } catch (err) {
    report.failed.push({ id: 'sandbox-count', error: String((err as Error)?.message ?? err) })
  }
  return report
}

// What, if anything, to send about a report. Pure: a failure or a surviving stale
// sandbox is an ALERT any night; a quiet Monday is the DIGEST; a quiet other day is
// nothing. `weekday` follows localDayOfWeek (0 = Sunday) in the household zone.
export function alertFor(report: NightlyReport, weekday: number): Omit<Mail, 'to'> | null {
  const wrong = report.failed.length > 0 || report.sandboxesStale > 0 || report.noBucket
  const lines = [
    `Maisonnées : ${report.households} · sauvegardées : ${report.backed}${report.noBucket ? ' (R2 absent — AUCUNE sauvegarde)' : ''}`,
    `Bacs à sable : ${report.sandboxesAlive} vivants · ${report.sandboxesSwept} balayés cette nuit · ${report.sandboxesStale} périmés encore là`,
    ...report.failed.map((f) => `ÉCHEC ${f.id} : ${f.error}`),
  ]
  if (wrong) {
    return {
      subject: `Babillard — la nuit a mal tourné (${report.failed.length} échec${report.failed.length > 1 ? 's' : ''}${report.sandboxesStale ? `, ${report.sandboxesStale} bac(s) périmé(s)` : ''})`,
      text: `Le cron de ${new Date(report.at * 1000).toISOString()} rapporte :\n\n${lines.join('\n')}\n\nUn bac périmé qui survit au balayage veut dire que le balayage échoue en silence — voir demoHousehold.ts (SCOPE_COLUMN) et worker/demo.d1.test.ts.`,
    }
  }
  if (weekday === 1) {
    return {
      subject: 'Babillard va bien',
      text: `Rien à signaler cette semaine. La nuit du ${new Date(report.at * 1000).toISOString().slice(0, 10)} :\n\n${lines.join('\n')}\n\nCe courriel existe pour prouver que l’alerte, elle, arriverait.`,
    }
  }
  return null
}

// The whole cron: run, decide, send or log. Never throws — the cron has no one to
// throw to, and the report is the point.
export async function nightly(env: Env, now = Math.floor(Date.now() / 1000)): Promise<NightlyReport> {
  const report = await runNightly(env, now)
  const mail = alertFor(report, localDayOfWeek(new Date(now * 1000)))
  console.log('[nightly]', JSON.stringify(report))
  if (mail && env.ALERT_EMAIL && mailEnabled(env)) {
    try {
      await sendMail(env, { to: env.ALERT_EMAIL, ...mail })
    } catch (err) {
      console.error('[nightly] alert mail failed', err)
    }
  } else if (mail) {
    console.warn('[nightly] alert not sent — ALERT_EMAIL or mail unset:', mail.subject)
  }
  return report
}

export function alertsEnabled(env: Env): boolean {
  return !!env.ALERT_EMAIL && mailEnabled(env)
}
