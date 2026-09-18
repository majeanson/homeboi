import { describe, it, expect } from 'vitest'
import {
  MCP_ASSUMED_VERSION,
  MCP_LATEST,
  MCP_VERSIONS,
  decodeHeaderValue,
  isKnownVersion,
  isModern,
  negotiateVersion,
  originAllowed,
  parseRpc,
  rpcError,
  rpcResult,
  toolError,
  toolResult,
  validateMirrorHeaders,
  RPC_HEADER_MISMATCH,
  RPC_INVALID_REQUEST,
  type RpcMessage,
} from './mcp'

// The wire, tested without a Worker. What these cases are actually protecting:
// a handshake that fails here fails SILENTLY in a client — the server simply never
// appears in /mcp, with no log on either side saying why. Every case below is one of
// the ways that happened while this was being written.

const META = 'io.modelcontextprotocol/protocolVersion'

function req(method: string, params: Record<string, unknown> = {}, id: string | number | null = 1) {
  return { jsonrpc: '2.0', id, method, params }
}

describe('parseRpc', () => {
  it('reads a request', () => {
    const out = parseRpc(req('tools/list'))
    expect(out).toMatchObject({ id: 1, method: 'tools/list', isNotification: false })
  })

  it('treats a missing id as a notification', () => {
    const out = parseRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }) as RpcMessage
    expect(out.isNotification).toBe(true)
  })

  it('treats an EXPLICIT null id as a notification too', () => {
    // Some clients spell a notification `"id": null` rather than omitting the key.
    // Answering it with a result (id null) is what a naive `'id' in msg` check does,
    // and a client that gets a response to a notification can drop the connection.
    const out = parseRpc({ jsonrpc: '2.0', id: null, method: 'notifications/initialized' }) as RpcMessage
    expect(out.isNotification).toBe(true)
  })

  it('rejects a batch — the transport says one message per POST', () => {
    const out = parseRpc([req('tools/list')])
    expect(out).toMatchObject({ status: 400, code: RPC_INVALID_REQUEST })
  })

  it('rejects a wrong or missing jsonrpc version', () => {
    expect(parseRpc({ jsonrpc: '1.0', id: 1, method: 'ping' })).toMatchObject({ code: RPC_INVALID_REQUEST })
    expect(parseRpc({ id: 1, method: 'ping' })).toMatchObject({ code: RPC_INVALID_REQUEST })
  })

  it('rejects a missing method', () => {
    expect(parseRpc({ jsonrpc: '2.0', id: 1 })).toMatchObject({ code: RPC_INVALID_REQUEST })
  })

  it('tolerates params that are absent or not an object', () => {
    expect((parseRpc({ jsonrpc: '2.0', id: 1, method: 'ping' }) as RpcMessage).params).toEqual({})
    expect((parseRpc({ jsonrpc: '2.0', id: 1, method: 'ping', params: [] }) as RpcMessage).params).toEqual({})
  })
})

describe('version negotiation', () => {
  it('prefers the body’s _meta over the header — the body is the source of truth', () => {
    const params = { _meta: { [META]: '2026-07-28' } }
    expect(negotiateVersion(params, '2025-06-18')).toBe('2026-07-28')
  })

  it('falls back to the header when the body carries no _meta (the legacy era)', () => {
    expect(negotiateVersion({}, '2025-06-18')).toBe('2025-06-18')
  })

  it('assumes 2025-03-26 when neither is present', () => {
    // Pre-2025-06-18 clients never sent the header. Rejecting them would be allowed
    // and would lock out exactly the clients most likely to be in the wild.
    expect(negotiateVersion({}, null)).toBe(MCP_ASSUMED_VERSION)
  })

  it('knows every version it advertises, and only those', () => {
    for (const v of MCP_VERSIONS) expect(isKnownVersion(v)).toBe(true)
    expect(isKnownVersion('2099-01-01')).toBe(false)
    expect(isKnownVersion('2024-11-05')).toBe(false) // the deprecated HTTP+SSE transport
  })

  it('treats only the newest revision as modern', () => {
    expect(isModern(MCP_LATEST)).toBe(true)
    expect(isModern('2025-11-25')).toBe(false)
  })
})

describe('validateMirrorHeaders (2026-07-28 only)', () => {
  const modern = (params: Record<string, unknown> = {}) => ({
    ...params,
    _meta: { [META]: MCP_LATEST },
  })

  it('passes when the headers mirror the body', () => {
    const msg = parseRpc(req('tools/call', modern({ name: 'board_today' }))) as RpcMessage
    expect(
      validateMirrorHeaders(msg, { protocolVersion: MCP_LATEST, method: 'tools/call', name: 'board_today' }),
    ).toBeNull()
  })

  it('rejects a missing protocol-version header', () => {
    const msg = parseRpc(req('tools/list', modern())) as RpcMessage
    expect(validateMirrorHeaders(msg, { protocolVersion: null, method: 'tools/list', name: null })).toMatchObject({
      status: 400,
      code: RPC_HEADER_MISMATCH,
    })
  })

  it('rejects a header/body method mismatch — the routing-vs-execution seam', () => {
    const msg = parseRpc(req('tools/call', modern({ name: 'board_today' }))) as RpcMessage
    expect(
      validateMirrorHeaders(msg, { protocolVersion: MCP_LATEST, method: 'tools/list', name: 'board_today' }),
    ).toMatchObject({ code: RPC_HEADER_MISMATCH })
  })

  it('rejects a header/body TOOL NAME mismatch', () => {
    const msg = parseRpc(req('tools/call', modern({ name: 'board_today' }))) as RpcMessage
    expect(
      validateMirrorHeaders(msg, { protocolVersion: MCP_LATEST, method: 'tools/call', name: 'shopping_list' }),
    ).toMatchObject({ code: RPC_HEADER_MISMATCH })
  })

  it('does not demand Mcp-Name for a method that has no name', () => {
    const msg = parseRpc(req('tools/list', modern())) as RpcMessage
    expect(validateMirrorHeaders(msg, { protocolVersion: MCP_LATEST, method: 'tools/list', name: null })).toBeNull()
  })

  it('accepts a Base64-wrapped Mcp-Name', () => {
    const msg = parseRpc(req('tools/call', modern({ name: 'recette_crêpes' }))) as RpcMessage
    const encoded = '=?base64?' + Buffer.from('recette_crêpes', 'utf8').toString('base64') + '?='
    expect(
      validateMirrorHeaders(msg, { protocolVersion: MCP_LATEST, method: 'tools/call', name: encoded }),
    ).toBeNull()
  })
})

describe('decodeHeaderValue', () => {
  it('passes a plain value through', () => {
    expect(decodeHeaderValue('board_today')).toBe('board_today')
  })

  it('decodes the sentinel as UTF-8, not latin1', () => {
    // atob yields bytes-as-latin1; decoding « crêpes » without the TextDecoder step
    // gives "crÃªpes", which would fail the mirror check for any accented name —
    // i.e. for half of this app's vocabulary.
    const encoded = '=?base64?' + Buffer.from('crêpes', 'utf8').toString('base64') + '?='
    expect(decodeHeaderValue(encoded)).toBe('crêpes')
  })

  it('answers null on invalid Base64 rather than pretending to match', () => {
    expect(decodeHeaderValue('=?base64?!!!not-base64!!!?=')).toBeNull()
  })
})

describe('originAllowed (DNS-rebinding protection)', () => {
  const self = 'https://babillard.marcportal.com'

  it('allows an absent Origin — a CLI client sends none', () => {
    expect(originAllowed(null, self)).toBe(true)
  })

  it('allows our own origin', () => {
    expect(originAllowed(self, self)).toBe(true)
  })

  it('refuses another origin', () => {
    expect(originAllowed('https://evil.example', self)).toBe(false)
  })

  it('refuses the opaque "null" origin (a sandboxed iframe or a data: page)', () => {
    expect(originAllowed('null', self)).toBe(false)
  })
})

describe('result shapes', () => {
  it('adds resultType only on the modern revision', () => {
    expect(toolResult('hi', { a: 1 }, MCP_LATEST)).toMatchObject({ resultType: 'complete' })
    expect(toolResult('hi', { a: 1 }, '2025-06-18')).not.toHaveProperty('resultType')
  })

  it('carries the text beside the structured content, as the spec asks', () => {
    const r = toolResult('two eggs', { eggs: 2 }, MCP_LATEST)
    expect(r.content).toEqual([{ type: 'text', text: 'two eggs' }])
    expect(r.structuredContent).toEqual({ eggs: 2 })
    expect(r.isError).toBe(false)
  })

  it('omits structuredContent when there is none', () => {
    expect(toolResult('plain', undefined, MCP_LATEST)).not.toHaveProperty('structuredContent')
  })

  it('reports a tool failure as a RESULT with isError, never a protocol error', () => {
    // The distinction is the whole point: a model can read isError and retry with
    // different arguments; a JSON-RPC error is usually the end of the attempt.
    const r = toolError('Invalid `from`: expected a date like 2026-09-18.', MCP_LATEST)
    expect(r.isError).toBe(true)
    expect(r.content).toEqual([{ type: 'text', text: 'Invalid `from`: expected a date like 2026-09-18.' }])
  })

  it('wraps results and errors in JSON-RPC envelopes', () => {
    expect(rpcResult(7, { ok: true })).toEqual({ jsonrpc: '2.0', id: 7, result: { ok: true } })
    expect(rpcError(7, -32601, 'Method not found: x')).toEqual({
      jsonrpc: '2.0',
      id: 7,
      error: { code: -32601, message: 'Method not found: x' },
    })
    expect(rpcError(null, -32602, 'bad', { supported: ['a'] })).toMatchObject({
      error: { data: { supported: ['a'] } },
    })
  })
})
