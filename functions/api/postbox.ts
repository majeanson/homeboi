import { ok, badRequest, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { deleteR2Blob } from '../_lib/r2'

// Operator side of « La boîte aux lettres » (#postbox, migration 0085). A relative
// left a message via a writable 'postbox' share link; it landed QUARANTINED here.
// This lists pending messages and, on accept, turns ONE into a board fridge note
// (notes table) attributed to the sender — or frees it on dismiss. The note insert
// runs SERVER-side (not the client /api/notes POST) so we own the tint: a message is
// tinted to a household member ONLY when the sender's name matches one, never to
// whoever happens to be reviewing. Owns the staged-media lifecycle: keep on accept
// (the note owns the blob now), free on dismiss, and sweep abandoned uploads.
// Operator-only. Lives in Réglages ▸ Partage beside the intake review.

const DAY = 86_400

interface PendingMsg {
  id: string
  senderName: string
  text: string
  mediaKind: string | null
  mediaKey: string | null
  sceneKey: string | null
  createdAt: number
}

// GET → every pending message (newest first). Also opportunistically frees abandoned
// staged media (uploaded, but the message was never sent) so R2 can't accumulate —
// anything 'staged', older than a link's max life (7d), and NOT referenced by a
// still-pending message. Best-effort, never blocks the read.
export const onRequestGet = authed(async (ctx, actor) => {
  const hh = actor.householdId
  const rows = await ctx.env.DB.prepare(
    "SELECT id, sender_name, text, media_kind, media_key, scene_key, created_at FROM postbox_submissions WHERE household_id = ? AND status = 'pending' ORDER BY created_at DESC",
  )
    .bind(hh)
    .all<{
      id: string
      sender_name: string | null
      text: string | null
      media_kind: string | null
      media_key: string | null
      scene_key: string | null
      created_at: number
    }>()

  const messages: PendingMsg[] = rows.results.map((r) => ({
    id: r.id,
    senderName: r.sender_name ?? '',
    text: r.text ?? '',
    mediaKind: r.media_kind,
    mediaKey: r.media_key,
    sceneKey: r.scene_key,
    createdAt: r.created_at,
  }))

  const referenced = new Set<string>()
  for (const m of messages) {
    if (m.mediaKey) referenced.add(m.mediaKey)
    if (m.sceneKey) referenced.add(m.sceneKey)
  }
  const cutoff = nowSec() - 7 * DAY
  const stale = await ctx.env.DB.prepare(
    "SELECT id, r2_key FROM postbox_media WHERE household_id = ? AND status = 'staged' AND created_at < ?",
  )
    .bind(hh, cutoff)
    .all<{ id: string; r2_key: string }>()
  for (const m of stale.results) {
    if (referenced.has(m.r2_key)) continue
    await deleteR2Blob(ctx.env.PHOTOS, m.r2_key)
    await ctx.env.DB.prepare('DELETE FROM postbox_media WHERE id = ?').bind(m.id).run()
  }

  return ok({ messages })
}, 'operator')

// PATCH { id, status: 'accepted' | 'dismissed' } → review one message. On accept it
// becomes a board note (kept until cleared like any fridge memo); on dismiss it (and
// its blobs) are freed. Idempotent: a message already reviewed/gone is a no-op.
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; status?: string }>(ctx.request)
  const id = body?.id
  const status = body?.status
  if (!id || (status !== 'accepted' && status !== 'dismissed')) {
    return badRequest('id et status (accepted|dismissed) requis.')
  }
  const hh = actor.householdId

  const row = await ctx.env.DB.prepare(
    "SELECT sender_name, text, media_kind, media_key, scene_key FROM postbox_submissions WHERE id = ? AND household_id = ? AND status = 'pending'",
  )
    .bind(id, hh)
    .first<{
      sender_name: string | null
      text: string | null
      media_kind: string | null
      media_key: string | null
      scene_key: string | null
    }>()
  if (!row) return ok({ ok: true }) // already reviewed / gone — idempotent

  const keys = [row.media_key, row.scene_key].filter((k): k is string => !!k)

  if (status === 'accepted') {
    // Tint to the sender's face ONLY when their name matches a household member;
    // otherwise neutral — the author label still names them. Calm: never the
    // operator's own picked face.
    const member = row.sender_name?.trim()
      ? await ctx.env.DB.prepare('SELECT id FROM members WHERE household_id = ? AND lower(display_name) = lower(?)')
          .bind(hh, row.sender_name.trim())
          .first<{ id: string }>()
      : null
    const kind =
      row.media_kind === 'audio' || row.media_kind === 'drawing' || row.media_kind === 'image'
        ? row.media_kind
        : null
    await ctx.env.DB.prepare(
      'INSERT INTO notes (id, household_id, text, member_id, created_at, media_kind, media_key, scene_key, author_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        newId(),
        hh,
        (row.text ?? '').slice(0, 280),
        member?.id ?? null,
        nowSec(),
        kind,
        kind ? row.media_key : null,
        kind === 'drawing' ? row.scene_key : null,
        row.sender_name?.trim() || null,
      )
      .run()
    // The blobs now belong to the note — drop the staging rows (keep the bytes).
    for (const k of keys) {
      await ctx.env.DB.prepare('DELETE FROM postbox_media WHERE household_id = ? AND r2_key = ?').bind(hh, k).run()
    }
  } else {
    // Dismissed — nothing references the blobs; free them + the staging rows.
    for (const k of keys) {
      await deleteR2Blob(ctx.env.PHOTOS, k)
      await ctx.env.DB.prepare('DELETE FROM postbox_media WHERE household_id = ? AND r2_key = ?').bind(hh, k).run()
    }
  }

  await ctx.env.DB.prepare('UPDATE postbox_submissions SET status = ?, reviewed_at = ? WHERE id = ? AND household_id = ?')
    .bind(status, nowSec(), id, hh)
    .run()
  return ok({ ok: true })
}, 'operator')
