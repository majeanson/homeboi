// « ENVOYER À BABILLARD » — the recipe bookmarklet (2026-10-27).
//
// recettes.qc.ca, Zeste and IGA sit behind Akamai: a Worker's fetch is refused (403),
// the public reader too, and Browser Run may be (_lib/renderPage). The cook's OWN
// browser is the door that always works — it already shows them the page. So, like the
// Flipp bookmark (lib/flippList), a bookmark runs ON the recipe's page, collects what our
// parsers read, and comes back to Babillard in the ADDRESS:
//   <their Babillard>/kitchen/recipe/new#import=<base64url JSON>
// A hash is never sent to any server on the way; RecipeFormPage reads it, strips it, and
// posts it to /api/recipe-import as `{ page }` — the SAME parsers a fetched page gets
// (functions/_lib/recipeImportPage, sourceFromCapture).
//
// What it collects: the address, the title, og:image, every `application/ld+json`
// block's RAW text (parsed server-side, never here), Ricardo's `data-react-app-props`
// (its ingredient/step groups) and WPRM's group names when present, and as the text
// fallback the WHOLE page's innerText (document.body), capped at 120 KB — the server
// windows it onto the recipe (recipeTextWindow), exactly as it windows a fetched page's
// htmlToText, which is what the corpus proves readable for every blocked site. It used
// to send `main` / `article` / the instructions block instead: on Marc's iPhone the live
// recettes.qc.ca page answered « Rien trouvé » (2026-10-27) while the same page's full
// text parses to 16 ingredients + 10 steps — a container the site adds by script is not
// the recipe, and guessing one is how a capture comes home empty. Over ~200 KB the text
// goes first. No cookie, no request to Babillard from their page: it only navigates.
//
// WHY THE BODY IS IN THE BOOKMARK ITSELF, not a loader like Flipp's: Flipp's body grew
// past ~3 KB and iOS Safari stopped running it as an address, so it loads
// /flipp-paste.js instead. This one is ~2 KB, and a loader is a <script src> on THEIR
// page — subject to THEIR Content-Security-Policy, which a bookmark's own code is not.
// `recipeBookmarklet.test.ts` holds it under the iOS edge and runs it on a fake page.
//
// Plain ES5, self-contained, ONE argument: the household's Babillard origin. No
// backslash and no single quote anywhere in it (it lives in a single-quoted literal and
// the base64url swap uses split/join), so the string is exactly what runs.
export const RECIPE_BOOKMARKLET_BODY =
  '(function(B){var d=document,l=location;if(l.origin===B){alert("Ce signet s’utilise sur la page d’une recette, pas dans Babillard.");return}' +
  'var cap=function(s,n){s=String(s||"");return s.length>n?s.slice(0,n):s};' +
  'var p={v:1,url:l.href,title:cap(d.title,300),image:"",jsonld:[],text:""},i,x;' +
  'var ms=d.getElementsByTagName("meta");for(i=0;i<ms.length;i++){if(ms[i].getAttribute("property")==="og:image"){p.image=cap(ms[i].getAttribute("content"),600);break}}' +
  'var ss=d.getElementsByTagName("script");for(i=0;i<ss.length&&p.jsonld.length<20;i++){x=ss[i];if(String(x.type||"").toLowerCase()==="application/ld+json"&&String(x.textContent||"").trim()){p.jsonld.push(cap(x.textContent,150000))}}' +
  'var ex={},rp=d.querySelectorAll("[data-react-app-props]");for(i=0;i<rp.length;i++){if(rp[i].getAttribute("data-react-app")==="recipeCookingMode"){ex.ricardo=cap(rp[i].getAttribute("data-react-app-props"),100000)}}' +
  'var g=function(c){var a=[],n=d.querySelectorAll(c),k;for(k=0;k<n.length;k++){a.push(String(n[k].textContent||"").trim())}return a};' +
  'var wi=g(".wprm-recipe-ingredient-group-name"),ws=g(".wprm-recipe-instruction-group-name");if(wi.length||ws.length){ex.wprm={ingredients:wi,steps:ws}}' +
  'if(ex.ricardo||ex.wprm){p.extras=ex}' +
  'p.text=cap(d.body&&d.body.innerText,120000);' +
  'var enc=function(o){var b=btoa(unescape(encodeURIComponent(JSON.stringify(o))));b=b.split("+").join("-").split("/").join("_");while(b.charAt(b.length-1)==="="){b=b.slice(0,-1)}return b};' +
  'var e=enc(p);if(e.length>200000){p.text="";e=enc(p)}if(e.length>200000){delete p.extras;e=enc(p)}' +
  'l.href=B+"/kitchen/recipe/new#import="+e})'

/** What the bookmark captures — the server's `{ page }` input (functions/_lib/recipeImportPage). */
export interface CapturedRecipePage {
  v: 1
  url: string
  title: string
  image: string
  jsonld: string[]
  text: string
  extras?: { ricardo?: string; wprm?: { ingredients: string[]; steps: string[] } }
}

/** The bookmark a household saves ONCE: the body, called with their own origin. The
 *  origin lands inside a JS string literal; anything but a plain origin is refused rather
 *  than escaped (a quote there would be a bookmark that breaks). */
export function recipeBookmarklet(origin: string): string {
  if (!/^https?:\/\/[A-Za-z0-9.\-:]+$/.test(origin)) throw new Error('recipeBookmarklet: not a plain origin: ' + origin)
  return 'javascript:' + encodeURIComponent(`${RECIPE_BOOKMARKLET_BODY}("${origin}")`)
}

/** The readable twin of the bookmark's encoding (tests, and the e2e's fake capture). */
export function encodeRecipePage(p: CapturedRecipePage): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(p)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The way in: `#import=<base64url>` → the captured page, or null (junk, a foreign shape). */
export function parseRecipeHash(hash: string): CapturedRecipePage | null {
  const m = /^#import=([A-Za-z0-9\-_]+)$/.exec(hash || '')
  if (!m) return null
  try {
    return coerceCapturedPage(JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))))))
  } catch {
    return null
  }
}

/** A captured page out of untrusted JSON (the hash, the parked copy), or null. */
function coerceCapturedPage(v: unknown): CapturedRecipePage | null {
  const d = v as Partial<CapturedRecipePage> | null
  if (!d || typeof d !== 'object' || d.v !== 1 || typeof d.url !== 'string' || !/^https?:\/\//i.test(d.url)) return null
  return {
    v: 1,
    url: d.url,
    title: typeof d.title === 'string' ? d.title : '',
    image: typeof d.image === 'string' ? d.image : '',
    jsonld: Array.isArray(d.jsonld) ? d.jsonld.filter((x): x is string => typeof x === 'string') : [],
    text: typeof d.text === 'string' ? d.text : '',
    ...(d.extras && typeof d.extras === 'object' ? { extras: d.extras } : {}),
  }
}

// THE CAPTURE, PARKED ACROSS A SIGN-IN. On iOS the home-screen app and Safari keep
// SEPARATE cookie jars: Marc was signed in on the app, the bookmark ran in Safari, and
// the page it sent home met a Safari that had never signed in — a 403 (no CSRF cookie)
// dressed as « Rien trouvé » (prod, 2026-10-27). So a capture that hits a signed-out
// browser is parked here, the person signs in ONCE in that browser (/login?next=), and
// the recipe form picks it up on the way back. sessionStorage: this tab, this hop,
// nothing older; private mode without storage just needs a second tap of the bookmark.
const PENDING_KEY = 'babillard-pending-import'
export function stashPendingImport(page: CapturedRecipePage): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(page))
  } catch {
    /* no storage (private mode) — the bookmark can simply be tapped again after signing in */
  }
}
export function hasPendingImport(): boolean {
  try {
    return sessionStorage.getItem(PENDING_KEY) !== null
  } catch {
    return false
  }
}
/** The parked capture, once — reading it clears it. */
export function takePendingImport(): CapturedRecipePage | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (raw === null) return null
    sessionStorage.removeItem(PENDING_KEY)
    return coerceCapturedPage(JSON.parse(raw))
  } catch {
    return null
  }
}
