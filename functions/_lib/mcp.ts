// MCP (Model Context Protocol) — the wire, kept PURE.
//
// Nothing here touches D1, R2, the request or the clock: this module turns bytes
// into a decision and a decision into bytes, so the whole protocol is unit-testable
// without a Worker (mcp.test.ts). The household side — auth, the tools, the reads —
// lives in functions/api/mcp.ts. That split is the same one askContext.ts made for
// « Demande à la maison », and for the same reason: a protocol bug and a household
// bug should never be able to hide inside each other.
//
// ─────────────────────────────────────────────────────────────────────────────────
// TWO ERAS, AND WHY WE SPEAK BOTH.
//
// Revision 2026-07-28 removed protocol-level sessions AND the `initialize`/
// `initialized` handshake outright: every request is self-contained and carries its
// protocol version, client identity and capabilities in `_meta`. That is why this
// server needs no Durable Object, no session table and no SSE — a POST in, a JSON
// object out, which is exactly the shape every other handler in this codebase has.
//
// But shipped clients still speak the INITIALIZE era (2025-03-26 … 2025-11-25),
// where the connection opens with `initialize` and the server answers with its
// capabilities. A server that only spoke the new revision would simply fail to
// connect to the client the household actually has today. So both are handled, the
// era is detected per request, and the ONLY behavioural differences are:
//
//   · `initialize` is answered (legacy) or 404s as an unknown method (modern);
//   · results carry `resultType: 'complete'` only on 2026-07-28;
//   · the Mcp-Method / Mcp-Name / MCP-Protocol-Version header↔body validation is
//     enforced only on 2026-07-28, because earlier revisions never sent them.
//
// Sessions are NOT implemented in either direction: `Mcp-Session-Id` is ignored and
// never minted (the newer revision says to), and a legacy client that wanted one
// works fine without it, because every tool here is a pure read that needs no state.
// ─────────────────────────────────────────────────────────────────────────────────

/** The revision whose rules we implement fully (stateless, per-request metadata). */
export const MCP_LATEST = '2026-07-28'

/**
 * Every revision we will answer, newest first. The three older ones are the
 * `initialize`-era Streamable HTTP revisions; we accept them so a client shipped
 * before 2026-07-28 can still connect. 2024-11-05's HTTP+SSE transport is NOT
 * here: it is deprecated, it needs a second endpoint and a GET stream, and no
 * client we care about needs it.
 */
export const MCP_VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'] as const
export type McpVersion = (typeof MCP_VERSIONS)[number]

/**
 * A request that omits MCP-Protocol-Version entirely. The spec lets a server that
 * supports pre-2025-06-18 clients (which never defined the header) read the absence
 * as 2025-03-26, and we do — it is the most permissive reading and it costs nothing,
 * since the only thing the version changes here is response shape.
 */
export const MCP_ASSUMED_VERSION: McpVersion = '2025-03-26'

const META_VERSION = 'io.modelcontextprotocol/protocolVersion'

// JSON-RPC 2.0 error codes. -32020 is MCP's own, from the range the specification
// reserves for protocol-defined errors; the rest are standard JSON-RPC.
export const RPC_PARSE_ERROR = -32700
export const RPC_INVALID_REQUEST = -32600
export const RPC_METHOD_NOT_FOUND = -32601
export const RPC_INVALID_PARAMS = -32602
export const RPC_HEADER_MISMATCH = -32020

export interface RpcMessage {
  id: string | number | null
  method: string
  params: Record<string, unknown>
  /** No `id` ⇒ a JSON-RPC notification: it gets 202 and no body, never a result. */
  isNotification: boolean
}

export interface RpcFault {
  /** The HTTP status this fault must be sent with (the transport is specific about it). */
  status: number
  code: number
  message: string
  data?: unknown
}

/**
 * Parse one JSON-RPC message. Returns a fault instead of throwing so the caller
 * stays a straight line. Batches are deliberately unsupported: the Streamable HTTP
 * binding says the POST body MUST be a single request or notification.
 */
export function parseRpc(raw: unknown): RpcMessage | RpcFault {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 400, code: RPC_INVALID_REQUEST, message: 'Body must be a single JSON-RPC object.' }
  }
  const msg = raw as Record<string, unknown>
  if (msg.jsonrpc !== '2.0') {
    return { status: 400, code: RPC_INVALID_REQUEST, message: 'jsonrpc must be "2.0".' }
  }
  if (typeof msg.method !== 'string' || msg.method.length === 0) {
    return { status: 400, code: RPC_INVALID_REQUEST, message: 'method is required.' }
  }
  // `id: null` is a notification too — JSON-RPC reserves null for "no reply", and
  // some clients spell a notification that way rather than omitting the key.
  const hasId = 'id' in msg && msg.id !== null && msg.id !== undefined
  const id = hasId ? (msg.id as string | number) : null
  const params =
    msg.params != null && typeof msg.params === 'object' && !Array.isArray(msg.params)
      ? (msg.params as Record<string, unknown>)
      : {}
  return { id, method: msg.method, params, isNotification: !hasId }
}

/** Read the client's protocol version from the body's `_meta`, if it put one there. */
export function versionFromMeta(params: Record<string, unknown>): string | null {
  const meta = params._meta
  if (meta == null || typeof meta !== 'object') return null
  const v = (meta as Record<string, unknown>)[META_VERSION]
  return typeof v === 'string' ? v : null
}

export function isKnownVersion(v: string): v is McpVersion {
  return (MCP_VERSIONS as readonly string[]).includes(v)
}

/**
 * Which revision this request speaks. The BODY is the source of truth (the transport
 * says so explicitly); the header is a mirror for intermediaries, and a mismatch
 * between the two is a fault rather than a tie to break — see validateMirrorHeaders.
 */
export function negotiateVersion(params: Record<string, unknown>, header: string | null): string {
  return versionFromMeta(params) ?? header ?? MCP_ASSUMED_VERSION
}

/** 2026-07-28 and later: per-request metadata, mirror headers, `resultType`. */
export function isModern(version: string): boolean {
  return version === MCP_LATEST
}

/**
 * The header↔body check the 2026-07-28 transport REQUIRES of any server that reads
 * the body — because an intermediary may route on the header while we execute on
 * the body, and a mismatch between those two is exactly the seam an attacker wants.
 * Enforced only for the modern revision: earlier clients never sent these headers,
 * so demanding them would reject every legacy client with a confusing error.
 *
 * `Mcp-Name` may arrive Base64-wrapped when the value is not header-safe (an accent
 * in a tool name would do it), so the sentinel is decoded before comparing.
 */
export function validateMirrorHeaders(
  msg: RpcMessage,
  headers: { protocolVersion: string | null; method: string | null; name: string | null },
): RpcFault | null {
  if (!headers.protocolVersion) {
    return { status: 400, code: RPC_HEADER_MISMATCH, message: 'MCP-Protocol-Version header is required.' }
  }
  const bodyVersion = versionFromMeta(msg.params)
  if (bodyVersion && bodyVersion !== headers.protocolVersion) {
    return {
      status: 400,
      code: RPC_HEADER_MISMATCH,
      message: `Header mismatch: MCP-Protocol-Version '${headers.protocolVersion}' does not match body value '${bodyVersion}'.`,
    }
  }
  if (headers.method !== msg.method) {
    return {
      status: 400,
      code: RPC_HEADER_MISMATCH,
      message: `Header mismatch: Mcp-Method header value '${headers.method ?? ''}' does not match body value '${msg.method}'.`,
    }
  }
  // Mcp-Name mirrors params.name and is required for tools/call only.
  if (msg.method === 'tools/call') {
    const bodyName = typeof msg.params.name === 'string' ? msg.params.name : ''
    const headerName = decodeHeaderValue(headers.name)
    if (headerName !== bodyName) {
      return {
        status: 400,
        code: RPC_HEADER_MISMATCH,
        message: `Header mismatch: Mcp-Name header value '${headerName ?? ''}' does not match body value '${bodyName}'.`,
      }
    }
  }
  return null
}

/**
 * `=?base64?…?=` is the transport's escape hatch for a header value that cannot be
 * plain ASCII. Anything else is returned untouched. Invalid Base64 answers null so
 * the comparison above fails loudly rather than silently matching.
 */
export function decodeHeaderValue(value: string | null): string | null {
  if (value == null) return null
  if (!value.startsWith('=?base64?') || !value.endsWith('?=')) return value
  const encoded = value.slice('=?base64?'.length, -'?='.length)
  try {
    // atob gives bytes-as-latin1; the value was UTF-8 before it was Base64'd.
    const binary = atob(encoded)
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

/**
 * DNS-rebinding protection, which the transport makes a MUST: a page on
 * evil.example could otherwise POST here from a browser that holds a session.
 * An absent Origin (a CLI, a server-side client — what an MCP client normally is)
 * is fine; a PRESENT one must be our own origin. That, plus api/mcp.ts refusing
 * cookie authentication outright, is what lets this endpoint sit in CSRF_EXEMPT.
 */
export function originAllowed(origin: string | null, selfOrigin: string): boolean {
  if (!origin) return true
  if (origin === 'null') return false
  return origin === selfOrigin
}

/**
 * One block of a tool's answer.
 *
 * TEXT WAS NOT ENOUGH ONCE « Les remarques » SHIPPED. A remark carries the screenshot
 * that says what went wrong, and a screenshot described in a sentence is not a
 * screenshot — the model reading the queue would get « il y a une image jointe », which
 * is worth roughly nothing. The protocol defines an image block; this is it. `data` is
 * base64, and the SIZE DISCIPLINE lives at the call site, because a tool that answers
 * with four megabytes of base64 has replaced one problem with a worse one.
 */
export type ToolContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }

/**
 * A successful `tools/call` result.
 *
 * `extra` blocks ride AFTER the text, so a client that renders only the first block
 * still shows the words — the images are the enrichment, never the whole answer.
 */
export function toolResult(
  text: string,
  structured: unknown,
  version: string,
  extra: ToolContent[] = [],
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    content: [{ type: 'text', text } satisfies ToolContent, ...extra],
    isError: false,
  }
  if (structured !== undefined) result.structuredContent = structured
  // `resultType` arrived with 2026-07-28. Sending it to a legacy client would be an
  // unknown extra field — harmless in practice, but the point of tracking the era is
  // to not rely on "harmless in practice".
  if (isModern(version)) result.resultType = 'complete'
  return result
}

/**
 * A TOOL EXECUTION error — the tool ran and could not do the job (a bad date, an
 * unknown id). It is a successful JSON-RPC response carrying `isError: true`,
 * deliberately NOT a protocol error, because the model can read it and correct
 * itself. Protocol errors (unknown tool, malformed request) go through rpcError.
 */
export function toolError(message: string, version: string): Record<string, unknown> {
  const result: Record<string, unknown> = {
    content: [{ type: 'text', text: message } satisfies ToolContent],
    isError: true,
  }
  if (isModern(version)) result.resultType = 'complete'
  return result
}

export function rpcResult(id: string | number | null, result: unknown): unknown {
  return { jsonrpc: '2.0', id, result }
}

export function rpcError(id: string | number | null, code: number, message: string, data?: unknown): unknown {
  const error: Record<string, unknown> = { code, message }
  if (data !== undefined) error.data = data
  return { jsonrpc: '2.0', id, error }
}
