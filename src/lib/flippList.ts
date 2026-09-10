import type { Pick } from './deals'

// « MA LISTE FLIPP », FILLED FROM HERE — through Flipp's own storage, by a bookmarklet.
//
// Marc, 2026-09-10: « any way to populate the localstorage with what they want? »
// Probed against flipp.com in a real browser, and yes, with one boundary that the
// browser draws, not Flipp: their web list is a `shopping_list` object in flipp.com's
// OWN localStorage (`ShoppingList.localSave()`), read back by `_loadShoppingList()` on
// every page load. No page on our origin can write it — same-origin policy — but a
// bookmarklet RUNS on theirs. So the loop is:
//
//   1. Babillard copies the list (« Ma liste Flipp » on the till grid copies, then
//      opens their list page);
//   2. on flipp.com the household runs the one-time bookmark below, pastes, and
//      Flipp's list page renders it — clippings with their photo under their store,
//      plain lines as typed items under « Ma liste »;
//   3. LOGGED IN on flipp.com, Flipp itself then merges a local list into the account
//      (`joinLocalList` → `createAllItemOps`, the path they wrote for "added while
//      logged out, then signed in"), which is how the PHONE APP gets it. No token,
//      no API of theirs is ever called by us.
//
// THE WHOLE LIST, not just the deals (Marc: « so I have my full list exported in my
// flipp app »). Two kinds of thing in their storage, both dumped from a real session
// on 2026-09-10: `flyerItemClippings[]` = `SLFlyerItemClipping` (`id` is
// `item-clipping-<flyerItemId>`, `price` a STRING) and `listItems[]` = `SLListItem`
// (`{ id, term, checked }`, unique by term; their own id is
// `<term lowercased, spaces stripped>-<uuid>`, "clobbered by the server on save").
// A list line with a LIVE clipping goes as the clipping (that clipping IS the line);
// every other unchecked line goes as a typed item — including a line whose deal
// has ended, which the till no longer shows as a deal at all.
//
// Fragile by nature — their storage schema is private and may change — and the
// failure mode is benign: an empty list, never a broken page. The bookmarklet
// refuses anything that is not a Babillard payload, never touches their `photos` or
// `ecomItems`, and only ever ADDS to their typed items.

/** One clipping, in Flipp's own list-storage shape. */
export interface FlippClipping {
  flyerItemId: number
  name: string
  flyerId: number | null
  /** A string, as Flipp stores it ("5.99"). */
  price: string | null
  merchantId: number | null
  merchantName: string
  merchantLogoUrl: string | null
  thumbnailUrl: string | null
  validTo: string | null
  left: number | null
  right: number | null
  top: number | null
  bottom: number | null
}

/** One typed line, in Flipp's shape minus the id (the bookmarklet mints that). */
export interface FlippItem {
  term: string
}

export interface FlippPayload {
  v: 1
  clippings: FlippClipping[]
  items: FlippItem[]
}

/** The text « Ma liste Flipp » puts on the clipboard: every pick that carries a
 *  Flipp id as a clipping, in Flipp's shape, plus every plain line as a typed item.
 *  Older staged deals (before `merchantId`/`box` were kept, 2026-09-10) still clip —
 *  those fields ride as null and the page copes. */
export function flippListPayload(picks: Pick[], terms: string[] = []): string {
  const clippings: FlippClipping[] = []
  for (const p of picks) {
    const d = p.deal
    if (d.id == null) continue
    clippings.push({
      flyerItemId: d.id,
      name: d.name,
      flyerId: d.flyerId,
      price: d.price == null ? null : String(d.price),
      merchantId: d.merchantId ?? null,
      merchantName: d.merchant,
      merchantLogoUrl: d.logo,
      thumbnailUrl: d.image,
      validTo: d.validTo,
      left: d.box?.left ?? null,
      right: d.box?.right ?? null,
      top: d.box?.top ?? null,
      bottom: d.box?.bottom ?? null,
    })
  }
  const seen = new Set<string>()
  const items: FlippItem[] = []
  for (const raw of terms) {
    const term = raw.trim()
    const key = term.toLowerCase()
    if (!term || seen.has(key)) continue
    seen.add(key)
    items.push({ term })
  }
  const payload: FlippPayload = { v: 1, clippings, items }
  return JSON.stringify(payload)
}

// THE BOOKMARKLET BODY. Plain ES5, self-contained, no outer scope: it is a string
// the household saves as a bookmark, not code Vite compiles. The unit test runs this
// exact string against a fake page, so the logic cannot drift from `mergeFlippList`
// below (the readable twin the test also checks it against). Markers bound it so a
// live probe can lift it straight out of this file.
/*BOOKMARKLET-START*/
export const FLIPP_BOOKMARKLET_BODY =
  '(function(){var t=prompt("Colle ici ce que Babillard a copié (« Ma liste Flipp »)");if(!t)return;var d=null;try{d=JSON.parse(t)}catch(e){}var cl=d&&d.v===1&&d.clippings||[];var it=d&&d.v===1&&d.items||[];if(!d||d.v!==1||(!cl.length&&!it.length)){alert("Ce n’est pas une liste Babillard — retourne dans Babillard, touche « Ma liste Flipp », puis reviens coller.");return}var s=localStorage;var c={};try{c=JSON.parse(s.getItem("shopping_list")||"{}")||{}}catch(e){}if(c._delegate){c={}}var l={_outstandingOps:[],flyerItemClippings:c.flyerItemClippings||[],listItems:c.listItems||[],photos:c.photos||[],ecomItems:c.ecomItems||[],_delegate:false};var h={};var i;for(i=0;i<l.flyerItemClippings.length;i++){h[l.flyerItemClippings[i].flyerItemId]=1}for(i=0;i<cl.length;i++){var x=cl[i];if(!x||!x.flyerItemId||h[x.flyerItemId]){continue}x.id="item-clipping-"+x.flyerItemId;l.flyerItemClippings.push(x);h[x.flyerItemId]=1}var g={};for(i=0;i<l.listItems.length;i++){g[String(l.listItems[i].term||"").toLowerCase()]=1}for(i=0;i<it.length;i++){var q=it[i]&&it[i].term;if(!q){continue}var k=String(q).toLowerCase();if(g[k]){continue}l.listItems.push({id:k.replace(/\\s/g,"")+"-"+Date.now().toString(36)+Math.random().toString(36).slice(2),term:String(q),checked:false});g[k]=1}s.setItem("shopping_list",JSON.stringify(l));location.href="/liste_dachats"})()'
/*BOOKMARKLET-END*/

/** The bookmark's URL — what a household copies into a bookmark once. */
export const FLIPP_BOOKMARKLET = 'javascript:' + encodeURIComponent(FLIPP_BOOKMARKLET_BODY)

/** The readable twin of the bookmarklet's merge: Flipp's stored list (raw JSON or
 *  null) + a Babillard payload → the list to store, and how many things it added.
 *  A logged-in user's stored list is a server PROXY (`_delegate: true`); it is
 *  replaced by a local list, which Flipp then merges into the account itself.
 *  `mintId` stands in for the bookmarklet's random typed-item id. */
export function mergeFlippList(
  storedRaw: string | null,
  payload: FlippPayload,
  mintId: (key: string) => string = (key) => key.replace(/\s/g, '') + '-' + Math.random().toString(36).slice(2),
): { list: Record<string, unknown>; added: number } {
  let cur: Record<string, unknown> = {}
  try {
    cur = (JSON.parse(storedRaw || '{}') as Record<string, unknown>) || {}
  } catch {
    cur = {}
  }
  if (cur._delegate) cur = {}
  const clippings = ((cur.flyerItemClippings as (FlippClipping & { id: string })[] | undefined) ?? []).slice()
  const listItems = ((cur.listItems as { id: string; term: string; checked: boolean }[] | undefined) ?? []).slice()
  const list = {
    _outstandingOps: [],
    flyerItemClippings: clippings,
    listItems,
    photos: cur.photos ?? [],
    ecomItems: cur.ecomItems ?? [],
    _delegate: false,
  }
  const have = new Set(clippings.map((c) => c.flyerItemId))
  let added = 0
  for (const x of payload.clippings ?? []) {
    if (!x || !x.flyerItemId || have.has(x.flyerItemId)) continue
    clippings.push({ ...x, id: 'item-clipping-' + x.flyerItemId })
    have.add(x.flyerItemId)
    added++
  }
  const terms = new Set(listItems.map((i) => String(i.term ?? '').toLowerCase()))
  for (const x of payload.items ?? []) {
    const term = x?.term
    if (!term) continue
    const key = String(term).toLowerCase()
    if (terms.has(key)) continue
    listItems.push({ id: mintId(key), term: String(term), checked: false })
    terms.add(key)
    added++
  }
  return { list, added }
}
