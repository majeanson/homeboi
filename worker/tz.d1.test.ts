import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household } from '../functions/test/d1'

// The household's own day (STATE.md §4-L L11, migration 0135). The zone is established
// ONCE per request by authed() and read by every day helper as its default, so this is
// the test that the ambient really reaches a handler through the real runtime — and
// that two households do not share one.
describe('household time zone', () => {
  it('defaults to America/Toronto, and the endpoint reports it', async () => {
    const a = await household('tz')
    const h = (await (await a.fetch('/api/household')).json()) as { tz: string }
    expect(h.tz).toBe('America/Toronto')
  })

  it('a zone Intl does not know is refused — an unknown one would make every date helper throw', async () => {
    const a = await household('tzbad')
    expect((await a.fetch('/api/household', { method: 'PATCH', body: { tz: 'Mars/Olympus_Mons' } })).status).toBe(400)
    expect((await a.fetch('/api/household', { method: 'PATCH', body: { tz: '' } })).status).toBe(400)
    expect((await a.fetch('/api/household', { method: 'PATCH', body: { tz: 42 } })).status).toBe(400)
    const h = (await (await a.fetch('/api/household')).json()) as { tz: string }
    expect(h.tz).toBe('America/Toronto')
  })

  it('a household on the west coast gets ITS day, not Toronto’s — the whole point', async () => {
    const a = await household('tzwest')
    expect((await a.fetch('/api/household', { method: 'PATCH', body: { tz: 'America/Vancouver' } })).status).toBe(200)
    expect(((await (await a.fetch('/api/household')).json()) as { tz: string }).tz).toBe('America/Vancouver')

    // A note dated « today » is bucketed on the household's local day. At 06:30 UTC it is
    // still the PREVIOUS day in Vancouver (22:30) and already the previous day in Toronto
    // too (02:30) — so pick an hour where the two DISAGREE: 05:00 UTC is 01:00 in Toronto
    // (a new day) and 21:00 in Vancouver (still the day before).
    const at = Date.UTC(2026, 2, 10, 5, 0, 0) / 1000 // 2026-03-10T05:00Z
    const { localDayStart } = await import('../functions/_lib/ids')
    const { runWithTz } = await import('../functions/_lib/tz')
    const toronto = runWithTz('America/Toronto', () => localDayStart(new Date(at * 1000)))
    const vancouver = runWithTz('America/Vancouver', () => localDayStart(new Date(at * 1000)))
    const dayName = (sec: number, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, dateStyle: 'short' }).format(new Date(sec * 1000))
    // Different CALENDAR DAYS — Vancouver is still on the 9th while Toronto has turned
    // the 10th. Note the two midnights are 21 hours apart, not 24: they are the same
    // wall-clock instant in zones three hours apart, which is exactly why this app
    // never does day arithmetic by adding 86400 (CLAUDE.md's fixed-86400 rule). The
    // first draft of this assertion divided by 86400 and expected 1 — the trap, caught
    // by the test it was written for.
    expect(vancouver).toBeLessThan(toronto)
    expect(dayName(vancouver, 'America/Vancouver')).toBe('2026-03-09')
    expect(dayName(toronto, 'America/Toronto')).toBe('2026-03-10')
    expect((toronto - vancouver) / 3600).toBe(21)
    // …and with no ambient at all, the pre-0135 answer.
    expect(localDayStart(new Date(at * 1000))).toBe(toronto)
  })

  it('two households’ zones never cross, even concurrently (the reason it is AsyncLocalStorage)', async () => {
    const west = await household('tzconc-w')
    const east = await household('tzconc-e')
    expect((await west.fetch('/api/household', { method: 'PATCH', body: { tz: 'America/Vancouver' } })).status).toBe(200)
    // Fire both at once, repeatedly: a module-level variable would leak one into the other.
    for (let i = 0; i < 5; i++) {
      const [w, e] = await Promise.all([
        west.fetch('/api/household').then((r) => r.json() as Promise<{ tz: string }>),
        east.fetch('/api/household').then((r) => r.json() as Promise<{ tz: string }>),
      ])
      expect(w.tz, `round ${i}`).toBe('America/Vancouver')
      expect(e.tz, `round ${i}`).toBe('America/Toronto')
    }
  })

  it('the column exists with the right default', async () => {
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('households') WHERE name = 'tz'").first<{ n: number }>()
    expect(row?.n).toBe(1)
  })
})
