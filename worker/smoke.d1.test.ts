import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { anon, household } from '../functions/test/d1'

// The harness itself (vitest.d1.config.ts): the real Worker, a real D1 with every
// migration applied, through the real entry.
describe('real-runtime harness', () => {
  it('serves /api/health from the Worker entry with the harness bindings', async () => {
    const res = await anon('/api/health')
    expect(res.status).toBe(200)
    const h = (await res.json()) as Record<string, unknown>
    expect(h.ok).toBe(true)
    expect(h.sessionSecret).toBe(true)
  })

  it('has every migration applied — the newest column exists', async () => {
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('operators') WHERE name = 'session_version'").first<{ n: number }>()
    expect(row?.n).toBe(1)
    const applied = await env.DB.prepare('SELECT COUNT(*) AS n FROM d1_migrations').first<{ n: number }>()
    expect(applied!.n).toBeGreaterThanOrEqual(134)
  })

  it('signs a household up through the real endpoint and lands it on a seeded board', async () => {
    const a = await household('smoke')
    const board = await a.fetch('/api/board')
    expect(board.status).toBe(200)
    const members = await a.fetch('/api/members')
    expect(members.status).toBe(200)
    const { members: list } = (await members.json()) as { members: unknown[] }
    expect(list.length).toBeGreaterThan(0)
  })
})
