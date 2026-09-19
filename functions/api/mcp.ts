import type { Env, Ctx } from '../_lib/env'
import { authed } from '../_lib/route'
import type { Actor } from '../_lib/household'
import { forbidden, readJson, tooManyRequests } from '../_lib/json'
import { overAuthLimit } from '../_lib/rateLimit'
import { localDayStart } from '../_lib/ids'
import { resolveLang } from '../_lib/ai'
import { gatherAskSnapshot } from '../_lib/askSnapshot'
import { buildAskPromptLines } from '../_lib/askContext'
import {
  MCP_LATEST,
  MCP_VERSIONS,
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
  RPC_INVALID_PARAMS,
  RPC_METHOD_NOT_FOUND,
  RPC_PARSE_ERROR,
  type RpcMessage,
} from '../_lib/mcp'

import { checkInvariants, summarize as summarizeInvariants } from '../_lib/invariants'

import * as board from './board'
import * as list from './list'
import * as meals from './meals'
import * as month from './month'
import * as recipes from './recipes'
import * as cercle from './cercle'
import * as health from './health'
import * as aiErrors from './ai-errors'

// « La maison, adressable » — an MCP server over the household's OWN data, so an
// agent (Claude on a phone, Claude Code, anything that speaks MCP) can ask what is
// for supper Thursday, what is still on the list, or when the vet appointment is.
//
// ─────────────────────────────────────────────────────────────────────────────────
// IT IS READ-ONLY, ON PURPOSE, AND THAT IS ENFORCED BY CONSTRUCTION.
//
// Not by a flag: there is no write path in this file. Every tool below maps to a GET
// handler, the registry has no POST/PATCH/DELETE entry, and `tools/call` can only
// reach a name in that registry. An agent connected here cannot change the household
// even if it decides it should. Writes are a separate, later decision — the capture
// spine, the undo toast and the outbox all live in the UI, and an agent writing past
// them would be writing past every calm guarantee this app makes.
//
// WHY NO DURABLE OBJECT, NO `agents` PACKAGE, NO SSE. Revision 2026-07-28 of the
// protocol removed transport sessions and the `initialize` handshake: each request is
// self-contained. So the whole server is one POST handler returning one JSON object —
// the same shape as every other endpoint here. _lib/mcp.ts holds the wire (pure,
// unit-tested); this file holds the household.
//
// THE CREDENTIAL IS A DEVICE, NOT A NEW AUTH MODE. An agent is minted from Réglages ▸
// Système ▸ Appareils & accès as a `devices` row with kind='agent' (no migration:
// `kind` has been free TEXT since 0083's 'display'). It therefore shows up in the same
// list as the wall tablets, carries the same last-seen stamp, and is revoked with the
// same trash button. Revocation is the entire reason device pairing beats a static
// capability URL, and an agent token is exactly the kind of credential you want to be
// able to kill from your phone.
//
// AND IT REFUSES A SESSION COOKIE. This endpoint sits in CSRF_EXEMPT (worker/index.ts)
// because an MCP client cannot do the double-submit dance and may have to pass its
// token as `?t=` — the same concession /api/live already makes for a WebSocket
// handshake, which cannot set headers either. A CSRF-exempt POST that accepted the
// operator's cookie would be a genuine cross-site hole, so it does not: `scope` must
// be 'kiosk', which only a token can produce. Plus the Origin check the transport
// mandates. Two independent reasons a browser on another origin gets nothing.
// ─────────────────────────────────────────────────────────────────────────────────

const SERVER_INFO = { name: 'babillard', title: 'Babillard — la maisonnée', version: '1.0.0' }
const DAY = 86400

// ── Tool registry ────────────────────────────────────────────────────────────────
// 10 tools, hand-picked. The temptation was a generic "name a path, get JSON"
// bridge over all 96 endpoints; it was rejected because a tool list is PROMPT — a
// model reads every description on every call, and ninety-six of them would crowd out
// the conversation while making each one less legible. 10 tools that say what they
// are beat ninety-six that do not.
//
// THE NUMBER IS DERIVED, NOT TYPED. It appears here, in STATE.md and in
// worker/mcp.d1.test.ts, and it used to be spelled « eight » in all three — which
// docCounts.test.ts could not see, because its whole job is checking numerals. A
// count written in letters is a count nobody re-derives; CLAUDE.md already tells the
// story of « 74 » surviving long after the real answer was 40. It is a numeral now
// and docCounts owns it.
//
// Eight of the ten proxy the handler that already owns the data, through callRead()
// below. Two do not, and say why where they are defined: `data_invariants` reads D1
// directly (no endpoint answers that question), and `app_health` composes two reads.
// For the other eight: the caps, the household time zone, the recurrence expansion
// and the meal-slot ordering are decided in exactly one place,
// and this server inherits them for free — including the ones added after it shipped.

interface Tool {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  run: (
    ctx: Ctx,
    args: Record<string, unknown>,
    actor: Actor,
  ) => Promise<{ text: string; structured: unknown } | { error: string }>
}

const NO_ARGS = { type: 'object', additionalProperties: false } as const

const TOOLS: Tool[] = [
  {
    name: 'board_today',
    title: 'Le babillard aujourd’hui',
    description:
      "Today on the household board, in one read: the day's agenda (events, appointments), tonight's supper, the shared shopping list, the chores, fridge notes, and what is coming up. This is the household's own glance surface — start here when the question is about today or right now.",
    inputSchema: NO_ARGS,
    run: async (ctx) => {
      const data = await callRead(ctx, board.onRequestGet, 'board')
      if ('error' in data) return data
      return { text: digest(data.json), structured: data.json }
    },
  },
  {
    name: 'meal_plan',
    title: 'Le plan de repas',
    description:
      "The supper plan for the household's rolling window (today through « Jours affichés », 7–14 days). Each entry has a date, a slot (déjeuner / dîner / souper / collation / dessert), a title, and whether it is a leftover. Use this for « qu'est-ce qu'on mange … ».",
    inputSchema: NO_ARGS,
    run: async (ctx) => {
      const data = await callRead(ctx, meals.onRequestGet, 'meals')
      if ('error' in data) return data
      return { text: digest(data.json), structured: data.json }
    },
  },
  {
    name: 'shopping_list',
    title: 'La liste',
    description:
      'The single active shared shopping list: the lines still to buy, in the household’s own hand order. A checked line is a line already picked up. There is only ever one list — this is it.',
    inputSchema: NO_ARGS,
    run: async (ctx) => {
      const data = await callRead(ctx, list.onRequestGet, 'list')
      if ('error' in data) return data
      return { text: digest(data.json), structured: data.json }
    },
  },
  {
    name: 'calendar_range',
    title: 'Le calendrier',
    description:
      'Everything dated in the household between two days: events (one-off and recurring, already expanded), planned meals, recurring chores, day notes, to-dos, home projects and trips. Dates are YYYY-MM-DD in the household’s own time zone. The window is capped at about 13 months.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'First day, inclusive (YYYY-MM-DD).' },
        to: { type: 'string', description: 'Last day, exclusive (YYYY-MM-DD). Defaults to 30 days after `from`.' },
      },
      required: ['from'],
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const from = dayStringToSec(args.from)
      if (from == null) return { error: 'Invalid `from`: expected a date like 2026-09-18.' }
      const to = args.to === undefined ? from + 30 * DAY : dayStringToSec(args.to)
      if (to == null) return { error: 'Invalid `to`: expected a date like 2026-10-18.' }
      if (to <= from) return { error: '`to` must be after `from`.' }
      const data = await callRead(ctx, month.onRequestGet, 'month', `from=${from}&to=${to}`)
      if ('error' in data) return data
      return { text: digest(data.json), structured: data.json }
    },
  },
  {
    name: 'recipes_search',
    title: 'Le livre de recettes',
    description:
      'Search the household’s own recipe book by title or tag. Returns compact cards (id, title, tags, timing, servings) — call recipe_get with an id for the ingredients and steps. With no query, returns the whole book.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Match against the title (accent- and case-insensitive).' },
        tag: { type: 'string', description: 'Match against the recipe’s tags.' },
      },
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const data = await callRead(ctx, recipes.onRequestGet, 'recipes')
      if ('error' in data) return data
      const all = asArray((data.json as { recipes?: unknown }).recipes)
      const q = fold(typeof args.query === 'string' ? args.query : '')
      const tag = fold(typeof args.tag === 'string' ? args.tag : '')
      const hits = all.filter((r) => {
        const rec = r as { title?: unknown; tags?: unknown }
        const okQ = !q || fold(String(rec.title ?? '')).includes(q)
        const okT = !tag || asArray(rec.tags).some((t) => fold(String(t)).includes(tag))
        return okQ && okT
      })
      const cards = hits.map((r) => {
        const rec = r as Record<string, unknown>
        return {
          id: rec.id,
          title: rec.title,
          tags: rec.tags,
          servings: rec.servings,
          totalMin: rec.total_min ?? rec.totalMin,
        }
      })
      const text = cards.length
        ? `${cards.length} recette(s) :\n` + cards.map((c) => `· ${String(c.title)}`).join('\n')
        : 'Aucune recette ne correspond.'
      return { text, structured: { recipes: cards } }
    },
  },
  {
    name: 'recipe_get',
    title: 'Une recette',
    description:
      'One recipe in full: ingredients and steps (both may contain « ## Titre » section headings, which are headings and not items), servings, timing, notes and source. Give the id from recipes_search, or an exact-enough title.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The recipe id from recipes_search.' },
        title: { type: 'string', description: 'The recipe title, if the id is unknown.' },
      },
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const id = typeof args.id === 'string' ? args.id : null
      const title = typeof args.title === 'string' ? fold(args.title) : null
      if (!id && !title) return { error: 'Give either `id` or `title`.' }
      const data = await callRead(ctx, recipes.onRequestGet, 'recipes')
      if ('error' in data) return data
      const all = asArray((data.json as { recipes?: unknown }).recipes)
      const hit = all.find((r) => {
        const rec = r as { id?: unknown; title?: unknown }
        if (id) return rec.id === id
        return fold(String(rec.title ?? '')) === title || fold(String(rec.title ?? '')).includes(title!)
      })
      if (!hit) return { error: id ? `No recipe with id ${id}.` : `No recipe matching « ${String(args.title)} ».` }
      return { text: digest(hit), structured: hit }
    },
  },
  {
    name: 'people_directory',
    title: 'Le cercle',
    description:
      'The household directory: people (members and contacts), their relationships and named groups, plus businesses and services — the vet, the plumber, the daycare — with how to reach them. Use this for « quel est le numéro de … ».',
    inputSchema: NO_ARGS,
    run: async (ctx) => {
      const data = await callRead(ctx, cercle.onRequestGet, 'cercle')
      if ('error' in data) return data
      return { text: digest(data.json), structured: data.json }
    },
  },
  {
    name: 'household_snapshot',
    title: 'Un coup d’œil sur la maisonnée',
    description:
      'Everything at once as short dated lines, the way the household itself reads it: suppers, events (recurring included), birthdays within the year, the list, chores, fridge notes, contacts, services, upkeep coming due, and who works when. Cheaper than several tools and the right first call for a broad or vague question.',
    inputSchema: NO_ARGS,
    run: async (ctx, _args, actor) => {
      // This is the ONE tool that does not proxy a handler, because no endpoint
      // returns this shape: /api/ask spends it on an inference and returns prose.
      // Both callers share _lib/askSnapshot so the windows can never diverge.
      const lang = resolveLang(ctx.env, ctx.request)
      const snapshot = await gatherAskSnapshot(ctx.env, actor.householdId, localDayStart(new Date(Date.now())))
      const lines = buildAskPromptLines(snapshot, lang)
      return { text: lines.join('\n'), structured: snapshot }
    },
  },
  {
    name: 'app_health',
    title: 'Comment l’app se porte',
    description:
      "How the DEPLOYMENT itself is doing, as opposed to the household: which optional bindings are wired (AI, R2 photos, mail, rate limiting, nightly alerts, realtime, cloud OCR), and the household's AI error journal — every AI failure a human actually saw on screen and acknowledged, newest first. Use this when asked why a feature is missing, why something degraded, or what has been going wrong lately.",
    inputSchema: NO_ARGS,
    run: async (ctx) => {
      const [status, errors] = await Promise.all([
        callRead(ctx, health.onRequestGet, 'health'),
        callRead(ctx, aiErrors.onRequestGet, 'ai-errors'),
      ])
      if ('error' in status) return status
      // The AI journal is household-scoped and may legitimately refuse (it is authed);
      // a health answer without it still beats no answer at all.
      const log = 'error' in errors ? { errors: [] } : (errors.json as { errors?: unknown[] })
      const rows = asArray(log?.errors)
      const bindings = status.json as Record<string, unknown>
      const off = Object.entries(bindings)
        .filter(([k, v]) => v === false && k !== 'ok')
        .map(([k]) => k)
      const lines = [
        `Bindings absents ou éteints : ${off.length === 0 ? 'aucun' : off.join(', ')}`,
        `Journal d'erreurs IA : ${rows.length} entrée(s)`,
        // NOT the nightly report. runNightly() only ever console.logs, and its real
        // deps WRITE (an R2 backup, the sandbox sweep) — calling it to read it would
        // make a diagnostic tool mutate the account. Say so rather than fake it.
        "Le rapport du cron de nuit n'est pas conservé (nightly.ts journalise seulement) — il n'est pas lisible ici.",
        ...rows.slice(0, 20).map((r) => {
          const e = r as { feature?: unknown; message?: unknown; created_at?: unknown }
          return `· ${String(e.feature ?? '?')} — ${String(e.message ?? '')}`
        }),
      ]
      return { text: lines.join('\n'), structured: { bindings, aiErrors: rows } }
    },
  },
  {
    name: 'data_invariants',
    title: 'Les lois de la base, vérifiées pour vrai',
    description:
      "Check this household's rows against the schema laws this codebase writes down but never verifies at run time: the media_key/media_kind pair, scene_key only on drawings, JSON columns holding JSON of the promised shape, member references that resolve INSIDE this household, flyer deals that outlived their flyer, duplicate hand-placed list positions, updated_at before created_at, and tables with no household scope. READ-ONLY — it reports, it never repairs. An answer of « not checked » is not the same as « fine », and it says which.",
    inputSchema: NO_ARGS,
    run: async (ctx, _args, actor) => {
      const report = await checkInvariants(ctx.env.DB, actor.householdId)
      return { text: summarizeInvariants(report), structured: report }
    },
  },
]

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]))

/** What `tools/list` advertises — the registry minus the code. */
function toolDescriptors(): unknown[] {
  return TOOLS.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    // Read-only and side-effect-free, and worth SAYING: a client that surfaces
    // annotations can skip a confirmation prompt it would otherwise show.
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }))
}

// ── Calling our own handlers ─────────────────────────────────────────────────────

/**
 * Run one of this app's GET handlers and hand back its JSON.
 *
 * The handler re-authenticates from the forwarded token — that is the point, not an
 * oversight: `authed()` runs for real, so the household scoping, the guest/display
 * write blocks and the per-request time zone all apply exactly as they do to an HTTP
 * caller. A tool cannot reach data the credential could not have fetched itself.
 */
async function callRead(
  ctx: Ctx,
  handler: PagesFunction<Env>,
  path: string,
  search = '',
): Promise<{ json: unknown } | { error: string }> {
  const url = new URL(ctx.request.url)
  url.pathname = `/api/${path}`
  url.search = search
  const headers = new Headers()
  const token = deviceToken(ctx.request)
  if (token) headers.set('X-Device-Token', token)
  const lang = ctx.request.headers.get('X-Lang')
  if (lang) headers.set('X-Lang', lang)

  const res = await handler({
    ...ctx,
    request: new Request(url.toString(), { method: 'GET', headers }),
    params: {},
    functionPath: `/api/${path}`,
  } as Ctx)

  if (!res.ok) return { error: `The household refused that read (${res.status}).` }
  try {
    return { json: await res.json() }
  } catch {
    return { error: 'The household returned something unreadable.' }
  }
}

/** The token, from the header or from `?t=` (see the CSRF note at the top). */
function deviceToken(request: Request): string | null {
  const header = request.headers.get('X-Device-Token')
  if (header) return header
  try {
    return new URL(request.url).searchParams.get('t')
  } catch {
    return null
  }
}

// ── Small helpers ────────────────────────────────────────────────────────────────

/** Accent- and case-insensitive fold, so « crêpes » matches "crepes". */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

/**
 * YYYY-MM-DD → the unix second of that day's LOCAL midnight in the household's zone.
 *
 * Built through noon UTC rather than midnight: localDayStart maps an instant to its
 * local day, and midnight UTC falls on the PREVIOUS local day for every western zone
 * (Toronto is UTC−4/−5), so `2026-09-18` would have answered the 17th. Noon is safely
 * inside the day for every zone within ±12 h, which is all of them. The fixed-86400
 * trap the codebase warns about is avoided the same way — nothing here adds days by
 * arithmetic on seconds.
 */
function dayStringToSec(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim())
  if (!m) return null
  const [, y, mo, d] = m
  const noonUtc = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12, 0, 0))
  if (Number.isNaN(noonUtc.getTime())) return null
  return localDayStart(noonUtc)
}

/**
 * A short human-readable rendering beside the structured payload. The spec asks a tool
 * that returns structured content to ALSO return serialized text, so a client that
 * cannot read `structuredContent` still gets the answer; this keeps that honest while
 * capping what an enormous household could put in a single model context.
 */
const TEXT_CAP = 12_000
function digest(json: unknown): string {
  const text = JSON.stringify(json, null, 1)
  return text.length <= TEXT_CAP ? text : text.slice(0, TEXT_CAP) + '\n… (tronqué)'
}

// ── The endpoint ─────────────────────────────────────────────────────────────────

export const onRequestPost = authed(
  async (ctx, actor) => {
  // 1. Only a token credential. An operator SESSION reaching here would mean a
  //    cross-site POST rode the cookie past a CSRF-exempt route — see the header.
  if (actor.scope !== 'kiosk') {
    return forbidden('Le serveur MCP demande un jeton d’agent, pas une session.')
  }
  // A read-only 'display' device (a TV) has no business holding an agent's tools.
  if (actor.deviceKind !== 'agent') {
    return forbidden('Ce jeton n’est pas un jeton d’agent.')
  }

  // 2. DNS-rebinding protection, which the transport makes a MUST.
  const selfOrigin = new URL(ctx.request.url).origin
  if (!originAllowed(ctx.request.headers.get('Origin'), selfOrigin)) {
    return forbidden('Origin refusée.')
  }

  // 3. A bound on invocations, as the spec asks. The generous per-address one: this
  //    is a credentialled read-only endpoint, so the limiter is a guard against a
  //    runaway loop, not an accounting system.
  if (await overAuthLimit(ctx.env, ctx.request)) return tooManyRequests()

  const raw = await readJson<unknown>(ctx.request)
  if (raw === null) return httpRpc(400, rpcError(null, RPC_PARSE_ERROR, 'Body must be JSON.'))

  const parsed = parseRpc(raw)
  if ('status' in parsed) return httpRpc(parsed.status, rpcError(null, parsed.code, parsed.message))
  const msg: RpcMessage = parsed

  const headerVersion = ctx.request.headers.get('MCP-Protocol-Version')
  const version = negotiateVersion(msg.params, headerVersion)
  if (!isKnownVersion(version)) {
    // 400 with a recognizable JSON-RPC error: a modern client is told to retry with a
    // version we list, and a client that cannot read it falls back to `initialize`,
    // which we also answer. Either way it connects.
    return httpRpc(
      400,
      rpcError(msg.id, RPC_INVALID_PARAMS, `Unsupported protocol version '${version}'.`, {
        supported: [...MCP_VERSIONS],
      }),
    )
  }

  // 4. The header↔body mirror check, modern revision only.
  if (isModern(version)) {
    const fault = validateMirrorHeaders(msg, {
      protocolVersion: headerVersion,
      method: ctx.request.headers.get('Mcp-Method'),
      name: ctx.request.headers.get('Mcp-Name'),
    })
    if (fault) return httpRpc(fault.status, rpcError(msg.id, fault.code, fault.message))
  }

  // 5. A notification gets 202 and no body — always, including the legacy era's
  //    `notifications/initialized`, which needs no work from us.
  if (msg.isNotification) return new Response(null, { status: 202 })

  switch (msg.method) {
    // The legacy handshake. Answered for the initialize-era clients; on the modern
    // revision there is no such method and it falls through to 404, which is correct.
    case 'initialize': {
      if (isModern(version)) break
      const asked = typeof msg.params.protocolVersion === 'string' ? msg.params.protocolVersion : version
      return httpRpc(
        200,
        rpcResult(msg.id, {
          protocolVersion: isKnownVersion(asked) ? asked : MCP_LATEST,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            'Babillard is one household’s own board: meals, the shared list, the calendar, recipes and the family directory — plus how the app itself is doing (app_health) and whether its own schema laws still hold (data_invariants). Every tool is READ-ONLY — nothing here can change the household. Answer in the household’s language (Québec French unless asked otherwise).',
        }),
      )
    }
    case 'ping':
      return httpRpc(200, rpcResult(msg.id, {}))
    case 'tools/list': {
      const result: Record<string, unknown> = { tools: toolDescriptors() }
      if (isModern(version)) result.resultType = 'complete'
      return httpRpc(200, rpcResult(msg.id, result))
    }
    case 'tools/call': {
      const name = typeof msg.params.name === 'string' ? msg.params.name : ''
      const tool = BY_NAME.get(name)
      // An unknown tool is a PROTOCOL error (the model cannot fix it by retrying with
      // different arguments); a tool that ran and failed is a tool error, below.
      if (!tool) return httpRpc(404, rpcError(msg.id, RPC_METHOD_NOT_FOUND, `Unknown tool: ${name}`))
      const args =
        msg.params.arguments != null && typeof msg.params.arguments === 'object' && !Array.isArray(msg.params.arguments)
          ? (msg.params.arguments as Record<string, unknown>)
          : {}
      const out = await tool.run(ctx, args, actor)
      if ('error' in out) return httpRpc(200, rpcResult(msg.id, toolError(out.error, version)))
      return httpRpc(200, rpcResult(msg.id, toolResult(out.text, out.structured, version)))
    }
  }

  // Everything else — including resources/*, prompts/* and the subscription stream we
  // deliberately do not offer. 404 + -32601 is what the transport asks for, and the
  // JSON-RPC body is what tells a client this is a live MCP endpoint rather than a
  // wrong URL.
  return httpRpc(404, rpcError(msg.id, RPC_METHOD_NOT_FOUND, `Method not found: ${msg.method}`))
  },
  undefined,
  // This POST is a READ. Without it, the read-only 'agent' device kind this server
  // exists for would be blocked by the very gate that keeps it read-only everywhere
  // else. See the note on authed() — it relaxes the device-kind gate and nothing else.
  { readOnlyPost: true },
)

/** One JSON-RPC object, one HTTP response. Never SSE: no tool here streams. */
function httpRpc(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

// A GET or DELETE to the MCP endpoint is an older client reaching for the removed
// standalone SSE stream or a session teardown. The transport says answer 405; the
// route table would answer 405 anyway for a missing export, but saying it here makes
// the intent readable and survives someone adding an onRequestGet by habit.
// (Two separate bindings rather than `onRequestDelete = onRequestGet`: the route
// table reads these as distinct method handlers, and an alias reads as a duplicate
// export to knip — which is the gate that caught it.)
const mcpMethodNotAllowed = () => new Response(null, { status: 405, headers: { allow: 'POST' } })
export const onRequestGet = () => mcpMethodNotAllowed()
export const onRequestDelete = () => mcpMethodNotAllowed()
