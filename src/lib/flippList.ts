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
//     Annuler = the way back; anything else, or no clipboard access → the prompt;
//   · the prompt: paste = import; EMPTY + OK = the way back; Cancel = nothing;
//   · import merges into a LOCAL list (a signed-in user's stored list is a server
//     proxy, `_delegate: true` — replaced by a local one, which Flipp then merges
//     into the account itself) and goes to `/liste_dachats`;
//   · the way back reads their list and opens `<origin>/liste#flipp=<base64url>`.
/*BOOKMARKLET-START*/
export const FLIPP_BOOKMARKLET_BODY =
  '(function(){var B=(function(){var s=(typeof document!=="undefined"&&document.currentScript&&document.currentScript.src)||"";var m=/^(https?:\\/\\/[^\\/]+)/.exec(s);return m?m[1]:""})();function fail(m){alert(m)}if(!/(^|\\.)flipp\\.com$/.test(location.hostname)){fail("Ce signet s’utilise sur flipp.com — je t’y amène. Relance-le une fois là.");location.href="https://flipp.com/liste_dachats";return}function parse(t){var d=null;try{d=JSON.parse(t)}catch(e){}if(!d||d.v!==1||d.from){return null}var cl=d.clippings||[],it=d.items||[];if(!cl.length&&!it.length){return null}return d}function imp(d){var cl=d.clippings||[],it=d.items||[];var s=localStorage;var c={};try{c=JSON.parse(s.getItem("shopping_list")||"{}")||{}}catch(e){}if(c._delegate){c={}}var l={_outstandingOps:[],flyerItemClippings:c.flyerItemClippings||[],listItems:c.listItems||[],photos:c.photos||[],ecomItems:c.ecomItems||[],_delegate:false};var h={};var i;for(i=0;i<l.flyerItemClippings.length;i++){h[l.flyerItemClippings[i].flyerItemId]=1}for(i=0;i<cl.length;i++){var x=cl[i];if(!x||!x.flyerItemId||h[x.flyerItemId]){continue}x.id="item-clipping-"+x.flyerItemId;l.flyerItemClippings.push(x);h[x.flyerItemId]=1}var g={};for(i=0;i<l.listItems.length;i++){g[String(l.listItems[i].term||"").toLowerCase()]=1}for(i=0;i<it.length;i++){var q=it[i]&&it[i].term;if(!q){continue}var k=String(q).toLowerCase();if(g[k]){continue}l.listItems.push({id:k.replace(/\\s/g,"")+"-"+Date.now().toString(36)+Math.random().toString(36).slice(2),term:String(q),checked:false});g[k]=1}s.setItem("shopping_list",JSON.stringify(l));location.href="/liste_dachats"}function exp(){var c={};try{c=JSON.parse(localStorage.getItem("shopping_list")||"{}")||{}}catch(e){}var cl=c.flyerItemClippings||[],li=c.listItems||[],o={v:1,from:"flipp",clippings:[],items:[]},i;for(i=0;i<cl.length;i++){var x=cl[i];if(!x||!x.flyerItemId){continue}o.clippings.push({flyerItemId:x.flyerItemId,name:x.name||"",flyerId:x.flyerId||null,price:x.price==null?null:String(x.price),merchantId:x.merchantId||null,merchantName:x.merchantName||"",merchantLogoUrl:x.merchantLogoUrl||null,thumbnailUrl:x.thumbnailUrl||null,validTo:x.validTo||null,checked:!!x.checked})}for(i=0;i<li.length;i++){var y=li[i];if(!y||!y.term){continue}o.items.push({term:String(y.term),checked:!!y.checked})}if(!o.clippings.length&&!o.items.length){fail("Ta liste Flipp est vide — rien à rapporter vers Babillard.");return}var e=btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");location.href=B+"/liste#flipp="+e}function ask(){var t=prompt("Colle ici ce que Babillard a copié (« Copier pour Flipp ») — ou laisse vide et OK pour rapporter ta liste Flipp vers Babillard.");if(t===null){return}if(!t.replace(/\\s/g,"")){exp();return}var d=parse(t);if(!d){fail("Ce n’est pas une liste Babillard — retourne dans Babillard, touche « Copier pour Flipp », puis reviens coller.");return}imp(d)}function go(){if(navigator.clipboard&&navigator.clipboard.readText){navigator.clipboard.readText().then(function(t){var d=parse(t||"");if(!d){ask();return}if(confirm("Coller ta liste Babillard dans Flipp ?\\n\\nOK = coller · Annuler = plutôt rapporter ta liste Flipp vers Babillard")){imp(d)}else{exp()}},function(){ask()})}else{ask()}}go()})()'
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
