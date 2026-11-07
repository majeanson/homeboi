import type { Wire } from './wire'

// Tiny response helpers. Use these instead of hand-rolling `new Response` so
// status codes stay consistent across handlers (same idea as the portal's
// _lib/json.ts).

// `no-store` is not decoration. Every one of these bodies is per-household data
// behind a session cookie or a device token, and until 2026-09-02 they went out
// with NO cache directive at all (verified against production: /api/board answered
// with content-type and nothing else). That leaves freshness to heuristics in the
// browser, any intermediary, and iOS's back-forward cache — on a surface whose whole
// correctness story is "the poll reconciles", a frame served from a cache is a frame
// that can show a row the household already deleted. Freshness is TanStack's job;
// the transport must not second-guess it. Image bytes are NOT affected: /api/img/*
// builds its own Response (cache-first by design, capability-keyed and immutable).
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

function body(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

export const ok = (data: unknown = { ok: true }) => body(data, 200)
// THE SERVER SIDE OF THE WIRE CONTRACT. `Wire` (_lib/wire.ts) types what e2e/mocks.ts stubs;
// okWire binds a GET handler to the same entry, so the two sides are one compile error
// apart. Plain assignability would only hold half of that: a missing key fails, but a row
// from `.map()` or `.all<Row>()` is not a fresh literal, so an EXTRA key passes in silence,
// and most keys live in rows. NoExtra turns any key `Wire` does not know, at any depth,
// into `never`. The route is an argument and not a type parameter because TypeScript cannot
// infer T beside an explicit R, and because mocksContract.test.ts greps it.
//
// What this cannot see: `.all<Row>()` is a cast, so a column added to a SELECT without
// touching Row stays invisible. And `any` (JSON.parse) and `unknown` in Wire end the check
// at that depth. Same bytes as ok(): this function adds nothing at run time.
type Fit<T, W> = W extends unknown ? (T extends W ? W : never) : never
type KeysOf<W> = W extends unknown ? keyof W : never
type Prop<W, K> = W extends unknown ? (K extends keyof W ? W[K] : never) : never
type Item<W> = W extends readonly (infer V)[] ? V : never
type NoExtra<T, W> = 0 extends 1 & T
  ? T
  : unknown extends W
    ? T
    : T extends readonly (infer E)[]
      ? NoExtra<E, Item<W>>[]
      : T extends object
        ? { [K in keyof T]: K extends KeysOf<Fit<T, W>> ? NoExtra<T[K], Prop<Fit<T, W>, K>> : never }
        : T
export const okWire = <R extends keyof Wire, T extends Wire[R]>(_route: R, data: T & NoExtra<T, Wire[R]>) => ok(data)

export const created = (data: unknown) => body(data, 201)
export const badRequest = (message: string) => body({ error: message }, 400)
export const unauthorized = (message = 'Not signed in.') => body({ error: message }, 401)
export const forbidden = (message = 'Forbidden.') => body({ error: message }, 403)
export const notFound = (message = 'Not found.') => body({ error: message }, 404)
// `code` is optional and machine-readable: use it only when ONE status carries two
// outcomes that need different words on screen, and the alternative would be the
// client matching substrings of `message` (which breaks on an edit, and in the other
// language). operator-join's two 409s are the reason it exists — both are honestly
// conflicts, so splitting them across statuses would misreport one. src/lib/api.ts
// surfaces it as ApiError.code / errorCode().
export const conflict = (message: string, code?: string) => body(code ? { error: message, code } : { error: message }, 409)
// 429 carries Retry-After (the limiter's period, _lib/rateLimit.ts) so a well-behaved
// client — and the person reading the sentence — knows how long a minute is.
export const tooManyRequests = (message = 'Trop d’essais. Réessaie dans une minute.') =>
  new Response(JSON.stringify({ error: message }), { status: 429, headers: { ...JSON_HEADERS, 'retry-after': '60' } })
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
