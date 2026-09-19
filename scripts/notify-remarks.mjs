// « Regle-remarque » — read this push's commit messages for remark trailers and tell the
// running app which remarks this deploy shipped.
//
// Run by .github/workflows/ci.yml as the LAST step of the deploy job, so it can only ever
// run after a deploy that actually succeeded. That step ordering IS the condition: there
// is nothing to express and nothing to get wrong.
//
// EVERYTHING THIS READS IS UNTRUSTED. A commit message is authored outside the app and
// outside review, and this runs on a runner holding CLOUDFLARE_API_TOKEN. So: it never
// touches a shell, it validates every id against the server's own alphabet before sending
// it, it caps the explanation, and it exits 0 always — the step is continue-on-error and
// its signal is ::warning:: annotations, not an exit code. scripts/ci-untrusted.test.mjs
// holds the workflow side of that bargain.
//
// THE TRAILER KEY IS ASCII ON PURPOSE. « Règle-remarque » would be the French spelling,
// but a trailer key is parsed by git tooling and greppability matters more than the
// accent, so it is `Regle-remarque:`.
//
// A NOTE ON WHERE THE TRAILER GOES. Git trailers are single-line `Key: value` pairs at
// the FOOT of the message. The « Explication: » paragraph therefore comes BEFORE them, or
// `git interpret-trailers` stops recognising the block.

const TRAILER = /^[ \t]*Regle-remarque:[ \t]*([A-Za-z0-9]{6,32})[ \t]*$/gm
// `m` is needed so `^` anchors to the « Explication: » LINE — but it also makes `$` mean
// end-of-line, which stopped the capture after one line. `(?![\s\S])` is true end-of-input
// regardless of the flag. (Found by notify-remarks.test.mjs, which asked for a two-line
// paragraph and got the first line.)
const EXPLANATION = /^[ \t]*Explication:[ \t]*([\s\S]*?)(?:\n[ \t]*\n|(?![\s\S]))/m
const EXPLANATION_MAX = 2000

/** PURE. One commit message → { ids, explanation }. Exported for notify-remarks.test.mjs. */
export function parseRemarkTrailers(message) {
  const text = String(message ?? '')
  // Line-anchored + /g: several trailers in ONE commit is the normal case (one fix, two
  // remarks), and « voir Regle-remarque: abc123 dans la doc » mid-sentence is NOT one.
  // Duplicates collapse — naming the same id twice is one notification.
  const ids = [...new Set([...text.matchAll(TRAILER)].map((m) => m[1]))]
  // The paragraph: from the « Explication: » line to the first blank line. Deliberately
  // NOT parsed as a trailer, because it is not one — it is a paragraph we agree to write,
  // and a blank line is where it ends.
  const m = text.match(EXPLANATION)
  const explanation = (m ? m[1] : '')
    .split('\n')
    .map((l) => l.trim())
    .join(' ')
    .trim()
    .slice(0, EXPLANATION_MAX)
  return { ids, explanation }
}

/** The commits of this push, each with ITS OWN sha. */
function commitsOfPush() {
  try {
    const parsed = JSON.parse(process.env.PUSH_COMMITS || '[]')
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.map((c) => ({ sha: String(c.id ?? ''), message: String(c.message ?? '') }))
    }
  } catch {
    /* fall through to the head commit */
  }
  return [{ sha: process.env.HEAD_SHA ?? '', message: process.env.HEAD_MESSAGE ?? '' }]
}

const warn = (s) => console.log(`::warning title=Regle-remarque::${String(s).replace(/\r?\n/g, ' ')}`)
const note = (s) => console.log(`::notice title=Regle-remarque::${String(s).replace(/\r?\n/g, ' ')}`)

async function post(endpoint, secret, payload) {
  // Three attempts, and ONLY for 404 or a transport failure. The first POST can land on a
  // colo still serving the previous bundle — a brand-new route 404s for a few seconds
  // after `wrangler deploy` returns — and that 404 is indistinguishable from an unknown
  // id. A 401 or a 409 is a verdict, never a hiccup: those are never retried.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8', 'X-Deploy-Secret': secret },
        body: JSON.stringify(payload),
      })
      const body = await res.text()
      if (res.ok || (res.status !== 404 && res.status < 500)) return { status: res.status, body }
      if (attempt === 3) return { status: res.status, body }
    } catch (err) {
      if (attempt === 3) return { status: 0, body: String(err) }
    }
    await new Promise((r) => setTimeout(r, attempt * 2000))
  }
  return { status: 0, body: 'unreachable' }
}

async function main() {
  const endpoint = process.env.REMARKS_ENDPOINT
  const secret = process.env.DEPLOY_NOTIFY_SECRET ?? ''
  const jobs = []
  for (const { sha, message } of commitsOfPush()) {
    // The sha comes from the push payload, but it is still shaped-checked before it
    // reaches a request body the server will store.
    if (!/^[0-9a-f]{7,64}$/.test(sha)) continue
    const { ids, explanation } = parseRemarkTrailers(message)
    for (const id of ids) jobs.push({ id, sha, explanation })
  }

  // The ordinary commit: nothing named, nothing said. Silence is the common path and it
  // must stay silent, or the annotations stop meaning anything.
  if (jobs.length === 0) return
  if (!endpoint || secret.length < 32) {
    warn(`${jobs.length} remarque(s) nommée(s), mais DEPLOY_NOTIFY_SECRET est absent ou trop court — rien envoyé.`)
    return
  }
  for (const job of jobs) {
    const { status, body } = await post(endpoint, secret, { id: job.id, sha: job.sha, explanation: job.explanation })
    const line = `${job.id} ← ${job.sha.slice(0, 7)} : HTTP ${status} ${String(body).slice(0, 200)}`
    if (status === 200) note(line)
    else warn(line)
  }
}

// Only when RUN, not when imported by its test.
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  // Never fail the deploy job — the code is already live, and a red X on a green deploy
  // would also flip this workflow's conclusion, which is what e2e.yml chains on.
  await main().catch((err) => warn(`la notification a levé : ${err}`))
}
