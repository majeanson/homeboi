import { ok } from '../_lib/json'
import { authed } from '../_lib/route'

// The board's calm "daily wonder" band, served from one of several free, documented
// sources the band rotates through via a shuffle button:
//
//   bing → Bing's Image of the Day — a curated, wallpaper-quality daily photo
//          (landscapes, nature, wildlife, landmarks), captioned + LOCALIZED. The
//          calmest, most reliable default.
//   wiki → Wikipedia's Picture of the Day — curated, varied, richly captioned
//          (nature, places, history), in the app language where available.
//   apod → NASA's Astronomy Picture of the Day (a galaxy / planet / sky).
//   epic → NASA DSCOVR's daily full-disc photo of Earth ("la Terre aujourd'hui").
//   mars → NASA's Curiosity rover's latest photo (often offline upstream).
//
// `GET /api/wonder?source=bing|wiki|apod|epic|mars` (default bing). No household data
// is involved — it's the same picture for everyone — so the handler ignores the
// actor. Text is localized to the app language (X-Lang): bing + wiki are fetched in
// that language, and EPIC/Mars get hand-written FR/EN blurbs (their upstream captions
// are generic boilerplate). The upstream image fetches are edge-cached 6 h each.
//
// ALWAYS resolves 200 with `wonder: null` on any miss (no/blocked upstream, bad
// payload, or no usable still) so the band just hides — never an error on the render
// path (NFR-DEGRADE). The NASA_APOD_KEY secret is OPTIONAL: unset falls back to
// DEMO_KEY, fine behind the cache. Bing + Wikipedia need no key.

type Source = 'bing' | 'wiki' | 'apod' | 'epic' | 'mars'
type Lang = 'fr' | 'en'

interface Wonder {
  source: Source
  title: string
  // A longer description; may be empty (e.g. wiki, whose caption IS the title) —
  // the band hides the paragraph when it's blank, so there's no redundant repeat.
  explanation: string
  // The LANGUAGE the text is actually in, so the board reads it aloud with the
  // matching voice (NASA's APOD is always English; an English blurb spoken by a
  // French voice is unintelligible — same fix as recipes' per-recipe read language).
  lang: Lang
  imgUrl: string
  copyright?: string
}

const CACHE: RequestInit['cf'] = { cacheTtl: 21600, cacheEverything: true } // 6 h

export const onRequestGet = authed(async (ctx) => {
  const key = ctx.env.NASA_APOD_KEY ?? 'DEMO_KEY'
  const url = new URL(ctx.request.url)
  const source = pickSource(url.searchParams.get('source'))
  const lang: Lang = ctx.request.headers.get('X-Lang') === 'en' ? 'en' : 'fr'
  // Try the requested source first, then fall back through the reliable ones so the
  // band shows whatever IS available — feeds are flaky (NASA's APOD 503s and hangs
  // 30 s+; Mars is often down entirely). Each attempt is hard-bounded by a timeout
  // (see `timed`), so a hanging feed can't stall the board; the loop moves on. Bing
  // then Wiki lead the fallback (fast + reliable + localized); the slow/dead NASA
  // feeds are only fetched when explicitly requested, never as a fallback (so a
  // down request costs at most one timeout). Only if every attempt fails → null.
  const order = dedupe([source, 'bing', 'wiki', 'apod'])
  for (const s of order) {
    const wonder = await fetchOne(s, key, lang)
    if (wonder) return ok({ wonder })
  }
  return ok({ wonder: null })
})

function fetchOne(s: Source, key: string, lang: Lang): Promise<Wonder | null> {
  return s === 'bing'
    ? fetchBing(lang)
    : s === 'wiki'
      ? fetchWiki(lang)
      : s === 'epic'
        ? fetchEpic(key, lang)
        : s === 'mars'
          ? fetchMars(key, lang)
          : fetchApod(key)
}

function pickSource(raw: string | null): Source {
  return raw === 'wiki' || raw === 'apod' || raw === 'epic' || raw === 'mars' ? raw : 'bing'
}

// Preserve order, drop repeats — the requested source leads, the rest fill in.
const dedupe = (xs: Source[]): Source[] => xs.filter((x, i) => xs.indexOf(x) === i)

// Image hosts occasionally hand back http:// URLs; the board is https, so a
// mixed-content image would be blocked. Force https.
const https = (u: string) => u.replace(/^http:\/\//i, 'https://')

// One upstream fetch, hard-bounded so a slow/hung feed (APOD routinely stalls 30 s+)
// can't keep the board's request pending. On timeout the AbortSignal rejects the
// fetch, the caller's try/catch turns it into null, and the handler falls back to
// the next source. A descriptive User-Agent is required by Wikimedia's API policy
// (harmless to NASA). Keeps the shared 6 h edge cache (CACHE) on the happy path.
function timed(u: string): Promise<Response> {
  return fetch(u, {
    headers: { accept: 'application/json', 'user-agent': 'Babillard/1.0 (household wall board; github.com/majeanson/homeboi)' },
    cf: CACHE,
    signal: AbortSignal.timeout(7000),
  })
}

// — Wikipedia Picture of the Day (the day's `image` in the Featured feed). Fetched
// in the app's own language, so the caption reads naturally. The caption IS the
// headline (real, specific — "A group of Dorcas gazelle at dusk in Morocco"); we
// leave `explanation` empty rather than repeat it. —
async function fetchWiki(lang: Lang): Promise<Wonder | null> {
  try {
    const now = new Date()
    const y = now.getUTCFullYear()
    const m = String(now.getUTCMonth() + 1).padStart(2, '0')
    const d = String(now.getUTCDate()).padStart(2, '0')
    const res = await timed(`https://${lang}.wikipedia.org/api/rest_v1/feed/featured/${y}/${m}/${d}`)
    if (!res.ok) return null
    const feed = (await res.json()) as {
      image?: {
        description?: { text?: string; lang?: string }
        image?: { source?: string }
        thumbnail?: { source?: string }
        artist?: { text?: string }
      }
    }
    const i = feed.image
    const src = i?.image?.source ?? i?.thumbnail?.source
    if (!i || typeof src !== 'string' || !src) return null
    const caption = stripTags(i.description?.text ?? '').trim()
    if (!caption) return null
    // Commons captions aren't always translated — the fr feed often falls back to an
    // English caption. Read it in the language it's ACTUALLY in (per the feed), so
    // the voice matches the words.
    const descLang: Lang = i.description?.lang === 'fr' ? 'fr' : i.description?.lang === 'en' ? 'en' : lang
    return {
      source: 'wiki',
      title: caption,
      explanation: '',
      lang: descLang,
      imgUrl: https(src),
      ...(i.artist?.text ? { copyright: stripTags(i.artist.text).trim() } : {}),
    }
  } catch {
    return null
  }
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, '')

// — Bing's Image of the Day. A curated, wallpaper-quality daily photo, served
// already localized via the market (mkt). The poetic `title` is the headline; the
// `copyright` carries both the SUBJECT/place ("Mont Fuji sur l'île de Honshū,
// Japon") and the photographer credit in parentheses — we split them: the place
// becomes the explanation (a real "where"), the credit becomes the © line. —
async function fetchBing(lang: Lang): Promise<Wonder | null> {
  try {
    const mkt = lang === 'en' ? 'en-CA' : 'fr-CA'
    const res = await timed(`https://www.bing.com/HPImageArchive.aspx?format=js&n=1&mkt=${mkt}`)
    if (!res.ok) return null
    const d = (await res.json()) as { images?: { url?: string; title?: string; copyright?: string }[] }
    const i = d.images?.[0]
    if (!i || typeof i.url !== 'string' || !i.url) return null
    // "Place / subject (© Author/Source)" → place + credit.
    const cr = (i.copyright ?? '').trim()
    const m = cr.match(/^(.*?)\s*\(([^)]*)\)\s*$/)
    const place = (m ? m[1] : cr).trim()
    const credit = m ? m[2].trim() : ''
    return {
      source: 'bing',
      title: (i.title ?? '').trim() || place || (lang === 'en' ? 'Photo of the day' : 'Photo du jour'),
      explanation: place,
      lang,
      imgUrl: `https://www.bing.com${i.url}`,
      ...(credit ? { copyright: credit } : {}),
    }
  } catch {
    return null
  }
}

async function fetchApod(key: string): Promise<Wonder | null> {
  try {
    // thumbs=true → a still (`thumbnail_url`) is returned on video days, so a
    // video-of-the-day still shows a picture instead of blanking the band.
    const res = await timed(`https://api.nasa.gov/planetary/apod?thumbs=true&api_key=${key}`)
    if (!res.ok) return null
    const a = (await res.json()) as {
      title?: string
      explanation?: string
      media_type?: string
      url?: string
      thumbnail_url?: string
      copyright?: string
    }
    // Resolve a usable still: an image's own url, or a video's thumbnail.
    const imgUrl = a.media_type === 'image' ? a.url : a.media_type === 'video' ? a.thumbnail_url : undefined
    if (typeof a.title !== 'string' || typeof a.explanation !== 'string' || typeof imgUrl !== 'string' || !imgUrl) {
      return null
    }
    return {
      source: 'apod',
      title: a.title,
      explanation: a.explanation,
      lang: 'en', // NASA only provides English — read it with an English voice.
      imgUrl: https(imgUrl),
      ...(typeof a.copyright === 'string' && a.copyright.trim() ? { copyright: a.copyright.trim() } : {}),
    }
  } catch {
    return null
  }
}

// EPIC: DSCOVR's daily full-disc photo of Earth. Its upstream caption is generic
// boilerplate ("This image was taken by NASA's EPIC camera…"), so we ignore it and
// use a hand-written localized blurb that actually explains what you're seeing.
async function fetchEpic(key: string, lang: Lang): Promise<Wonder | null> {
  try {
    const res = await timed(`https://api.nasa.gov/EPIC/api/natural?api_key=${key}`)
    if (!res.ok) return null
    const list = (await res.json()) as { image?: string; date?: string }[]
    const a = Array.isArray(list) ? list[0] : undefined
    if (!a || typeof a.image !== 'string' || typeof a.date !== 'string') return null
    // a.date is "YYYY-MM-DD HH:MM:SS" — the archive path is /YYYY/MM/DD/.
    const ymd = a.date.slice(0, 10).split('-')
    if (ymd.length !== 3) return null
    const [y, m, d] = ymd
    return {
      source: 'epic',
      title: lang === 'en' ? 'Our planet, live' : 'Notre planète, en direct',
      explanation:
        lang === 'en'
          ? 'A photo of the whole Earth taken today by NASA’s EPIC camera aboard the DSCOVR satellite — about 1.5 million kilometres away, where the pull of the Earth and the Sun balance out.'
          : 'Une photo de la Terre entière prise aujourd’hui par la caméra EPIC de la NASA, à bord du satellite DSCOVR — à environ 1,5 million de kilomètres, là où les attractions de la Terre et du Soleil s’équilibrent.',
      lang,
      imgUrl: `https://api.nasa.gov/EPIC/archive/natural/${y}/${m}/${d}/png/${a.image}.png?api_key=${key}`,
    }
  } catch {
    return null
  }
}

// Mars: Curiosity's latest batch of photos. We surface the first one and build a
// short LOCALIZED caption from its camera + Earth date + sol (Martian day).
async function fetchMars(key: string, lang: Lang): Promise<Wonder | null> {
  try {
    const res = await timed(`https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/latest_photos?api_key=${key}`)
    if (!res.ok) return null
    const data = (await res.json()) as {
      latest_photos?: { img_src?: string; earth_date?: string; sol?: number; camera?: { full_name?: string } }[]
    }
    const a = data.latest_photos?.[0]
    if (!a || typeof a.img_src !== 'string') return null
    const date = a.earth_date ? ` (${a.earth_date})` : ''
    const cam = a.camera?.full_name
    return {
      source: 'mars',
      title: lang === 'en' ? 'Curiosity on Mars' : 'Curiosity sur Mars',
      explanation:
        lang === 'en'
          ? `Taken by NASA’s Curiosity rover on sol ${a.sol ?? '?'}${date}, the ${a.sol ?? '?'}th Martian day of its mission.${cam ? ` Camera: ${cam}.` : ''}`
          : `Prise par le rover Curiosity de la NASA au sol ${a.sol ?? '?'}${date}, le ${a.sol ?? '?'}ᵉ jour martien de sa mission.${cam ? ` Caméra : ${cam}.` : ''}`,
      lang,
      imgUrl: https(a.img_src),
    }
  } catch {
    return null
  }
}
