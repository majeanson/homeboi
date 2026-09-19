import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { profileMemberId } from '../_lib/profile'
import { deleteR2Blob } from '../_lib/r2'
import { isValidR2Key } from '../_lib/validate'

// « Les remarques » (0136) — what the household notices about the app, and the human
// half of the loop that closes it.
//
// THREE WRITERS TOUCH A REMARK, AND ONLY TWO ARE HERE. This file is the household's
// side: file one, confirm a fix, re-open one that did not take, delete. The DEPLOY
// PIPELINE's callback is a separate, deliberately tiny endpoint that can only ever set
// 'shipped' — it is not `authed()`, it has no Actor, and it can never write
// 'confirmed'. The agent reading the queue through the MCP server writes nothing at
// all. « Réglé » therefore means a human said so, always.
//
// STATUS IS A PROJECTION of the last event (see the migration header). Every writer
// that advances it carries `AND status <> 'confirmed'`, so nothing can drag a remark
// Marc has already blessed back into the queue.

const KINDS = new Set(['bug', 'wish', 'polish'])
const TITLE_CAP = 200
const BODY_CAP = 4000
const NOTE_CAP = 2000
const PATH_CAP = 300
const BUILD_CAP = 80
const HELP_CAP = 120
// The auto-captured context is a convenience, not a record. Capped hard because it is
// assembled by the client and includes the last console errors, which are unbounded by
// nature.
const CONTEXT_CAP = 4000

interface RemarkRow {
  id: string
  kind: string
  title: string
  body: string
  help_key: string | null
  seen_path: string | null
  seen_build: string | null
  context_json: string
  status: string
  reported_by: string | null
  created_at: number
  updated_at: number
}

interface EventRow {
  id: string
  remark_id: string
  kind: string
  text: string
  sha: string | null
  media_kind: string | null
  media_key: string | null
  scene_key: string | null
  author_member_id: string | null
  created_at: number
}

/** The attachment, validated. Returns the trio or an error Response.
 *  The pair is an INVARIANT: media_key is set iff media_kind is set. */
function readMedia(
  body: { media_kind?: string | null; media_key?: string | null; scene_key?: string | null } | null,
): { kind: string | null; key: string | null; scene: string | null } | { error: Response } {
  const want = body?.media_kind
  if (want === null || want === '' || want === undefined) return { kind: null, key: null, scene: null }
  if (want !== 'image' && want !== 'drawing' && want !== 'audio') return { error: badRequest('media_kind invalide.') }
  const key = body?.media_key?.trim()
  if (!isValidR2Key(key)) return { error: badRequest('media_key invalide.') }
  // Only a drawing carries a re-editable scene; an image and an audio clip never do.
  const scene = want === 'drawing' && isValidR2Key(body?.scene_key?.trim()) ? body!.scene_key!.trim() : null
  return { kind: want, key: key!, scene }
}

export const onRequestGet = authed(async (ctx, actor) => {
  const { results: remarks } = await ctx.env.DB.prepare(
    `SELECT id, kind, title, body, help_key, seen_path, seen_build, context_json, status, reported_by, created_at, updated_at
       FROM remarks WHERE household_id = ?1 AND deleted_at IS NULL
      ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'shipped' THEN 1 ELSE 2 END, created_at DESC`,
  )
    .bind(actor.householdId)
    .all<RemarkRow>()

  // The journal in the same read: every surface that shows a remark shows what has
  // happened to it, and a second round trip per row would make the list unusable.
  //
  // ORDERED BY created_at THEN rowid, and the tiebreak is load-bearing. Timestamps here
  // are unix SECONDS, and « pas réglé » followed by a re-ship can easily land inside one
  // — at which point a bare `ORDER BY created_at` renders the journal in whatever order
  // SQLite feels like, which for a journal is the one thing it must never do. rowid is
  // insertion order, so the story reads in the order it happened. (Found by
  // worker/remarks.d1.test.ts, which planted two events a second apart and got them
  // back shuffled.)
  const { results: events } = await ctx.env.DB.prepare(
    `SELECT e.id, e.remark_id, e.kind, e.text, e.sha, e.media_kind, e.media_key, e.scene_key, e.author_member_id, e.created_at
       FROM remark_events e JOIN remarks r ON r.id = e.remark_id
      WHERE r.household_id = ?1 AND r.deleted_at IS NULL
      ORDER BY e.created_at ASC, e.rowid ASC`,
  )
    .bind(actor.householdId)
    .all<EventRow>()

  const byRemark = new Map<string, EventRow[]>()
  for (const e of events) {
    const list = byRemark.get(e.remark_id)
    if (list) list.push(e)
    else byRemark.set(e.remark_id, [e])
  }
  return ok({ remarks: remarks.map((r) => ({ ...r, events: byRemark.get(r.id) ?? [] })) })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    kind?: string
    title?: string
    body?: string
    help_key?: string
    seen_path?: string
    seen_build?: string
    context?: unknown
    media_kind?: string | null
    media_key?: string | null
    scene_key?: string | null
  }>(ctx.request)

  const title = body?.title?.trim().slice(0, TITLE_CAP)
  if (!title) return badRequest('Titre requis.')
  const kind = body?.kind && KINDS.has(body.kind) ? body.kind : 'bug'

  const media = readMedia(body ?? null)
  if ('error' in media) return media.error

  // The context object is stored as text; an object that will not stringify, or one
  // that busts the cap, becomes '{}' rather than failing the report. Someone is trying
  // to tell us something broke — losing their words over their diagnostics would be
  // the wrong trade.
  let context = '{}'
  try {
    const serialized = JSON.stringify(body?.context ?? {})
    if (serialized && serialized.length <= CONTEXT_CAP && serialized.startsWith('{')) context = serialized
  } catch {
    /* keep '{}' */
  }

  const id = newId()
  const at = nowSec()
  const author = profileMemberId(ctx.request)
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      `INSERT INTO remarks (id, household_id, kind, title, body, help_key, seen_path, seen_build, context_json, status, reported_by, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'open', ?10, ?11, ?11)`,
    ).bind(
      id,
      actor.householdId,
      kind,
      title,
      body?.body?.trim().slice(0, BODY_CAP) ?? '',
      body?.help_key?.trim().slice(0, HELP_CAP) || null,
      body?.seen_path?.trim().slice(0, PATH_CAP) || null,
      body?.seen_build?.trim().slice(0, BUILD_CAP) || null,
      context,
      author,
      at,
    ),
    // The opening entry of the journal. It carries the attachment, so the trio lives in
    // exactly one place for every kind of entry (see the migration header).
    ctx.env.DB.prepare(
      `INSERT INTO remark_events (id, remark_id, kind, text, sha, media_kind, media_key, scene_key, author_member_id, created_at)
       VALUES (?1, ?2, 'filed', '', NULL, ?3, ?4, ?5, ?6, ?7)`,
    ).bind(newId(), id, media.kind, media.key, media.scene, author, at),
  ])
  return ok({ id })
})

// The human verdict. `action` is 'confirm' (it really is fixed) or 'reopen' (it is
// not), each appending an event that keeps what was said — so a remark fixed twice
// keeps BOTH explanations and the note that rejected the first one.
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    id?: string
    action?: string
    note?: string
    media_kind?: string | null
    media_key?: string | null
    scene_key?: string | null
  }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  const action = body?.action
  if (action !== 'confirm' && action !== 'reopen') return badRequest('action invalide.')

  const row = await ctx.env.DB.prepare(
    'SELECT id, status FROM remarks WHERE id = ?1 AND household_id = ?2 AND deleted_at IS NULL',
  )
    .bind(id, actor.householdId)
    .first<{ id: string; status: string }>()
  if (!row) return notFound('Remarque introuvable.')

  const media = readMedia(body ?? null)
  if ('error' in media) return media.error

  const at = nowSec()
  const status = action === 'confirm' ? 'confirmed' : 'open'
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      `INSERT INTO remark_events (id, remark_id, kind, text, sha, media_kind, media_key, scene_key, author_member_id, created_at)
       VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?7, ?8, ?9)`,
    ).bind(
      newId(),
      id,
      action === 'confirm' ? 'confirmed' : 'reopened',
      body?.note?.trim().slice(0, NOTE_CAP) ?? '',
      media.kind,
      media.key,
      media.scene,
      profileMemberId(ctx.request),
      at,
    ),
    ctx.env.DB.prepare('UPDATE remarks SET status = ?1, updated_at = ?2 WHERE id = ?3 AND household_id = ?4').bind(
      status,
      at,
      id,
      actor.householdId,
    ),
  ])
  return ok({ id, status })
})

// SOFT delete. A remark is addressable BY ID FROM OUTSIDE — the deploy callback names
// one — so a hard delete would have the pipeline 404 against a row that was here a
// second ago, and any compensating restore would have to bring the journal back too,
// racing that same pipeline. Soft makes « supprimé se lit comme inconnu » one rule with
// one statement, and keeps the paper trail a journal exists for.
//
// The R2 blobs go for real, though: nothing will ever show them again, and
// deleteR2Blob no-ops on an unset bucket.
export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')

  const row = await ctx.env.DB.prepare(
    'SELECT id FROM remarks WHERE id = ?1 AND household_id = ?2 AND deleted_at IS NULL',
  )
    .bind(id, actor.householdId)
    .first<{ id: string }>()
  if (!row) return notFound('Remarque introuvable.')

  const { results: blobs } = await ctx.env.DB.prepare(
    'SELECT media_key, scene_key FROM remark_events WHERE remark_id = ?1',
  )
    .bind(id)
    .all<{ media_key: string | null; scene_key: string | null }>()
  for (const b of blobs) {
    await deleteR2Blob(ctx.env.PHOTOS, b.media_key)
    await deleteR2Blob(ctx.env.PHOTOS, b.scene_key)
  }

  await ctx.env.DB.prepare('UPDATE remarks SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2 AND household_id = ?3')
    .bind(nowSec(), id, actor.householdId)
    .run()
  return ok({ ok: true })
})
