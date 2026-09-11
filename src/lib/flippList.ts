import type { Pick } from './deals'

// « MA LISTE FLIPP », BOTH WAYS — through Flipp's own storage, by a bookmarklet.
//
// Marc, 2026-09-10: « any way to populate the localstorage with what they want? »
// Probed against flipp.com in a real browser, and yes, with one boundary that the
// browser draws, not Flipp: their web list is a `shopping_list` object in flipp.com's
// OWN localStorage (`ShoppingList.localSave()`), read back by `_loadShoppingList()` on
// every page load. No page on our origin can write it — same-origin policy — but a
// bookmarklet RUNS on theirs. So the loop is:
//
//   1. Babillard copies the list (« Copier pour Flipp » on the till grid);
//   2. on flipp.com the household runs the one-time bookmark below — it reads the
//      clipboard itself when the phone allows, else asks for a paste — and Flipp's
//      list page renders it: clippings with their photo under their store, plain
//      lines as typed items under « Ma liste »;
//   3. LOGGED IN on flipp.com, Flipp itself then merges a local list into the account
//      (`joinLocalList` → `createAllItemOps`, the path they wrote for "added while
//      logged out, then signed in"), which is how the PHONE APP gets it. Confirmed
//      on Marc's iPhone the same night. No token, no API of theirs is ever called.
//
// THE WAY BACK (same bookmark, second answer): leave the paste box empty — or say
// « Annuler » when it offers to paste — and it reads Flipp's list and OPENS Babillard
// with it in the URL (`/liste#flipp=…`). No clipboard needed there: we control the
// reader (lib/flippImport), which shows what would change and asks before writing.
//
// THE WHOLE LIST, not just the deals. Two kinds of thing in their storage, both
// dumped from a real session on 2026-09-10: `flyerItemClippings[]` = `SLFlyerItemClipping`
// (`id` is `item-clipping-<flyerItemId>`, `price` a STRING) and `listItems[]` =
// `SLListItem` (`{ id, term, checked }`, unique by term; their own id is
// `<term lowercased, spaces stripped>-<uuid>`, "clobbered by the server on save").
//
// Fragile by nature — their storage schema is private and may change — and the
// failure mode is benign: an empty list, never a broken page. e2e/flipp-live.spec.ts
// checks the real site weekly. The bookmarklet refuses anything that is not a
// Babillard payload, never touches their `photos` or `ecomItems`, and only ever ADDS
// to their typed items.

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

/** Babillard → Flipp: what « Copier pour Flipp » puts on the clipboard. */
export interface FlippPayload {
  v: 1
  clippings: FlippClipping[]
  items: FlippItem[]
}

/** Flipp → Babillard: what the bookmark's second answer puts in `/liste#flipp=`. */
export interface FlippExport {
  v: 1
  from: 'flipp'
  clippings: {
    flyerItemId: number
    name: string
    flyerId: number | null
    price: string | null
    merchantId: number | null
    merchantName: string
    merchantLogoUrl: string | null
    thumbnailUrl: string | null
    validTo: string | null
    checked: boolean
  }[]
  items: { term: string; checked: boolean }[]
}

/** The text « Copier pour Flipp » puts on the clipboard: every pick that carries a
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
      // Flipp's own clipping carries the CUTOUT here (`thumbnail_url: item.cutoutImageUrl`,
      // read in their ClipFlyerItemButton 2026-09-11); the clean photo is our tiles' pick.
      thumbnailUrl: d.cutout ?? d.image,
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
// that runs on flipp.com, not code Vite compiles. It is SERVED, not pasted: the
// bookmark a household saves is the tiny loader below (`flippBookmarklet`), which
// adds `<script src="<their Babillard>/flipp-paste.js">` to Flipp's page — their
// CSP allows a script from any origin (`script-src … *`, checked 2026-09-10). Why:
// the full body as a bookmark ADDRESS stopped running on Marc's iPhone once it grew
// past ~3 KB — Safari showed the Favorites page, which is what a javascript: URL it
// cannot run looks like. A loader has no such edge, and the body can change without
// anyone re-copying a bookmark. `scripts/flipp-paste.mjs` copies this string into
// `public/flipp-paste.js`; `flippPaste.test.ts` fails the build when they drift.
//
// The household's Babillard origin — where the way back lands — is read off the
// script's own `src`. The unit test runs this exact string against a fake page, so
// the logic cannot drift from `mergeFlippList` below (the readable twin the test
// also checks it against). Markers bound it so the generator and a live probe can
// lift it straight out of this file.
//
// What it does, in order:
//   · anywhere but flipp.com (Marc ran it on Google's page, 2026-09-10, and landed
//     on google.com/liste_dachats): says so, goes to flipp.com's list page, stops;
//   · clipboard first (`navigator.clipboard.readText`, one « Coller » permission tap
//     on a phone): a Babillard payload there → « Coller dans Flipp ? » OK = paste,
//     Annuler = the way back; a CLEAR payload (« Vider ma liste Flipp » on the till)
//     → its own confirm, naming what is lost; anything else, or no clipboard access
//     → the prompt;
//   · the prompt: paste = import; EMPTY + OK = the way back; « vider » = clear (after
//     the same confirm); « diag » = the account list's raw rows in a prompt, to copy
//     and paste into a Babillard session (how a row Flipp wrote is told from one we
//     wrote — the open rendering question); Cancel = nothing;
//   · import, SIGNED OUT: merges into a LOCAL list and goes to `/liste_dachats`;
//     Flipp merges that into the account at the next sign-in (`joinLocalList`, which
//     their page runs on the 'login' event — and ONLY then);
//   · import, SIGNED IN (2026-09-11): the ACCOUNT list, directly. Marc, already signed
//     in on flipp.com, pasted and saw « the same clipped content »: with a session, the
//     page rebuilds the list from the server on load and the local list the bookmark
//     wrote is simply dropped — the merge only ever runs at login. So with a session
//     the bookmark does what their login merge does: reads the bearer Flipp keeps in
//     its own `flipp-login` cookie (on their origin, used from their origin, stored
//     nowhere), GETs the account's lists (the first, or POSTs a new one), GETs its rows,
//     and PUTs `{ commit_version, _ops }` — a `post` op per clipping / typed item not
//     already there, the exact object `SLFlyerItemClipping.createOp('post')` builds.
//     This is the same private API « Lier Flipp » used from our server (and was undone
//     for: a stored third-party key); here nothing leaves flipp.com. A failed call says
//     so with the step and status, and writes nothing. PROVEN in Marc's own signed-in
//     Chrome (2026-09-11, over the debugging port): the row the server echoes back
//     carries geometry, price and merchant id, and flipp.com draws it exactly like a
//     row their own button wrote. A clipping WITHOUT its box (a deal staged before
//     2026-09-10, when `box` was not kept) is posted as a TYPED ITEM instead, never as
//     a clipping: the web list lays clippings out from `right − left` / `top − bottom`,
//     and ONE null-geometry row turns every height after it into NaN — the pile of
//     pictures over the rows that « same bad pictures overlays » described. Six such
//     rows sat on the account from before; « Vider », then paste again, is the cure;
//   · clear: signed in → a `delete` op for every clipping and typed item on the
//     account list (the rows echoed back with their id + commit_version); signed out
//     → an empty local list. Then `/liste_dachats`;
//   · the way back reads their list and opens `<origin>/liste#flipp=<base64url>`.
/*BOOKMARKLET-START*/
export const FLIPP_BOOKMARKLET_BODY =
  '(function(){var B=(function(){var s=(typeof document!=="undefined"&&document.currentScript&&document.currentScript.src)||"";var m=/^(https?:\\/\\/[^\\/]+)/.exec(s);return m?m[1]:""})();var ACC="https://cdn-gateflipp.flippback.com/accounts";function fail(m){alert(m)}if(!/(^|\\.)flipp\\.com$/.test(location.hostname)){fail("Ce signet s’utilise sur flipp.com — je t’y amène. Relance-le une fois là.");location.href="https://flipp.com/liste_dachats";return}function tok(){var c=(typeof document!=="undefined"&&document.cookie)||"";var m=/(?:^|;\\s*)flipp-login=([^;]*)/.exec(c);if(!m){return null}var t=null;try{t=JSON.parse(decodeURIComponent(m[1]))}catch(e){}t=t&&t.token;return t&&t.access_token&&t.user_id?{a:String(t.access_token),u:String(t.user_id)}:null}function req(t,m,p,b){var o={method:m,headers:{"Content-Type":"application/json",Authorization:"Token token="+t.a}};if(b){o.body=JSON.stringify(b)}return fetch(ACC+"/v1/users/"+t.u+"/shopping_lists"+p,o).then(function(r){return r.text().then(function(x){var j=null;try{j=JSON.parse(x)}catch(e){}return{s:r.status,j:j}})})}function withList(t,f){return req(t,"GET","").then(function(r){if(r.s>=400){throw new Error("listes "+r.s)}var l=(r.j&&r.j.shopping_lists)||[];if(l.length&&l[0].id){return l[0].id}return req(t,"POST","").then(function(c){if(c.s>=400||!c.j||!c.j.id){throw new Error("création "+c.s)}return c.j.id})}).then(function(id){return req(t,"GET","/"+id).then(function(r){if(r.s>=400||!r.j){throw new Error("liste "+r.s)}var ops=f(r.j);if(!ops.length){return 0}return req(t,"PUT","/"+id,{commit_version:r.j.commit_version||0,_ops:ops}).then(function(p){if(p.s>=400){throw new Error("envoi "+p.s)}return ops.length})})})}function acctOps(cur,d){var cl=d.clippings||[],it=d.items||[],ops=[],h={},g={},i,x,ec=cur.flyer_item_clippings||[],ei=cur.list_items||[];for(i=0;i<ec.length;i++){h[ec[i].flyer_item_id]=1}for(i=0;i<ei.length;i++){g[String(ei[i].term||"").toLowerCase()]=1}function boxed(x){return typeof x.left==="number"&&typeof x.right==="number"&&typeof x.top==="number"&&typeof x.bottom==="number"}var fb=[];for(i=0;i<cl.length;i++){x=cl[i];if(!x||!x.flyerItemId||h[x.flyerItemId]){continue}if(!boxed(x)){if(x.name){fb.push({term:String(x.name).split("|")[0].replace(/\\s+/g," ").trim()})}continue}h[x.flyerItemId]=1;ops.push({verb:"post",object:{id:null,commit_version:null,type:"flyer_item_clipping",flyer_item_id:x.flyerItemId,name:x.name||"",flyer_id:x.flyerId==null?null:x.flyerId,right:x.right==null?null:x.right,left:x.left==null?null:x.left,top:x.top==null?null:x.top,bottom:x.bottom==null?null:x.bottom,price:x.price==null?null:String(x.price),merchant_id:x.merchantId==null?null:x.merchantId,merchant_name:x.merchantName||"",merchant_logo_url:x.merchantLogoUrl||null,thumbnail_url:x.thumbnailUrl||null,valid_to:x.validTo||null}})}it=fb.concat(it);for(i=0;i<it.length;i++){var q=it[i]&&it[i].term;if(!q){continue}var k=String(q).toLowerCase();if(g[k]){continue}g[k]=1;ops.push({verb:"post",object:{id:null,commit_version:null,type:"list_item",term:String(q),checked:false}})}return ops}function clearOps(cur){var ops=[],i,r,ec=cur.flyer_item_clippings||[],ei=cur.list_items||[];for(i=0;i<ec.length;i++){r=ec[i];if(r&&r.id!=null){ops.push({verb:"delete",object:{id:r.id,commit_version:r.commit_version==null?null:r.commit_version,type:"flyer_item_clipping",flyer_item_id:r.flyer_item_id==null?null:r.flyer_item_id,name:r.name||"",flyer_id:r.flyer_id==null?null:r.flyer_id,right:r.right==null?null:r.right,left:r.left==null?null:r.left,top:r.top==null?null:r.top,bottom:r.bottom==null?null:r.bottom,price:r.price==null?null:String(r.price),merchant_id:r.merchant_id==null?null:r.merchant_id,merchant_name:r.merchant_name||"",merchant_logo_url:r.merchant_logo_url||null,thumbnail_url:r.thumbnail_url||null,valid_to:r.valid_to||null}})}}for(i=0;i<ei.length;i++){r=ei[i];if(r&&r.id!=null){ops.push({verb:"delete",object:{id:r.id,commit_version:r.commit_version==null?null:r.commit_version,type:"list_item",term:r.term||"",checked:!!r.checked}})}}return ops}function parse(t){var d=null;try{d=JSON.parse(t)}catch(e){}if(!d||d.v!==1||d.from){return null}if(d.clear===true){return d}var cl=d.clippings||[],it=d.items||[];if(!cl.length&&!it.length){return null}return d}function done(){location.href="/liste_dachats"}function apiFail(e){fail("Flipp n’a pas pris la demande ("+((e&&e.message)||"?")+"). Réessaie — ou déconnecte-toi de flipp.com, relance le signet, puis reconnecte-toi.")}function impLocal(d){var cl=d.clippings||[],it=d.items||[];var s=localStorage;var c={};try{c=JSON.parse(s.getItem("shopping_list")||"{}")||{}}catch(e){}if(c._delegate){c={}}var l={_outstandingOps:[],flyerItemClippings:c.flyerItemClippings||[],listItems:c.listItems||[],photos:c.photos||[],ecomItems:c.ecomItems||[],_delegate:false};var h={};var i;for(i=0;i<l.flyerItemClippings.length;i++){h[l.flyerItemClippings[i].flyerItemId]=1}for(i=0;i<cl.length;i++){var x=cl[i];if(!x||!x.flyerItemId||h[x.flyerItemId]){continue}x.id="item-clipping-"+x.flyerItemId;l.flyerItemClippings.push(x);h[x.flyerItemId]=1}var g={};for(i=0;i<l.listItems.length;i++){g[String(l.listItems[i].term||"").toLowerCase()]=1}for(i=0;i<it.length;i++){var q=it[i]&&it[i].term;if(!q){continue}var k=String(q).toLowerCase();if(g[k]){continue}l.listItems.push({id:k.replace(/\\s/g,"")+"-"+Date.now().toString(36)+Math.random().toString(36).slice(2),term:String(q),checked:false});g[k]=1}s.setItem("shopping_list",JSON.stringify(l));done()}function imp(d){var t=tok();if(!t){impLocal(d);return}withList(t,function(cur){return acctOps(cur,d)}).then(done,apiFail)}function clr(){if(!confirm("Vider ta liste Flipp ? Tout ce qui s’y trouve — rabais et articles — sera retiré.")){return}var t=tok();if(!t){localStorage.setItem("shopping_list",JSON.stringify({_outstandingOps:[],flyerItemClippings:[],listItems:[],photos:[],ecomItems:[],_delegate:false}));done();return}withList(t,clearOps).then(done,apiFail)}function diag(){var t=tok();if(!t){fail("Connecte-toi d’abord sur flipp.com — le diagnostic lit la liste de ton compte.");return}req(t,"GET","").then(function(r){var l=(r.j&&r.j.shopping_lists)||[];if(!l.length){prompt("Aucune liste sur ce compte. Copie ceci :",JSON.stringify(r.j));return}return req(t,"GET","/"+l[0].id).then(function(x){prompt("Copie ceci et colle-le dans Babillard (diagnostic Flipp) :",JSON.stringify({lists:l.length,status:x.s,list:x.j}).slice(0,6000))})},function(e){fail("Diagnostic impossible : "+((e&&e.message)||"?"))})}function act(d){if(d.clear===true){clr()}else{imp(d)}}function exp(){var c={};try{c=JSON.parse(localStorage.getItem("shopping_list")||"{}")||{}}catch(e){}var cl=c.flyerItemClippings||[],li=c.listItems||[],o={v:1,from:"flipp",clippings:[],items:[]},i;for(i=0;i<cl.length;i++){var x=cl[i];if(!x||!x.flyerItemId){continue}o.clippings.push({flyerItemId:x.flyerItemId,name:x.name||"",flyerId:x.flyerId||null,price:x.price==null?null:String(x.price),merchantId:x.merchantId||null,merchantName:x.merchantName||"",merchantLogoUrl:x.merchantLogoUrl||null,thumbnailUrl:x.thumbnailUrl||null,validTo:x.validTo||null,checked:!!x.checked})}for(i=0;i<li.length;i++){var y=li[i];if(!y||!y.term){continue}o.items.push({term:String(y.term),checked:!!y.checked})}if(!o.clippings.length&&!o.items.length){fail("Ta liste Flipp est vide — rien à rapporter vers Babillard.");return}var e=btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");location.href=B+"/liste#flipp="+e}function ask(){var t=prompt("Colle ici ce que Babillard a copié (« Copier pour Flipp ») — ou laisse vide et OK pour rapporter ta liste Flipp vers Babillard — ou écris « vider » pour vider ta liste Flipp.");if(t===null){return}var s=t.replace(/\\s/g,"");if(!s){exp();return}if(/^vider$/i.test(s)){clr();return}if(/^diag$/i.test(s)){diag();return}var d=parse(t);if(!d){fail("Ce n’est pas une liste Babillard — retourne dans Babillard, touche « Copier pour Flipp », puis reviens coller.");return}act(d)}function go(){if(navigator.clipboard&&navigator.clipboard.readText){navigator.clipboard.readText().then(function(t){var d=parse(t||"");if(!d){ask();return}if(d.clear===true){clr();return}if(confirm("Coller ta liste Babillard dans Flipp ?\\n\\nOK = coller · Annuler = plutôt rapporter ta liste Flipp vers Babillard")){imp(d)}else{exp()}},function(){ask()})}else{ask()}}go()})()'
/*BOOKMARKLET-END*/

/** « ENVOYER À FLIPP » — the one-tap door, no bookmark. flipp.com's `/action`
 *  entry handles `command=add_text_to_list&texts=A,B` (read in their bundle, verified
 *  live 2026-09-10): it adds each text as a typed item to the list and lands on
 *  `/shopping_list`; signed in, the page merges it into the account. And `/action` is
 *  the ONE path the Flipp iOS app claims as a universal link, so on a phone with the
 *  app this link may open the app itself with the list (Android claims every path).
 *  Typed items only — a clipping with its photo still needs the bookmark. Their
 *  splitter is a bare comma, so a comma inside a line becomes a space — and their
 *  handler decodes the value a SECOND time, so one « % » anywhere (« Lait 2% ») threw
 *  and dropped the WHOLE batch on the web (probed 2026-09-10). A percent sign goes
 *  as its fullwidth twin « ％ », which survives any decode and still reads as one.
 *
 *  A line staged from a flyer carries Flipp's own product name — « MIEL BILLY BEE |
 *  BILLY BEE HONEY 500 g » — and those were exactly the lines that did NOT reach the
 *  app on Marc's phone (the plain words did). The web takes them; the app's parser
 *  is not ours to read. So every line goes SHORT: the part before a « | », at most
 *  `MAX_TEXT` characters cut on a word — what a person would type into Flipp. */
const MAX_TEXT = 40
export function flippSendText(raw: string): string {
  let t = raw.split('|')[0].replace(/,/g, ' ').replace(/%/g, '％').replace(/\s+/g, ' ').trim()
  if (t.length > MAX_TEXT) {
    const cut = t.slice(0, MAX_TEXT + 1)
    const sp = cut.lastIndexOf(' ')
    t = (sp > 12 ? cut.slice(0, sp) : cut.slice(0, MAX_TEXT)).trim()
  }
  return t
}
export function flippAddTextsUrl(terms: string[], postal?: string | null): string | null {
  const seen = new Set<string>()
  const texts: string[] = []
  for (const raw of terms) {
    const t = flippSendText(raw)
    const k = t.toLowerCase()
    if (!t || seen.has(k)) continue
    seen.add(k)
    texts.push(t)
  }
  if (!texts.length) return null
  const pc = postal ? `&postal_code=${encodeURIComponent(postal)}` : ''
  return `https://flipp.com/action?command=add_text_to_list&texts=${encodeURIComponent(texts.join(','))}${pc}`
}

/** « OUVRIR FLIPP.COM » after a copy — the page where the bookmark runs. From
 *  Babillard installed as an app, a plain link opens an in-app browser window that
 *  has no bookmarks (the phone's chrome in Marc's screenshot, 2026-09-10), so on iOS
 *  the link uses the `x-safari-https://` scheme, which hands the URL to Safari
 *  itself. EXPERIMENTAL: the scheme is undocumented; if a phone ignores it the tap
 *  does nothing and the plain path (open Safari yourself) still stands. Elsewhere
 *  (Android, desktop) the plain https link is right — the app or the browser takes it. */
export function flippListOpenUrl(postal: string | null | undefined, ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  const pc = postal ? `?postal_code=${encodeURIComponent(postal)}` : ''
  const path = `flipp.com/liste_dachats${pc}`
  return /iPhone|iPad|iPod/.test(ua) ? `x-safari-https://${path}` : `https://${path}`
}

/** Where the body is served from, under the household's Babillard origin. */
export const FLIPP_PASTE_PATH = '/flipp-paste.js'

/** The bookmark's URL — what a household copies into a bookmark ONCE: a loader that
 *  pulls the body from their own Babillard, cache-busted per run. The origin lands
 *  inside a JS string literal; anything but a plain URL origin is refused rather
 *  than escaped (a quote here would be a bookmark that breaks). */
export function flippBookmarklet(origin: string): string {
  if (!/^https?:\/\/[A-Za-z0-9.\-:]+$/.test(origin)) throw new Error('flippBookmarklet: not a plain origin: ' + origin)
  const loader = `(function(){var s=document.createElement("script");s.src="${origin}${FLIPP_PASTE_PATH}?v="+Date.now();document.body.appendChild(s)})()`
  return 'javascript:' + encodeURIComponent(loader)
}

/** The way back, decoded: the `#flipp=` hash of `/liste` → the export, or null. */
export function parseFlippHash(hash: string): FlippExport | null {
  const m = /^#flipp=([A-Za-z0-9\-_]+)$/.exec(hash || '')
  if (!m) return null
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(escape(atob(b64)))
    const d = JSON.parse(json) as Partial<FlippExport>
    if (!d || d.v !== 1 || d.from !== 'flipp') return null
    return { v: 1, from: 'flipp', clippings: Array.isArray(d.clippings) ? d.clippings : [], items: Array.isArray(d.items) ? d.items : [] }
  } catch {
    return null
  }
}

/** The readable twin of the bookmarklet's export encoding (tests, and a probe). */
export function encodeFlippExport(e: FlippExport): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(e)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

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

/** « VIDER MA LISTE FLIPP » — what the till copies for the bookmark: a payload that
 *  asks for a clear (the bookmark confirms on flipp.com, naming what is lost). */
export const FLIPP_CLEAR_PAYLOAD = '{"v":1,"clear":true}'

/** A row of Flipp's ACCOUNT list as their API returns it (snake_case). */
export interface FlippServerList {
  commit_version?: number
  flyer_item_clippings?: { id?: string | number; commit_version?: number; flyer_item_id?: number; name?: string; flyer_id?: number | null; right?: number | null; left?: number | null; top?: number | null; bottom?: number | null; price?: string | number | null; merchant_id?: number | null; merchant_name?: string; merchant_logo_url?: string | null; thumbnail_url?: string | null; valid_to?: string | null }[]
  list_items?: { id?: string | number; commit_version?: number; term?: string; checked?: boolean }[]
}

/** The readable twin of the bookmarklet's SIGNED-IN import: the ops it PUTs for a
 *  payload against what the account list already holds — a clipping already there
 *  (by flyer item) or a term already there (case-insensitive) is not sent again, the
 *  same uniqueness Flipp's own merge applies. Each op is the object
 *  `SLFlyerItemClipping.createOp('post')` / `SLListItem.createOp('post')` builds. */
export function flippAccountOps(existing: FlippServerList, payload: FlippPayload): unknown[] {
  const have = new Set((existing.flyer_item_clippings ?? []).map((c) => c.flyer_item_id))
  const terms = new Set((existing.list_items ?? []).map((i) => String(i.term ?? '').toLowerCase()))
  const ops: unknown[] = []
  // A clipping without its box goes as a TYPED ITEM (its short name) — see the
  // narrative above the body: a null-geometry row breaks the whole web list layout.
  const fallback: { term: string }[] = []
  for (const x of payload.clippings ?? []) {
    if (!x || !x.flyerItemId || have.has(x.flyerItemId)) continue
    if (!(typeof x.left === 'number' && typeof x.right === 'number' && typeof x.top === 'number' && typeof x.bottom === 'number')) {
      if (x.name) fallback.push({ term: String(x.name).split('|')[0].replace(/\s+/g, ' ').trim() })
      continue
    }
    have.add(x.flyerItemId)
    ops.push({
      verb: 'post',
      object: {
        id: null,
        commit_version: null,
        type: 'flyer_item_clipping',
        flyer_item_id: x.flyerItemId,
        name: x.name || '',
        flyer_id: x.flyerId ?? null,
        right: x.right ?? null,
        left: x.left ?? null,
        top: x.top ?? null,
        bottom: x.bottom ?? null,
        price: x.price == null ? null : String(x.price),
        merchant_id: x.merchantId ?? null,
        merchant_name: x.merchantName || '',
        merchant_logo_url: x.merchantLogoUrl || null,
        thumbnail_url: x.thumbnailUrl || null,
        valid_to: x.validTo || null,
      },
    })
  }
  for (const x of [...fallback, ...(payload.items ?? [])]) {
    const term = x?.term
    if (!term) continue
    const key = String(term).toLowerCase()
    if (terms.has(key)) continue
    terms.add(key)
    ops.push({ verb: 'post', object: { id: null, commit_version: null, type: 'list_item', term: String(term), checked: false } })
  }
  return ops
}

/** The readable twin of the bookmarklet's CLEAR: a delete op per row of the account
 *  list, each echoing the row (id + commit_version, as `createOp('delete', true)`). */
export function flippClearOps(existing: FlippServerList): unknown[] {
  const ops: unknown[] = []
  for (const r of existing.flyer_item_clippings ?? []) {
    if (!r || r.id == null) continue
    ops.push({
      verb: 'delete',
      object: {
        id: r.id,
        commit_version: r.commit_version ?? null,
        type: 'flyer_item_clipping',
        flyer_item_id: r.flyer_item_id ?? null,
        name: r.name || '',
        flyer_id: r.flyer_id ?? null,
        right: r.right ?? null,
        left: r.left ?? null,
        top: r.top ?? null,
        bottom: r.bottom ?? null,
        price: r.price == null ? null : String(r.price),
        merchant_id: r.merchant_id ?? null,
        merchant_name: r.merchant_name || '',
        merchant_logo_url: r.merchant_logo_url || null,
        thumbnail_url: r.thumbnail_url || null,
        valid_to: r.valid_to || null,
      },
    })
  }
  for (const r of existing.list_items ?? []) {
    if (!r || r.id == null) continue
    ops.push({ verb: 'delete', object: { id: r.id, commit_version: r.commit_version ?? null, type: 'list_item', term: r.term || '', checked: !!r.checked } })
  }
  return ops
}
