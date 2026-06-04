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
export const tooManyRequests = (message = 'Slow down.') => body({ error: message }, 429)
export const serviceUnavailable = (message: string) => body({ error: message }, 503)
export const serverError = (message = 'Something broke.') => body({ error: message }, 500)

// Read + parse a JSON body, returning null on anything malformed so the
// handler can answer with a clean 400 instead of throwing.
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}
