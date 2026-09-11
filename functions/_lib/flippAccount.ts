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
}

/** The current list, as GET returns it — for commit_version + de-dupe. */
export interface ServerList {
  commit_version?: number
  flyer_item_clippings?: { flyer_item_id?: number }[]
  list_items?: { term?: string }[]
}

/** The ops to send for a payload against what the list already holds: a clipping
 *  already there (by flyer item) or a term already there (case-insensitive) is not
 *  sent again — the same uniqueness Flipp's own merge applies. PURE, so tested in
 *  isolation (the fragile half of the push). Names/terms are length-capped defensively.
 *  Geometry rides through, matching `SLFlyerItemClipping.createOp('post')`. */
export function buildOps(clippings: Clipping[], items: string[], existing: ServerList): { ops: unknown[]; skipped: number } {
  const haveIds = new Set((existing.flyer_item_clippings ?? []).map((c) => c.flyer_item_id).filter((x): x is number => typeof x === 'number'))
  const haveTerms = new Set((existing.list_items ?? []).map((i) => String(i.term ?? '').trim().toLowerCase()).filter(Boolean))
  const ops: unknown[] = []
  let skipped = 0
  for (const c of clippings) {
    if (!c || typeof c.flyerItemId !== 'number' || !c.name) continue
    if (haveIds.has(c.flyerItemId)) {
      skipped++
      continue
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
): Promise<PushResult> {
  const token = await open(link.access_token_enc, secret)
  if (!token) return { ok: false, added: 0, error: 'token-unreadable' }

  // 1. The list: the stored one, or the account's first, or a fresh one.
  let listId = link.list_id
  if (!listId) {
    const lists = await api(token, `/v1/users/${link.flipp_user_id}/shopping_lists`)
    if (lists.status === 401) return { ok: false, added: 0, error: 'unauthorized' }
    const ids = (lists.json as { shopping_lists?: { id: string }[] })?.shopping_lists?.map((l) => l.id) ?? []
    if (ids.length) listId = ids[0]
    else {
      const made = await api(token, `/v1/users/${link.flipp_user_id}/shopping_lists`, { method: 'POST' })
      if (made.status >= 400) return { ok: false, added: 0, error: `create-${made.status}` }
      listId = (made.json as { id?: string })?.id ?? null
    }
  }
  if (!listId) return { ok: false, added: 0, error: 'no-list' }

  // 2. The current list, for commit_version + de-dupe.
  const cur = await api(token, `/v1/users/${link.flipp_user_id}/shopping_lists/${listId}`)
  if (cur.status === 401) return { ok: false, added: 0, error: 'unauthorized' }
  if (cur.status >= 400) return { ok: false, added: 0, error: `get-${cur.status}` }
  const list = cur.json as ServerList

  const { ops, skipped } = buildOps(clippings, items, list)
  if (!ops.length) return { ok: true, listId, added: 0, skipped }

  // 3. Apply.
  const put = await api(token, `/v1/users/${link.flipp_user_id}/shopping_lists/${listId}`, {
    method: 'PUT',
    body: JSON.stringify({ commit_version: list.commit_version ?? 0, _ops: ops }),
  })
  if (put.status >= 400) return { ok: false, listId, added: 0, error: `put-${put.status}` }
  return { ok: true, listId, added: ops.length, skipped }
}

/** Verify a freshly-harvested token before we store it — one GET the token owns.
 *  Returns the user id echoed back, or null if the token/id don't check out. */
export async function verifyFlippToken(userId: string, token: string): Promise<{ ok: boolean; email: string | null }> {
  const res = await api(token, `/v1/users/${userId}`)
  if (res.status !== 200) return { ok: false, email: null }
  const email = (res.json as { email?: string })?.email ?? null
  return { ok: true, email }
}
