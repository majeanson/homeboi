import { describe, expect, it, beforeEach, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

// The add-a-deal RACE — the other half of picks.test.ts (which proves the match
// decision itself). What shipped: « pommes » tapped twice fast is two concurrent
// adds; both miss the cache, both POST, and the server backstop can only match a
// row that's already committed — so the loser inserted a twin, and the button
// flipped « Ajouté à la liste » → « Sur « pommes » » depending on which answer
// landed last. `queuedByName` in picks.tsx serializes same-name adds so the
// second one runs against a world where the first line exists.
//
// The mock server below models exactly the dangerous window: the match check and
// the insert are separated by an await (D1 latency), so two truly concurrent
// inserts BOTH pass the check. If someone removes the serialization, the first
// test fails with two « pommes » lines — which is the bug, not the test.

// One fake D1: check-then-insert with a real async gap between the two.
const server = vi.hoisted(() => ({
  lines: [] as { id: string; text: string; deal?: unknown }[],
  nextId: 0,
}))

const norm = (s: string) => s.trim().toLowerCase()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

vi.mock('./write', () => ({
  writeWith: async (
    _qc: unknown,
    _path: string,
    opts: { method: string; body: { id?: string; text?: string; deal?: unknown; match?: boolean; checked?: boolean } },
  ) => {
    const b = opts.body
    if (opts.method === 'PATCH') {
      const hit = server.lines.find((l) => l.id === b.id)
      // The 4d0a94b guard: a per-id mutation against a deleted row is a 404,
      // never a silent zero-row "success".
      if (!hit) throw new Error('404 Ligne introuvable')
      if (b.deal !== undefined) hit.deal = b.deal
      return { queued: false, data: { ok: true } }
    }
    // POST — the server-side reuse-not-duplicate backstop (match: true).
    if (b.match) {
      const hit = server.lines.find((l) => norm(l.text) === norm(b.text!))
      if (hit) {
        if (b.deal !== undefined) hit.deal = b.deal
        return { queued: false, data: { id: hit.id, text: hit.text, matched: true } }
      }
    }
    await sleep(10) // the race window: a concurrent add checks BEFORE this lands
    const row = { id: `n${server.nextId++}`, text: b.text!, deal: b.deal }
    server.lines.push(row)
    return { queued: false, data: { id: row.id, text: row.text } }
  },
}))
vi.mock('./useDeferredRemoval', () => ({ heldIds: () => new Set<string>() }))

import { ensureListLine, stageDeal } from './picks'
import { type Deal } from './deals'
import { BOARD_KEY } from './queryKeys'

const deal = { id: 1, name: 'Pommes Gala 3 lb', price: 3.99, merchant: 'Maxi' } as unknown as Deal

function freshQc(list: { id: string; text: string }[] = []): QueryClient {
  const qc = new QueryClient()
  qc.setQueryData(BOARD_KEY, { list })
  return qc
}

beforeEach(() => {
  server.lines = []
  server.nextId = 0
})

describe('same-name adds are serialized (the double-tap twin)', () => {
  it('two concurrent stageDeal for one name produce ONE line', async () => {
    const qc = freshQc()
    const [first, second] = await Promise.all([stageDeal(qc, 'pommes', deal), stageDeal(qc, 'pommes', deal)])
    expect(server.lines.map((l) => l.text)).toEqual(['pommes'])
    // The first add made the line (null = new); the second, queued behind it,
    // rode on it via the server backstop and can SAY so.
    expect(first).toBeNull()
    expect(second).toBe('pommes')
  })

  it('a rushed add + plain ensure for the same name still make ONE line', async () => {
    const qc = freshQc()
    await Promise.all([ensureListLine(qc, 'pommes'), stageDeal(qc, 'pommes', deal)])
    expect(server.lines).toHaveLength(1)
    expect(server.lines[0].deal).toBeDefined()
  })

  it('different names do not wait on each other (both insert)', async () => {
    const qc = freshQc()
    await Promise.all([ensureListLine(qc, 'pommes'), ensureListLine(qc, 'bananes')])
    expect(server.lines.map((l) => l.text).sort()).toEqual(['bananes', 'pommes'])
  })
})

describe('the stale-cache fallback (a matched line deleted server-side)', () => {
  it('stageDeal falls back to CREATING the line instead of reporting a ghost landing', async () => {
    // The client cache still shows « Pommes » (a stale persisted frame) but the
    // server no longer has it — the PATCH 404s, and the deal must land for real.
    const qc = freshQc([{ id: 'gone', text: 'Pommes' }])
    const on = await stageDeal(qc, 'pommes', deal)
    expect(on).toBeNull() // a NEW line — never « Sur « Pommes » » with nothing behind it
    expect(server.lines.map((l) => l.text)).toEqual(['pommes'])
    expect(server.lines[0].deal).toBeDefined()
  })
})
