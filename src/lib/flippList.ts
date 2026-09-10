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
//   1. Babillard copies the picks (« Ma liste Flipp » on the till grid copies, then
//      opens their list page);
//   2. on flipp.com the household runs the one-time bookmark below, pastes, and
//      Flipp's list page renders the clippings — their photo, their store grouping;
//   3. LOGGED IN on flipp.com, Flipp itself then merges a local list into the account
//      (`joinLocalList` → `createAllItemOps`, the path they wrote for "added while
//      logged out, then signed in"), which is how the PHONE APP gets it. No token,
//      no API of theirs is ever called by us.
//
// The shape below is their `SLFlyerItemClipping` as `localSave()` writes it (dumped
// 2026-09-10; `id` is `item-clipping-<flyerItemId>`, `price` a STRING). A crafted
// list in that shape was seen rendering on `/liste_dachats` before any of this was
// built. Fragile by nature — their storage schema is private and may change — and
// the failure mode is benign: an empty list, never a broken page. The bookmarklet
// therefore refuses anything that is not a Babillard payload, and never touches
// their `listItems`, `photos` or `ecomItems`.

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

export interface FlippPayload {
  v: 1
  clippings: FlippClipping[]
}

/** The text « Ma liste Flipp » puts on the clipboard: every pick that carries a
 *  Flipp id, in Flipp's shape. Older staged deals (before `merchantId`/`box` were
 *  kept, 2026-09-10) still clip — those fields ride as null and the page copes. */
export function flippListPayload(picks: Pick[]): string {
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
  const payload: FlippPayload = { v: 1, clippings }
  return JSON.stringify(payload)
}

// THE BOOKMARKLET BODY. Plain ES5, self-contained, no outer scope: it is a string
// the household saves as a bookmark, not code Vite compiles. The unit test runs this
// exact string against a fake page, so the logic cannot drift from `mergeFlippList`
// below (the readable twin the test also checks it against). Markers bound it so a
// live probe can lift it straight out of this file.
/*BOOKMARKLET-START*/
export const FLIPP_BOOKMARKLET_BODY =
  '(function(){var t=prompt("Colle ici ce que Babillard a copié (« Ma liste Flipp »)");if(!t)return;var d=null;try{d=JSON.parse(t)}catch(e){}if(!d||d.v!==1||!d.clippings||!d.clippings.length){alert("Ce n’est pas une liste Babillard — retourne dans Babillard, touche « Ma liste Flipp », puis reviens coller.");return}var s=localStorage;var c={};try{c=JSON.parse(s.getItem("shopping_list")||"{}")||{}}catch(e){}if(c._delegate){c={}}var l={_outstandingOps:[],flyerItemClippings:c.flyerItemClippings||[],listItems:c.listItems||[],photos:c.photos||[],ecomItems:c.ecomItems||[],_delegate:false};var h={};for(var i=0;i<l.flyerItemClippings.length;i++){h[l.flyerItemClippings[i].flyerItemId]=1}var n=0;for(var j=0;j<d.clippings.length;j++){var x=d.clippings[j];if(!x||!x.flyerItemId||h[x.flyerItemId]){continue}x.id="item-clipping-"+x.flyerItemId;l.flyerItemClippings.push(x);h[x.flyerItemId]=1;n++}s.setItem("shopping_list",JSON.stringify(l));location.href="/liste_dachats"})()'
/*BOOKMARKLET-END*/

/** The bookmark's URL — what a household copies into a bookmark once. */
export const FLIPP_BOOKMARKLET = 'javascript:' + encodeURIComponent(FLIPP_BOOKMARKLET_BODY)

/** The readable twin of the bookmarklet's merge: Flipp's stored list (raw JSON or
 *  null) + a Babillard payload → the list to store, and how many clippings it added.
 *  A logged-in user's stored list is a server PROXY (`_delegate: true`); it is
 *  replaced by a local list, which Flipp then merges into the account itself. */
export function mergeFlippList(storedRaw: string | null, payload: FlippPayload): { list: Record<string, unknown>; added: number } {
  let cur: Record<string, unknown> = {}
  try {
    cur = (JSON.parse(storedRaw || '{}') as Record<string, unknown>) || {}
  } catch {
    cur = {}
  }
  if (cur._delegate) cur = {}
  const clippings = ((cur.flyerItemClippings as (FlippClipping & { id: string })[] | undefined) ?? []).slice()
  const list = {
    _outstandingOps: [],
    flyerItemClippings: clippings,
    listItems: cur.listItems ?? [],
    photos: cur.photos ?? [],
    ecomItems: cur.ecomItems ?? [],
    _delegate: false,
  }
  const have = new Set(clippings.map((c) => c.flyerItemId))
  let added = 0
  for (const x of payload.clippings) {
    if (!x || !x.flyerItemId || have.has(x.flyerItemId)) continue
    clippings.push({ ...x, id: 'item-clipping-' + x.flyerItemId })
    have.add(x.flyerItemId)
    added++
  }
  return { list, added }
}
