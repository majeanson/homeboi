import { dealEnded, type Pick } from './deals'

// « MA LISTE FLIPP », BOTH WAYS — through Flipp's own storage, by a bookmarklet.
//
// Marc, 2026-09-10: « any way to populate the localstorage with what they want? »
// Probed against flipp.com in a real browser, and yes, with one boundary that the
// browser draws, not Flipp: their web list is a `shopping_list` object in flipp.com's
// OWN localStorage (`ShoppingList.localSave()`), read back by `_loadShoppingList()` on
// every page load. No page on our origin can write it — same-origin policy — but a
// bookmarklet RUNS on theirs. So the loop is:
//
//   1. Babillard sends the list (La liste ▸ « Ma liste Flipp » ▸ « Envoyer ma liste »);
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

/** Babillard → Flipp: what « Envoyer ma liste » carries in the address (and clipboard). */
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

/** The text « Envoyer ma liste » carries: every pick that carries a
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
//   · the page ADDRESS first (2026-09-11, evening): « Ma liste → Flipp » on the till
//     opens flipp.com/liste_dachats#bb=<base64url list> — the hash survives their
//     router (probed at 6 KB) and never reaches their server — so the bookmark finds
//     the list right there: no copy, no clipboard permission bubble. The hash is
//     stripped (replaceState) so a second launch does not replay a stale list;
//   · clipboard next (`navigator.clipboard.readText`, one « Coller » permission tap
//     on a phone): a Babillard payload there → a SHEET the bookmark draws on their page
//     (Marc, 2026-09-11: « this is some limitation of dialog or can it say the right
//     words? » — `confirm()` cannot relabel its buttons, but code running on flipp.com
//     can draw its own): « Remplacer ma liste Flipp » (what is only in Flipp is removed;
//     one PUT with a delete per row, then the payload) · « Ajouter à ma liste Flipp » ·
//     « Rapporter Flipp → Babillard » (the way back, back in view) · « Annuler ». So
//     « Vider » then « Coller » is one run; a CLEAR payload (« Vider ma liste Flipp » on
//     the till) → a two-button sheet naming what is lost. Nothing on the clipboard, or no
//     access → a menu sheet: « Coller ma liste Babillard » (reads the clipboard INSIDE
//     the tap — iOS Safari allows a read only in a user gesture, and a bookmark launch
//     is not one, which is why the phone always landed here; Marc, 2026-09-11: « can it
//     be done automatically based on copied content on the mobile? » — the text box
//     opens only if that read is refused), « Rapporter », « Vider », « Annuler ». Where the page has no body (the unit tests' fake page), every sheet
//     falls back to the native confirm/prompt it replaced — same decisions, fewer words;
//   · the prompt: paste = import; EMPTY + OK = the way back; « vider » = clear (after
//     the same confirm; "clear" too, for the EN reader); « diag » = the account list's raw rows in a prompt, to copy
//     and paste into a Babillard session (how a row Flipp wrote is told from one we
//     wrote — the open rendering question); Cancel = nothing;
//   · import asks the same REPLACE / ADD question from the prompt path too;
//   · import, SIGNED OUT: merges into (or, replacing, becomes) a LOCAL list and goes to
//     `/liste_dachats`;
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
//     already there, the exact object `SLFlyerItemClipping.createOp('post')` builds;
//     REPLACING, the same PUT carries a `delete` op per existing row first.
//     BEFORE any of that (both paths), a clipping WITHOUT its box is completed from
//     Flipp's own item endpoint (`…/bf/flipp/items/<id>` — CORS-open, no postal needed,
//     the same host their page reads): box, cutout picture, and any missing price /
//     flyer / merchant / date. Marc's staged deals predate the box being kept
//     (2026-09-10), and on 2026-09-11 the box-less guard below turned EVERY one of
//     them into a typed word — « no deals follow through ». Hydrated, they clip; only
//     an item Flipp no longer knows (404) still goes as a word;
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
//   · after a signed-in write, a LANGUAGE check: rows the Flipp APP wrote carry
//     `quantity`; if one of them sits in a different flyer than ours for the same
//     merchant and the same week, the app runs in the other language (Flipp publishes
//     one flyer per language — functions/_lib/flippLang.ts) and will call our rows
//     « non disponibles ». The sheet says so and points at the Babillard setting;
//   · clear: signed in → a `delete` op for every clipping and typed item on the
//     account list (the rows echoed back with their id + commit_version); signed out
//     → an empty local list. Then `/liste_dachats`;
//   · the way back reads their list and opens `<origin>/liste#flipp=<base64url>`.
/*BOOKMARKLET-START*/
export const FLIPP_BOOKMARKLET_BODY =
  '(function(){var B=(function(){var s=(typeof document!=="undefined"&&document.currentScript&&document.currentScript.src)||"";var m=/^(https?:\\/\\/[^\\/]+)/.exec(s);return m?m[1]:""})();var ACC="https://cdn-gateflipp.flippback.com/accounts";var BF="https://cdn-gateflipp.flippback.com/bf/flipp/items/";function boxed(x){return typeof x.left==="number"&&typeof x.right==="number"&&typeof x.top==="number"&&typeof x.bottom==="number"}function hyd(d){var cl=d.clippings||[],todo=[],i;for(i=0;i<cl.length;i++){if(cl[i]&&cl[i].flyerItemId&&!boxed(cl[i])){todo.push(cl[i])}}if(!todo.length){return Promise.resolve(d)}return Promise.all(todo.map(function(x){return fetch(BF+x.flyerItemId+"?locale=fr-ca").then(function(r){return r.ok?r.json():null}).then(function(j){var it=j&&j.item;if(!it||typeof it.left!=="number"){return}x.left=it.left;x.right=it.right;x.top=it.top;x.bottom=it.bottom;if(it.cutout_image_url){x.thumbnailUrl=String(it.cutout_image_url).replace(/^http:/,"https:")}if(x.price==null&&it.current_price!=null){x.price=String(it.current_price)}if(x.flyerId==null&&it.flyer_id!=null){x.flyerId=it.flyer_id}if(x.merchantId==null&&it.merchant_id!=null){x.merchantId=it.merchant_id}if(!x.validTo&&it.valid_to){x.validTo=it.valid_to}},function(){})})).then(function(){return d})}function fail(m){alert(m)}if(!/(^|\\.)flipp\\.com$/.test(location.hostname)){fail("Ce signet s’utilise sur flipp.com — je t’y amène. Relance-le une fois là.");location.href="https://flipp.com/liste_dachats";return}function tok(){var c=(typeof document!=="undefined"&&document.cookie)||"";var m=/(?:^|;\\s*)flipp-login=([^;]*)/.exec(c);if(!m){return null}var t=null;try{t=JSON.parse(decodeURIComponent(m[1]))}catch(e){}t=t&&t.token;return t&&t.access_token&&t.user_id?{a:String(t.access_token),u:String(t.user_id)}:null}function req(t,m,p,b){var o={method:m,headers:{"Content-Type":"application/json",Authorization:"Token token="+t.a}};if(b){o.body=JSON.stringify(b)}return fetch(ACC+"/v1/users/"+t.u+"/shopping_lists"+p,o).then(function(r){return r.text().then(function(x){var j=null;try{j=JSON.parse(x)}catch(e){}return{s:r.status,j:j}})})}function withList(t,f){return req(t,"GET","").then(function(r){if(r.s>=400){throw new Error("listes "+r.s)}var l=(r.j&&r.j.shopping_lists)||[];if(l.length&&l[0].id){return l[0].id}return req(t,"POST","").then(function(c){if(c.s>=400||!c.j||!c.j.id){throw new Error("création "+c.s)}return c.j.id})}).then(function(id){return req(t,"GET","/"+id).then(function(r){if(r.s>=400||!r.j){throw new Error("liste "+r.s)}var ops=f(r.j);if(!ops.length){return 0}return req(t,"PUT","/"+id,{commit_version:r.j.commit_version||0,_ops:ops}).then(function(p){if(p.s>=400){throw new Error("envoi "+p.s)}return ops.length})})})}function acctOps(cur,d){var cl=d.clippings||[],it=d.items||[],ops=[],h={},g={},i,x,ec=cur.flyer_item_clippings||[],ei=cur.list_items||[];for(i=0;i<ec.length;i++){h[ec[i].flyer_item_id]=1}for(i=0;i<ei.length;i++){g[String(ei[i].term||"").toLowerCase()]=1}var fb=[];for(i=0;i<cl.length;i++){x=cl[i];if(!x||!x.flyerItemId||h[x.flyerItemId]){continue}if(!boxed(x)){if(x.name){fb.push({term:String(x.name).split("|")[0].replace(/\\s+/g," ").trim()})}continue}h[x.flyerItemId]=1;ops.push({verb:"post",object:{id:null,commit_version:null,type:"flyer_item_clipping",flyer_item_id:x.flyerItemId,name:x.name||"",flyer_id:x.flyerId==null?null:x.flyerId,right:x.right==null?null:x.right,left:x.left==null?null:x.left,top:x.top==null?null:x.top,bottom:x.bottom==null?null:x.bottom,price:x.price==null?null:String(x.price),merchant_id:x.merchantId==null?null:x.merchantId,merchant_name:x.merchantName||"",merchant_logo_url:x.merchantLogoUrl||null,thumbnail_url:x.thumbnailUrl||null,valid_to:x.validTo||null}})}it=fb.concat(it);for(i=0;i<it.length;i++){var q=it[i]&&it[i].term;if(!q){continue}var k=String(q).toLowerCase();if(g[k]){continue}g[k]=1;ops.push({verb:"post",object:{id:null,commit_version:null,type:"list_item",term:String(q),checked:false}})}return ops}function clearOps(cur){var ops=[],i,r,ec=cur.flyer_item_clippings||[],ei=cur.list_items||[];for(i=0;i<ec.length;i++){r=ec[i];if(r&&r.id!=null){ops.push({verb:"delete",object:{id:r.id,commit_version:r.commit_version==null?null:r.commit_version,type:"flyer_item_clipping",flyer_item_id:r.flyer_item_id==null?null:r.flyer_item_id,name:r.name||"",flyer_id:r.flyer_id==null?null:r.flyer_id,right:r.right==null?null:r.right,left:r.left==null?null:r.left,top:r.top==null?null:r.top,bottom:r.bottom==null?null:r.bottom,price:r.price==null?null:String(r.price),merchant_id:r.merchant_id==null?null:r.merchant_id,merchant_name:r.merchant_name||"",merchant_logo_url:r.merchant_logo_url||null,thumbnail_url:r.thumbnail_url||null,valid_to:r.valid_to||null}})}}for(i=0;i<ei.length;i++){r=ei[i];if(r&&r.id!=null){ops.push({verb:"delete",object:{id:r.id,commit_version:r.commit_version==null?null:r.commit_version,type:"list_item",term:r.term||"",checked:!!r.checked}})}}return ops}function parse(t){var d=null;try{d=JSON.parse(t)}catch(e){}if(!d||d.v!==1||d.from){return null}if(d.clear===true){return d}var cl=d.clippings||[],it=d.items||[];if(!cl.length&&!it.length){return null}return d}function done(){location.href="/liste_dachats"}function apiFail(e){fail("Flipp n’a pas pris la demande ("+((e&&e.message)||"?")+"). Réessaie — ou déconnecte-toi de flipp.com, relance le signet, puis reconnecte-toi.")}function impLocal(d,rep){var cl=d.clippings||[],it=d.items||[];var s=localStorage;var c={};try{c=JSON.parse(s.getItem("shopping_list")||"{}")||{}}catch(e){}if(c._delegate||rep){c={}}var l={_outstandingOps:[],flyerItemClippings:c.flyerItemClippings||[],listItems:c.listItems||[],photos:c.photos||[],ecomItems:c.ecomItems||[],_delegate:false};var h={};var i;for(i=0;i<l.flyerItemClippings.length;i++){h[l.flyerItemClippings[i].flyerItemId]=1}for(i=0;i<cl.length;i++){var x=cl[i];if(!x||!x.flyerItemId||h[x.flyerItemId]){continue}x.id="item-clipping-"+x.flyerItemId;l.flyerItemClippings.push(x);h[x.flyerItemId]=1}var g={};for(i=0;i<l.listItems.length;i++){g[String(l.listItems[i].term||"").toLowerCase()]=1}for(i=0;i<it.length;i++){var q=it[i]&&it[i].term;if(!q){continue}var k=String(q).toLowerCase();if(g[k]){continue}l.listItems.push({id:k.replace(/\\s/g,"")+"-"+Date.now().toString(36)+Math.random().toString(36).slice(2),term:String(q),checked:false});g[k]=1}s.setItem("shopping_list",JSON.stringify(l));done()}function langOff(cur,d){var rows=(cur&&cur.flyer_item_clippings)||[],cl=d.clippings||[],i,j;for(i=0;i<rows.length;i++){var r=rows[i];if(r==null||r.quantity==null||r.flyer_id==null||r.merchant_id==null){continue}for(j=0;j<cl.length;j++){var x=cl[j];if(x&&x.merchantId===r.merchant_id&&x.flyerId!=null&&x.flyerId!==r.flyer_id&&String(x.validTo||"").slice(0,10)===String(r.valid_to||"").slice(0,10)){return true}}}return false}var LANGMSG="Ton app Flipp semble utiliser une autre langue que ton réglage Babillard : elle marquera ces rabais « non disponibles ». Dans Babillard : Réglages ▸ La liste ▸ Magasinage ▸ « Langue de ton app Flipp », puis recolle.";function imp(d0,rep){hyd(d0).then(function(d){var t=tok();if(!t){impLocal(d,rep);return}var off=false;return withList(t,function(cur){off=langOff(cur,d);return rep?clearOps(cur).concat(acctOps({},d)):acctOps(cur,d)}).then(function(){if(!off){done();return}if(!sheet(LANGMSG,[{k:"ok",l:"Compris",p:true,f:done}])){alert(LANGMSG);done()}})}).then(null,apiFail)}function sheet(title,btns){var b=(typeof document!=="undefined")&&document.body;if(!b||!document.createElement){return false}var old=document.getElementById("bb-flipp");if(old&&old.parentNode){old.parentNode.removeChild(old)}var o=document.createElement("div");o.id="bb-flipp";o.setAttribute("style","position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;font:16px/1.4 -apple-system,system-ui,Segoe UI,Roboto,sans-serif");var c=document.createElement("div");c.setAttribute("style","background:#fff;color:#111;border-radius:16px 16px 0 0;padding:18px 16px 28px;width:100%;max-width:520px;box-sizing:border-box;box-shadow:0 -8px 30px rgba(0,0,0,.25)");var h=document.createElement("p");h.textContent=title;h.setAttribute("style","margin:0 0 12px;font-weight:700;font-size:17px");c.appendChild(h);var i;for(i=0;i<btns.length;i++){(function(bt){var x=document.createElement("button");x.type="button";x.textContent=bt.l;x.setAttribute("data-bb",bt.k);x.setAttribute("style","display:block;width:100%;margin:8px 0;padding:14px;border-radius:12px;border:1.5px solid "+(bt.d?"#c0392b":"#1a73e8")+";background:"+(bt.p?"#1a73e8":"#fff")+";color:"+(bt.p?"#fff":(bt.d?"#c0392b":"#1a73e8"))+";font-size:17px;font-weight:600;cursor:pointer");x.onclick=function(){if(o.parentNode){o.parentNode.removeChild(o)}if(bt.f){bt.f()}};c.appendChild(x)})(btns[i])}o.appendChild(c);b.appendChild(o);return true}function doClr(){var t=tok();if(!t){localStorage.setItem("shopping_list",JSON.stringify({_outstandingOps:[],flyerItemClippings:[],listItems:[],photos:[],ecomItems:[],_delegate:false}));done();return}withList(t,clearOps).then(done,apiFail)}function clr(){var q="Vider ta liste Flipp ? Tout ce qui s’y trouve — rabais et articles — sera retiré.";if(sheet(q,[{k:"clear",l:"Vider ma liste Flipp",f:doClr,d:true},{k:"cancel",l:"Annuler"}])){return}if(confirm(q)){doClr()}}function diag(){var t=tok();if(!t){fail("Connecte-toi d’abord sur flipp.com — le diagnostic lit la liste de ton compte.");return}req(t,"GET","").then(function(r){var l=(r.j&&r.j.shopping_lists)||[];if(!l.length){prompt("Aucune liste sur ce compte. Copie ceci :",JSON.stringify(r.j));return}return req(t,"GET","/"+l[0].id).then(function(x){prompt("Copie ceci et colle-le dans Babillard (diagnostic Flipp) :",JSON.stringify({lists:l.length,status:x.s,list:x.j}).slice(0,6000))})},function(e){fail("Diagnostic impossible : "+((e&&e.message)||"?"))})}function askRep(){return confirm("Coller ta liste Babillard dans Flipp ?\\n\\nOK = REMPLACER ta liste Flipp par celle-ci (ce qui n\u2019est que dans Flipp sera retiré)\\nAnnuler = AJOUTER à ta liste Flipp, sans rien retirer")}function act(d){if(d.clear===true){clr();return}var n=(d.clippings||[]).length,m=(d.items||[]).length;var q="Liste Babillard : "+n+" rabais, "+m+" article"+(m>1?"s":"")+". Quoi faire ?";if(sheet(q,[{k:"replace",l:"Remplacer ma liste Flipp",p:true,f:function(){imp(d,true)}},{k:"add",l:"Ajouter à ma liste Flipp",f:function(){imp(d,false)}},{k:"back",l:"Rapporter Flipp → Babillard",f:exp},{k:"cancel",l:"Annuler"}])){return}imp(d,askRep())}function clipRead(){if(navigator.clipboard&&navigator.clipboard.readText){navigator.clipboard.readText().then(function(t){var d=parse(t||"");if(!d){ask();return}act(d)},function(){ask()})}else{ask()}}function menu(){if(sheet("Coller de Babillard",[{k:"paste",l:"Coller ma liste Babillard",p:true,f:clipRead},{k:"back",l:"Rapporter Flipp → Babillard",f:exp},{k:"clear",l:"Vider ma liste Flipp",f:clr,d:true},{k:"cancel",l:"Annuler"}])){return}ask()}function exp(){var c={};try{c=JSON.parse(localStorage.getItem("shopping_list")||"{}")||{}}catch(e){}var cl=c.flyerItemClippings||[],li=c.listItems||[],o={v:1,from:"flipp",clippings:[],items:[]},i;for(i=0;i<cl.length;i++){var x=cl[i];if(!x||!x.flyerItemId){continue}o.clippings.push({flyerItemId:x.flyerItemId,name:x.name||"",flyerId:x.flyerId||null,price:x.price==null?null:String(x.price),merchantId:x.merchantId||null,merchantName:x.merchantName||"",merchantLogoUrl:x.merchantLogoUrl||null,thumbnailUrl:x.thumbnailUrl||null,validTo:x.validTo||null,checked:!!x.checked})}for(i=0;i<li.length;i++){var y=li[i];if(!y||!y.term){continue}o.items.push({term:String(y.term),checked:!!y.checked})}if(!o.clippings.length&&!o.items.length){fail("Ta liste Flipp est vide — rien à rapporter vers Babillard.");return}var e=btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");location.href=B+"/liste#flipp="+e}function ask(){var t=prompt("Colle ici ce que Babillard a copié (La liste ▸ « Ma liste Flipp ») — ou laisse vide et OK pour rapporter ta liste Flipp vers Babillard — ou écris « vider » pour vider ta liste Flipp.");if(t===null){return}var s=t.replace(/\\s/g,"");if(!s){exp();return}if(/^(vider|clear)$/i.test(s)){clr();return}if(/^diag$/i.test(s)){diag();return}var d=parse(t);if(!d){fail("Ce n’est pas une liste Babillard — retourne dans Babillard : La liste ▸ « Ma liste Flipp » ▸ « Envoyer ma liste ».");return}act(d)}function fromHash(){var m=/(?:^|[#&])bb=([A-Za-z0-9\\-_]+)(?:&|$)/.exec(location.hash||"");if(!m){return null}var d=null;try{var b=m[1].replace(/-/g,"+").replace(/_/g,"/");d=parse(decodeURIComponent(escape(atob(b))))}catch(e){}try{if(typeof history!=="undefined"&&history.replaceState){history.replaceState(null,"",location.pathname+location.search)}}catch(e){}return d}function go(){var hd=fromHash();if(hd){act(hd);return}if(navigator.clipboard&&navigator.clipboard.readText){navigator.clipboard.readText().then(function(t){var d=parse(t||"");if(!d){menu();return}act(d)},function(){menu()})}else{menu()}}go()})()'
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
export function flippListOpenUrl(postal: string | null | undefined, ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent, payload?: string | null): string {
  const pc = postal ? `?postal_code=${encodeURIComponent(postal)}` : ''
  // THE LIST RIDES IN THE ADDRESS (2026-09-11): `#bb=<base64url>` — a hash is never
  // sent to flipp.com's server, their router leaves it alone (probed at 6 KB), and
  // the bookmark reads it first, so a household never copies or grants a paste.
  const hash = payload ? `#bb=${encodeFlippPayload(payload)}` : ''
  const path = `flipp.com/liste_dachats${pc}${hash}`
  return /iPhone|iPad|iPod/.test(ua) ? `x-safari-https://${path}` : `https://${path}`
}

/** A payload (the JSON text « Envoyer ma liste » carries) as the bookmark's `#bb=` value —
 *  the same base64url the way back uses (`encodeFlippExport`), decoded by `fromHash()`. */
export function encodeFlippPayload(json: string): string {
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
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
  /** REPLACE: the stored list is dropped and the payload becomes the list. */
  replace = false,
): { list: Record<string, unknown>; added: number } {
  let cur: Record<string, unknown> = {}
  try {
    cur = (JSON.parse(storedRaw || '{}') as Record<string, unknown>) || {}
  } catch {
    cur = {}
  }
  if (cur._delegate || replace) cur = {}
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
export function flippAccountOps(existing: FlippServerList, payload: FlippPayload, replace = false): unknown[] {
  // REPLACE = every existing row deleted, then the payload posted against an empty list — one PUT.
  if (replace) return [...flippClearOps(existing), ...flippAccountOps({}, payload)]
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

// A list row, structurally — only the three fields this file reads. Kept local so
// lib/flippList does not pull in the picks module (and its React deps) for a filter.
export interface ListRowLike {
  id: string
  text: string
  checked_at?: number | null
}

// ── WHAT ACTUALLY TRAVELS ─────────────────────────────────────────────────────
//
// THE rule, in ONE place: **only what is still to buy goes to Flipp.** A checked
// line is in the cart or already bought, so it stays home — that is the answer to
// « deal lines didn't get sent » (2026-09-10): the till still showed their tiles,
// which made "not sent" indistinguishable from "not shown".
//
// This derivation used to live inline in CashierMode, which was fine while the till
// was the only door. It is now read by the list's own Flipp sheet too, and two
// copies of "which rows travel" is exactly how one surface starts sending something
// the other says it won't. The counts it returns are what the UI SAYS before you
// tap, so the household never has to guess what left.
export interface FlippBundle {
  /** Live picks (a Flipp item id, not expired) — these travel WITH their photo. */
  clippable: Pick[]
  /** Every other unchecked row — plain lines, ended deals, till-hidden stores. */
  terms: string[]
  /** Every unchecked row as words, for the no-bookmark door (no photos). */
  sendTerms: string[]
  /** Checked rows that deliberately stay home; shown so the count is never a mystery. */
  keptChecked: number
  /** Staged deals that travel as WORDS instead of as a deal-with-photo, and why.
   *  Nothing is lost — the row still goes — but a deal quietly demoted to a word is
   *  exactly what « Flipp didn't add my Maxi deal » looks like from the other side
   *  (Marc, 2026-09-12). Counted so the sheet can say it before the tap. */
  demotedEnded: number
  demotedNoId: number
  /** The `{v:1,clippings,items}` payload the bookmark reads. */
  payload: string
}

export function flippBundle(rows: readonly ListRowLike[], picks: readonly Pick[], now = Date.now()): FlippBundle {
  // `picks` must be EVERY staged deal on the list — never the till-filtered set.
  // « À la caisse : Non » means « don't show me this store's flyer at its own
  // register »; it says nothing about what belongs in Flipp, where browsing BY store
  // is the point. Passing the till's picks here silently demoted a hidden store's
  // deals to typed words (Marc's Maxi produce deal, 2026-09-12).
  const clippable = picks.filter((p) => p.deal.id != null && !dealEnded(p.deal.validTo, now))
  const clipped = new Set(clippable.map((p) => p.itemId))
  const unchecked = rows.filter((r) => !r.checked_at)
  const terms = unchecked.filter((r) => !clipped.has(r.id)).map((r) => r.text)
  const sendTerms = unchecked.map((r) => flippSendText(r.text)).filter(Boolean)
  return {
    clippable,
    terms,
    sendTerms,
    keptChecked: rows.length - unchecked.length,
    demotedEnded: picks.filter((p) => p.deal.id != null && dealEnded(p.deal.validTo, now)).length,
    demotedNoId: picks.filter((p) => p.deal.id == null).length,
    payload: flippListPayload(clippable, terms),
  }
}
