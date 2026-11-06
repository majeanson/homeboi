import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, expect, vi } from 'vitest'

// THE TWO DOORS A HANDLER HAS TO THE OUTSIDE, scripted (solidify, 2026-11-06).
//
// `useFakes()` replaces, for the length of one test file's tests:
//   · `env.AI` — so a model call still takes the whole road through `runModel`, and
//     pays `charge()` on the real `usage_daily`. The fake sits BEHIND the seam, never
//     in place of it: a test that reads the meter is reading what production writes.
//   · `globalThis.fetch` — what every handler calls for the internet. `exports.default`
//     is a Fetcher, not this global, so the request into the Worker stays real.
//
// Both reach the handler because the plugin runs the Worker in the test's own isolate:
// `env` is one object and `fetch` one global. Mutating them is what makes this possible
// with no production hook at all, which is why nothing here needs a seam in the app.
//
// A CALL NOBODY SCRIPTED FAILS THE TEST. Handlers swallow a throw by design (it is their
// degraded path), so a throw alone would read as a quiet `wonder: null`, and a test could
// pass by never reaching what it claims. So the stray is written down and `afterEach`
// fails on it, and no test here can leave the machine.
//
// The binding's own default stays what it was outside this helper: `env.AI` is the real
// binding, whose `.run` throws « Binding AI needs to be run remotely ».

interface ModelCall {
  model: string
  input: unknown
}

interface NetCall {
  url: string
  method: string
  headers: Headers
  body: string | null
}

// A value is the reply; an Error is thrown; a function computes either from the call.
type AiReply = unknown
type NetReply = (call: NetCall) => Response | Promise<Response>
type Matcher = string | RegExp

const hits = (m: Matcher, s: string) => (typeof m === 'string' ? s.includes(m) : m.test(s))

interface Fakes {
  ai: {
    calls: ModelCall[]
    /** The last registered match wins, so a test can override a file-wide default. */
    on(model: Matcher, reply: AiReply): void
    /** Everything the model was sent, as one string: what a prompt test reads. */
    sent(): string
  }
  net: {
    calls: NetCall[]
    on(url: Matcher, reply: NetReply): void
    json(url: Matcher, body: unknown, init?: ResponseInit): void
    /** Requests matching `url`, in order. */
    to(url: Matcher): NetCall[]
  }
  /** Sets a binding or secret until the end of the test (MISTRAL_API_KEY, BROWSER). */
  bind(name: string, value: unknown): void
}

const bindings = env as unknown as Record<string, unknown>

export function useFakes(): Fakes {
  const models: { m: Matcher; reply: AiReply }[] = []
  const routes: { m: Matcher; reply: NetReply }[] = []
  const strays: string[] = []
  const saved = new Map<string, unknown>()

  const fakes: Fakes = {
    ai: {
      calls: [],
      on: (m, reply) => void models.unshift({ m, reply }),
      sent: () => JSON.stringify(fakes.ai.calls.map((c) => c.input)),
    },
    net: {
      calls: [],
      on: (m, reply) => void routes.unshift({ m, reply }),
      json: (m, body, init) => fakes.net.on(m, () => Response.json(body, init)),
      to: (m) => fakes.net.calls.filter((c) => hits(m, c.url)),
    },
    bind(name, value) {
      if (!saved.has(name)) saved.set(name, bindings[name])
      bindings[name] = value
    },
  }

  const run = async (model: string, input: unknown): Promise<unknown> => {
    const call = { model, input }
    fakes.ai.calls.push(call)
    const route = models.find((r) => hits(r.m, model))
    if (!route) {
      strays.push(`model ${model}`)
      throw new Error(`unscripted model: ${model}`)
    }
    const reply = typeof route.reply === 'function' ? (route.reply as (c: ModelCall) => unknown)(call) : route.reply
    if (reply instanceof Error) throw reply
    return reply
  }

  beforeEach(() => {
    models.length = 0
    routes.length = 0
    strays.length = 0
    fakes.ai.calls.length = 0
    fakes.net.calls.length = 0
    fakes.bind('AI', { run })
    // The real binding starts a browser; a door a test wants is one it scripts.
    fakes.bind('BROWSER', '')
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const req = new Request(input as RequestInfo, init)
      const call: NetCall = {
        url: req.url,
        method: req.method,
        headers: req.headers,
        body: init?.body == null ? null : String(init.body),
      }
      fakes.net.calls.push(call)
      const route = routes.find((r) => hits(r.m, call.url))
      if (!route) {
        strays.push(`fetch ${call.url}`)
        throw new Error(`unscripted fetch: ${call.url}`)
      }
      return route.reply(call)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    for (const [name, value] of saved) bindings[name] = value
    saved.clear()
    expect(strays, 'a call this test did not script').toEqual([])
  })

  return fakes
}

// A followed redirect: `Response.url` is read-only and empty on a constructed Response,
// and place-import reads the destination from it.
export function arrivedAt(url: string, res: Response): Response {
  Object.defineProperty(res, 'url', { value: url })
  return res
}
