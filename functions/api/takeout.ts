import { authed } from '../_lib/route'
import { dumpHousehold } from '../_lib/takeout'

// « Emporter ses données » (bmad/08 E-35) — one GET, one JSON: every household
// table + an R2 media-key manifest (see _lib/takeout for what's included/
// excluded and why). A Loi 25 gesture, a trust signal, and the household's own
// backup story. Operator-only: the export contains everything the household
// holds, so a kiosk/guest credential must not be able to pull it.
export const onRequestGet = authed(async (ctx, actor) => {
  const data = await dumpHousehold(ctx.env, actor.householdId)
  // Served as a DOWNLOAD: the button navigates/fetches this straight to a file.
  const date = new Date(data.exportedAt * 1000).toISOString().slice(0, 10)
  return new Response(JSON.stringify(data, null, 1), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="babillard-${date}.json"`,
      'cache-control': 'no-store',
    },
  })
}, 'operator')
