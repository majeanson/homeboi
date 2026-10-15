import { authed } from '../_lib/route'
import { dumpHousehold } from '../_lib/takeout'
import { takeoutMarkdown } from '../_lib/takeoutMarkdown'

// « Emporter ses données » (bmad/08 E-35) — one GET, one JSON: every household
// table + an R2 media-key manifest (see _lib/takeout for what's included/
// excluded and why). `?format=md[&lang=en]` is the READABLE copy of the same dump — recipes,
// the list, the supper plan, people, notes — as Markdown (_lib/takeoutMarkdown); the JSON stays
// the faithful, restorable one. A Loi 25 gesture, a trust signal, and the household's own
// backup story. Operator-only: the export contains everything the household
// holds, so a kiosk/guest credential must not be able to pull it.
export const onRequestGet = authed(async (ctx, actor) => {
  const data = await dumpHousehold(ctx.env, actor.householdId)
  // Served as a DOWNLOAD: the button navigates/fetches this straight to a file.
  const date = new Date(data.exportedAt * 1000).toISOString().slice(0, 10)
  const url = new URL(ctx.request.url)
  if (url.searchParams.get('format') === 'md') {
    const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'fr'
    return new Response(takeoutMarkdown(data, lang), {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename="babillard-${date}.md"`,
        'cache-control': 'no-store',
      },
    })
  }
  return new Response(JSON.stringify(data, null, 1), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="babillard-${date}.json"`,
      'cache-control': 'no-store',
    },
  })
}, 'operator')
