// Tiny response helpers. Use these instead of hand-rolling `new Response` so
// status codes stay consistent across handlers (same idea as the portal's
// _lib/json.ts).

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

function body(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

export const ok = (data: unknown = { ok: true }) => body(data, 200)
export const created = (data: unknown) => body(data, 201)
export const badRequest = (message: string) => body({ error: message }, 400)
export const unauthorized = (message = 'Not signed in.') => body({ error: message }, 401)
export const forbidden = (message = 'Forbidden.') => body({ error: message }, 403)
export const notFound = (message = 'Not found.') => body({ error: message }, 404)
export const conflict = (message: string) => body({ error: message }, 409)
export const serviceUnavailable = (message: string) => body({ error: message }, 503)
export const serverError = (message = 'Something broke.') => body({ error: message }, 500)

// Attach the "an AI call quietly failed" signal to a response, so lib/api on the
// client can pop a notice the user acknowledges into the persistent error log.
// The message is URI-encoded because HTTP header values must be ASCII and ours can
// be French. No-op when nothing failed, so handlers can wrap every return path.
export function withAiError(res: Response, report: { error: string | null }): Response {
  if (report.error) res.headers.set('X-AI-Error', encodeURIComponent(report.error))
  return res
}

// Read + parse a JSON body, returning null on anything malformed so the
// handler can answer with a clean 400 instead of throwing.
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

// Parse a JSON string we stored ourselves (rotation lists, card decks, done-idx
// sets) back into an array, tolerating null/garbage by returning []. An optional
// element guard filters the array so a corrupt row can't inject the wrong type.
export function parseJsonArray<T>(json: string | null | undefined, guard?: (v: unknown) => v is T): T[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    if (!Array.isArray(v)) return []
    return guard ? v.filter(guard) : (v as T[])
  } catch {
    return []
  }
}
