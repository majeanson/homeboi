import { describe, it, expect, beforeAll } from 'vitest'
import { anon, household, type Session } from '../functions/test/d1'
import { MCP_LATEST } from '../functions/_lib/mcp'

// The MCP server, through the REAL Worker: the CSRF gate, the route table, authed(),
// the device-kind gate and the tool's inner call to its own GET handler all run.
//
// This is the file that answers the question the unit tests cannot: not "is the wire
// shaped right" but "does an agent actually get this household's supper". The pure
// tests in functions/_lib/mcp.test.ts could all pass against a server that 401s every
// request — and did, at one point, because a kind='agent' device resolved as a plain
// kiosk and then hit the read-only gate on its own endpoint.

const META = 'io.modelcontextprotocol/protocolVersion'

let op: Session
let token: string

/** POST one JSON-RPC message the way a modern client does, with the mirror headers. */
function rpc(
  body: Record<string, unknown>,
  opts: { token?: string | null; headers?: Record<string, string>; query?: string } = {},
) {
  const method = typeof body.method === 'string' ? body.method : ''
  const params = (body.params ?? {}) as Record<string, unknown>
  const name = typeof params.name === 'string' ? params.name : null
  const headers: Record<string, string> = {
    'MCP-Protocol-Version': MCP_LATEST,
    'Mcp-Method': method,
    ...(name ? { 'Mcp-Name': name } : {}),
    ...opts.headers,
  }
  const tok = opts.token === undefined ? token : opts.token
  if (tok) headers['X-Device-Token'] = tok
  return anon(`/api/mcp${opts.query ?? ''}`, { method: 'POST', body, headers })
}

/** A modern request body: `_meta` carries the version, mirroring the header. */
function msg(method: string, params: Record<string, unknown> = {}, id: number | string | null = 1) {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params: { ...params, _meta: { [META]: MCP_LATEST } },
  }
}

beforeAll(async () => {
  op = await household('mcp')
  const res = await op.fetch('/api/pair/devices', { method: 'POST', body: { mintAgent: true, label: 'Agent test' } })
  expect(res.status).toBe(200)
  token = ((await res.json()) as { token: string }).token
  expect(token).toBeTruthy()
})

describe('minting the credential', () => {
  it('lands in the paired-devices list as kind=agent, revocable like any device', async () => {
    const res = await op.fetch('/api/pair/devices')
    const { devices } = (await res.json()) as { devices: { label: string; kind: string; revoked_at: number | null }[] }
    const row = devices.find((d) => d.label === 'Agent test')
    expect(row).toBeDefined()
    expect(row!.kind).toBe('agent')
    expect(row!.revoked_at).toBeNull()
  })
})

describe('authentication', () => {
  it('refuses an unauthenticated call', async () => {
    const res = await rpc(msg('tools/list'), { token: null })
    expect(res.status).toBe(401)
  })

  it('refuses the OPERATOR SESSION — the CSRF-exempt hole this endpoint must not open', async () => {
    // /api/mcp is in CSRF_EXEMPT so a token may ride in `?t=`. If it also accepted the
    // session cookie, any page on any origin could POST here with the operator's
    // cookie attached and read the whole household. It must 403 on scope alone.
    const res = await op.fetch('/api/mcp', { method: 'POST', body: msg('tools/list') })
    expect(res.status).toBe(403)
  })

  it('accepts the token in `?t=` as well as the header (the header-drop workaround)', async () => {
    const res = await rpc(msg('tools/list'), { token: null, query: `?t=${encodeURIComponent(token)}` })
    expect(res.status).toBe(200)
    const out = (await res.json()) as { result: { tools: unknown[] } }
    expect(out.result.tools.length).toBeGreaterThan(0)
  })

  it('refuses a plain KIOSK token — an agent tool set is not a wall tablet’s', async () => {
    const mint = await op.fetch('/api/pair/devices', { method: 'POST', body: { mintDisplay: true, label: 'TV test' } })
    const tv = ((await mint.json()) as { token: string }).token
    const res = await rpc(msg('tools/list'), { token: tv })
    expect(res.status).toBe(403)
  })

  it('stops working the moment the device is revoked', async () => {
    const mint = await op.fetch('/api/pair/devices', { method: 'POST', body: { mintAgent: true, label: 'Agent doomed' } })
    const doomed = ((await mint.json()) as { token: string; deviceId: string }) as { token: string; deviceId: string }
    expect((await rpc(msg('tools/list'), { token: doomed.token })).status).toBe(200)
    await op.fetch('/api/pair/devices', { method: 'POST', body: { revokeId: doomed.deviceId } })
    expect((await rpc(msg('tools/list'), { token: doomed.token })).status).toBe(401)
  })
})

describe('the agent credential is read-only EVERYWHERE, not just here', () => {
  it('cannot write through an ordinary endpoint', async () => {
    // The whole promise of this server. If an agent token were a full kiosk token,
    // leaking it would hand over write access to the household through /api/list —
    // a door this server never opens but the credential would.
    const res = await anon('/api/list', {
      method: 'POST',
      body: { text: 'des œufs' },
      headers: { 'X-Device-Token': token },
    })
    expect(res.status).toBe(403)
  })

  it('can still READ an ordinary endpoint', async () => {
    const res = await anon('/api/list', { headers: { 'X-Device-Token': token } })
    expect(res.status).toBe(200)
  })
})

describe('the wire', () => {
  it('lists every registered tool, all flagged read-only', async () => {
    const res = await rpc(msg('tools/list'))
    expect(res.status).toBe(200)
    const out = (await res.json()) as {
      result: { resultType: string; tools: { name: string; inputSchema: unknown; annotations: { readOnlyHint: boolean } }[] }
    }
    expect(out.result.resultType).toBe('complete')
    const names = out.result.tools.map((t) => t.name).sort()
    expect(names).toEqual(
      [
        'app_health',
        'board_today',
        'calendar_range',
        'data_invariants',
        'household_snapshot',
        'meal_plan',
        'people_directory',
        'recipe_get',
        'recipes_search',
        'shopping_list',
      ].sort(),
    )
    for (const t of out.result.tools) {
      expect(t.annotations.readOnlyHint).toBe(true)
      expect(t.inputSchema).toMatchObject({ type: 'object' })
    }
  })

  it('answers a notification with 202 and no body', async () => {
    const res = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })
    expect(res.status).toBe(202)
    expect(await res.text()).toBe('')
  })

  it('answers the LEGACY initialize handshake for an older client', async () => {
    // No _meta, no mirror headers — exactly what a 2025-era client sends.
    const res = await anon('/api/mcp', {
      method: 'POST',
      body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
      headers: { 'X-Device-Token': token },
    })
    expect(res.status).toBe(200)
    const out = (await res.json()) as { result: { protocolVersion: string; capabilities: { tools: unknown }; serverInfo: { name: string } } }
    expect(out.result.protocolVersion).toBe('2025-06-18')
    expect(out.result.capabilities.tools).toBeDefined()
    expect(out.result.serverInfo.name).toBe('babillard')
  })

  it('rejects a header/body mismatch with -32020', async () => {
    const res = await rpc(msg('tools/call', { name: 'board_today' }), { headers: { 'Mcp-Name': 'shopping_list' } })
    expect(res.status).toBe(400)
    const out = (await res.json()) as { error: { code: number } }
    expect(out.error.code).toBe(-32020)
  })

  it('404s an unknown METHOD and an unknown TOOL, both with -32601', async () => {
    const m = await rpc(msg('resources/list'))
    expect(m.status).toBe(404)
    expect(((await m.json()) as { error: { code: number } }).error.code).toBe(-32601)

    const t = await rpc(msg('tools/call', { name: 'delete_everything' }))
    expect(t.status).toBe(404)
    expect(((await t.json()) as { error: { code: number } }).error.code).toBe(-32601)
  })

  it('405s a GET or DELETE to the endpoint', async () => {
    expect((await anon('/api/mcp')).status).toBe(405)
    expect((await anon('/api/mcp', { method: 'DELETE' })).status).toBe(405)
  })

  it('403s a foreign Origin (DNS rebinding)', async () => {
    const res = await rpc(msg('tools/list'), { headers: { Origin: 'https://evil.example' } })
    expect(res.status).toBe(403)
  })
})

describe('the tools actually read the household', () => {
  it('board_today returns this household’s board', async () => {
    const res = await rpc(msg('tools/call', { name: 'board_today' }))
    expect(res.status).toBe(200)
    const out = (await res.json()) as {
      result: { isError: boolean; content: { type: string; text: string }[]; structuredContent: Record<string, unknown> }
    }
    expect(out.result.isError).toBe(false)
    expect(out.result.content[0].type).toBe('text')
    // The signup seed gives every household a living board, so this is real data.
    expect(Object.keys(out.result.structuredContent).length).toBeGreaterThan(0)
  })

  it('shopping_list sees a line the household just added', async () => {
    await op.fetch('/api/list', { method: 'POST', body: { text: 'sirop d’érable' } })
    const res = await rpc(msg('tools/call', { name: 'shopping_list' }))
    const out = (await res.json()) as { result: { content: { text: string }[] } }
    expect(out.result.content[0].text).toContain('sirop d’érable')
  })

  it('household_snapshot renders dated lines without spending an AI call', async () => {
    const res = await rpc(msg('tools/call', { name: 'household_snapshot' }))
    expect(res.status).toBe(200)
    const out = (await res.json()) as { result: { isError: boolean; content: { text: string }[] } }
    expect(out.result.isError).toBe(false)
    expect(out.result.content[0].text.length).toBeGreaterThan(0)
  })

  it('calendar_range accepts YYYY-MM-DD and refuses nonsense as a TOOL error', async () => {
    const good = await rpc(msg('tools/call', { name: 'calendar_range', arguments: { from: '2026-09-01', to: '2026-09-30' } }))
    expect(good.status).toBe(200)
    expect(((await good.json()) as { result: { isError: boolean } }).result.isError).toBe(false)

    // A bad argument is a RESULT with isError, not a protocol error: the model can
    // read the sentence and retry with a real date.
    const bad = await rpc(msg('tools/call', { name: 'calendar_range', arguments: { from: 'demain' } }))
    expect(bad.status).toBe(200)
    const out = (await bad.json()) as { result: { isError: boolean; content: { text: string }[] } }
    expect(out.result.isError).toBe(true)
    expect(out.result.content[0].text).toContain('from')
  })

  it('recipes_search folds accents, and recipe_get returns the full card', async () => {
    await op.fetch('/api/recipes', {
      method: 'POST',
      body: { title: 'Crêpes du dimanche', ingredients: ['2 œufs', '1 tasse de farine'], steps: ['Mélanger', 'Cuire'] },
    })
    const search = await rpc(msg('tools/call', { name: 'recipes_search', arguments: { query: 'crepes' } }))
    const found = (await search.json()) as { result: { structuredContent: { recipes: { id: string; title: string }[] } } }
    expect(found.result.structuredContent.recipes.length).toBeGreaterThan(0)
    const card = found.result.structuredContent.recipes.find((r) => r.title === 'Crêpes du dimanche')
    expect(card).toBeDefined()

    const one = await rpc(msg('tools/call', { name: 'recipe_get', arguments: { id: card!.id } }))
    const full = (await one.json()) as { result: { content: { text: string }[] } }
    expect(full.result.content[0].text).toContain('farine')
  })

  it('cannot reach ANOTHER household’s data', async () => {
    const other = await household('mcp-other')
    await other.fetch('/api/list', { method: 'POST', body: { text: 'secret du voisin' } })
    const res = await rpc(msg('tools/call', { name: 'shopping_list' }))
    const out = (await res.json()) as { result: { content: { text: string }[] } }
    expect(out.result.content[0].text).not.toContain('secret du voisin')
  })
})
