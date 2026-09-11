import { open } from './secretBox'

// THE FLIPP ACCOUNTS CLIENT — writing a household's Flipp list from our server, so
// deals with their clipping reach the Flipp app without a tap per item (« Lier
// Flipp », migration 0124). This is Flipp's PRIVATE accounts API, the same calls
// their web page makes (read from their bundle 2026-09-10):
//   GET  {ACCOUNTS}/v1/users/{uid}/shopping_lists            → { shopping_lists: [{id}] }
//   GET  {ACCOUNTS}/v1/users/{uid}/shopping_lists/{listId}   → the list (+ commit_version)
//   PUT  {ACCOUNTS}/v1/users/{uid}/shopping_lists/{listId}   → apply { commit_version, _ops }
//   POST {ACCOUNTS}/v1/users/{uid}/shopping_lists            → create a list
// Auth is one header: `Authorization: Token token=<access_token>`. No cookies, no
// CSRF — it is a bearer call. The gateway answers a non-browser client (probed: a
// bad token gets a clean 401 JSON, not a bot wall).
//
// Everything here is best-effort and FALLIBLE by nature — a private API can move
// without notice. Every failure returns a reason string (surfaced on the Réglages
// card + weekly contract), never throws into the caller's flow.

const ACCOUNTS = 'https://cdn-gateflipp.flippback.com/accounts'

export interface FlippLinkRow {
  household_id: string
  flipp_user_id: string
  access_token_enc: string
  list_id: string | null
  email: string | null
}

export interface Clipping {
  flyerItemId: number
  name: string
  flyerId: number | null
  price: string | null
  merchantId: number | null
  merchantName: string
  merchantLogoUrl: string | null
  thumbnailUrl: string | null
  validTo: string | null
  // The item's box on its flyer — kept so the pushed op matches a real clipping
  // (Flipp's `createOp` carries it); optional, older staged deals lack it.
  left?: number | null
  right?: number | null
  top?: number | null
  bottom?: number | null
  // The cutout image Flipp's list renderer actually draws (`FlyerItem.cutout_image_url`),
  // added 2026-09-11 to try to get an injected clipping to render without a details fetch.
  cutoutImageUrl?: string | null
}

/** The current list, as GET returns it — for commit_version + de-dupe + replace/clear. */
export interface ServerList {
  commit_version?: number
  flyer_item_clippings?: { id?: string | number; flyer_item_id?: number; commit_version?: number; term?: string }[]
  list_items?: { id?: string | number; term?: string; commit_version?: number }[]
}

/** A delete op for a row already on the list (its own id + commit_version). Used to
 *  CLEAR the list and to REPLACE a stale clipping with a fresh one (new fields). */
function deleteOp(type: 'flyer_item_clipping' | 'list_item', row: { id?: string | number; commit_version?: number }) {
  return { verb: 'delete', object: { id: row.id ?? null, commit_version: row.commit_version ?? null, type } }
}

/** Every existing clipping + typed item as a delete op — « Vider ma liste Flipp ». */
export function clearOps(existing: ServerList): unknown[] {
  const ops: unknown[] = []
  for (const c of existing.flyer_item_clippings ?? []) if (c.id != null) ops.push(deleteOp('flyer_item_clipping', c))
  for (const i of existing.list_items ?? []) if (i.id != null) ops.push(deleteOp('list_item', i))
  return ops
}

/** The ops to send for a payload against what the list already holds: a clipping
 *  already there (by flyer item) or a term already there (case-insensitive) is not
 *  sent again — the same uniqueness Flipp's own merge applies. PURE, so tested in
 *  isolation (the fragile half of the push). Names/terms are length-capped defensively.
 *  Geometry rides through, matching `SLFlyerItemClipping.createOp('post')`. */
export function buildOps(clippings: Clipping[], items: string[], existing: ServerList, replace = false): { ops: unknown[]; skipped: number } {
  const byId = new Map((existing.flyer_item_clippings ?? []).filter((c) => typeof c.flyer_item_id === 'number').map((c) => [c.flyer_item_id as number, c]))
  const haveIds = new Set(byId.keys())
  const haveTerms = new Set((existing.list_items ?? []).map((i) => String(i.term ?? '').trim().toLowerCase()).filter(Boolean))
  const ops: unknown[] = []
  let skipped = 0
  for (const c of clippings) {
    if (!c || typeof c.flyerItemId !== 'number' || !c.name) continue
    if (haveIds.has(c.flyerItemId)) {
      if (!replace) {
        skipped++
        continue
      }
      // REPLACE: drop the stale row first (a re-send with fresh fields — the fix for
      // a clipping that rendered broken because it was injected without cutout data).
      const existingRow = byId.get(c.flyerItemId)
      if (existingRow?.id != null) ops.push(deleteOp('flyer_item_clipping', existingRow))
    }
    haveIds.add(c.flyerItemId)
    ops.push({
      verb: 'post',
      object: {
        id: null,
        commit_version: null,
        type: 'flyer_item_clipping',
        flyer_item_id: c.flyerItemId,
        name: String(c.name).slice(0, 200),
        flyer_id: c.flyerId ?? null,
        right: c.right ?? null,
        left: c.left ?? null,
        top: c.top ?? null,
        bottom: c.bottom ?? null,
        price: c.price == null ? null : String(c.price),
        merchant_id: c.merchantId ?? null,
        merchant_name: String(c.merchantName ?? ''),
        merchant_logo_url: c.merchantLogoUrl ?? null,
        thumbnail_url: c.thumbnailUrl ?? null,
        cutout_image_url: c.cutoutImageUrl ?? c.thumbnailUrl ?? null,
        valid_to: c.validTo ?? null,
      },
    })
  }
  for (const raw of items) {
    const term = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
    const key = term.toLowerCase()
    if (!term) continue
    if (haveTerms.has(key)) {
      skipped++
      continue
    }
    haveTerms.add(key)
    ops.push({ verb: 'post', object: { id: null, commit_version: null, type: 'list_item', term, checked: false } })
  }
  return { ops, skipped }
}

async function api(token: string, path: string, init?: RequestInit): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${ACCOUNTS}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Token token=${token}`, ...(init?.headers ?? {}) },
  })
  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    /* an empty/non-JSON body is fine — the status carries the verdict */
  }
  return { status: res.status, json }
}

export interface PushResult {
  ok: boolean
  listId?: string
  added: number
  /** Sent items already on the Flipp list (a re-send, not a failure). */
  skipped?: number
  error?: string
  /** A compact trace of what Flipp actually did — surfaced while we learn their
   *  private API's real behaviour (deals reported sent but not showing in the app,
   *  2026-09-11). `lists:N list:ID had:H ops:O put:STATUS now:A`. */
  diag?: string
}

/** Push clippings + typed items into the household's Flipp account list. Resolves
 *  the token (decrypt), finds or creates the list, applies the ops. `existingIds`
 *  is filled with the flyer_item_ids already on the list so a re-send never
 *  duplicates. Never throws — a private API failure comes back as `error`. */
export async function pushToFlipp(
  link: FlippLinkRow,
  secret: string | undefined,
  clippings: Clipping[],
  items: string[],
  mode: 'add' | 'replace' | 'clear' = 'add',
): Promise<PushResult> {
  const token = await open(link.access_token_enc, secret)
  if (!token) return { ok: false, added: 0, error: 'token-unreadable' }
  const base = `/v1/users/${link.flipp_user_id}/shopping_lists`
  const clipCount = (l: unknown) => (((l as ServerList)?.flyer_item_clippings ?? []).length)

  // 1. ALL the account's lists — the count is part of the trace (a write to the wrong
  //    one of several would look like a silent no-op). Choose the stored list, else the
  //    first, else create one — the same `listIds[0]` their own web app uses.
  const lists = await api(token, base)
  if (lists.status === 401) return { ok: false, added: 0, error: 'unauthorized', diag: 'lists:401' }
  const ids = (lists.json as { shopping_lists?: { id: string }[] })?.shopping_lists?.map((l) => l.id) ?? []
  let listId: string | null = link.list_id ?? ids[0] ?? null
  if (!listId) {
    const made = await api(token, base, { method: 'POST' })
    if (made.status >= 400) return { ok: false, added: 0, error: `create-${made.status}`, diag: `lists:0 create:${made.status}` }
    listId = (made.json as { id?: string })?.id ?? null
  }
  if (!listId) return { ok: false, added: 0, error: 'no-list', diag: `lists:${ids.length} no-id` }

  // 2. The chosen list, for commit_version + de-dupe + the "before" count.
  const cur = await api(token, `${base}/${listId}`)
  if (cur.status === 401) return { ok: false, added: 0, error: 'unauthorized', diag: `lists:${ids.length} get:401` }
  if (cur.status >= 400) return { ok: false, added: 0, error: `get-${cur.status}`, diag: `lists:${ids.length} get:${cur.status}` }
  const list = cur.json as ServerList
  const had = clipCount(list)

  // « Vider ma liste Flipp » — delete every clipping + typed item (Marc's list stuck
  // with un-renderable clippings, 2026-09-11). Otherwise add, or REPLACE (drop a
  // stale clipping then re-post it with fresh fields, the render-fix attempt).
  const { ops, skipped } = mode === 'clear' ? { ops: clearOps(list), skipped: 0 } : buildOps(clippings, items, list, mode === 'replace')
  if (!ops.length) return { ok: true, listId, added: 0, skipped, diag: `lists:${ids.length} list:${listId} had:${had} ops:0 mode:${mode}` }

  // 3. Apply, then RE-READ to prove the server actually took the ops (now > had) —
  //    the fact that tells "app didn't sync" from "PUT was a silent no-op".
  const put = await api(token, `${base}/${listId}`, {
    method: 'PUT',
    body: JSON.stringify({ commit_version: list.commit_version ?? 0, _ops: ops }),
  })
  const after = await api(token, `${base}/${listId}`)
  const now = clipCount(after.json)
  const diag = `lists:${ids.length} list:${listId} had:${had} ops:${ops.length} put:${put.status} now:${now} mode:${mode}`
  if (put.status >= 400) return { ok: false, listId, added: 0, error: `put-${put.status}`, diag }
  return { ok: true, listId, added: ops.length, skipped, diag }
}

/** Verify a freshly-harvested token before we store it — one GET the token owns.
 *  Returns the user id echoed back, or null if the token/id don't check out. */
export async function verifyFlippToken(userId: string, token: string): Promise<{ ok: boolean; email: string | null }> {
  const res = await api(token, `/v1/users/${userId}`)
  if (res.status !== 200) return { ok: false, email: null }
  const email = (res.json as { email?: string })?.email ?? null
  return { ok: true, email }
}
