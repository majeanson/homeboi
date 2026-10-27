import type { Env } from './env'
import { charge } from './usage'

/**
 * THE ONE PLACE A PAGE IS RENDERED IN A BROWSER (2026-10-27) — Browser Run, ex Browser
 * Rendering, the `[browser]` binding.
 *
 * Why it exists: recettes.qc.ca, Zeste and IGA sit behind Akamai, which refuses a
 * Worker's plain fetch outright (403), and refuses the public reader too. A real
 * headless browser on Cloudflare's side is the next honest door. It is a TRY, not the
 * answer: Cloudflare's own docs say the crawler « cannot bypass bot detection », so it
 * may 403 as well — the cook's own browser (the « Envoyer à Babillard » bookmarklet,
 * src/lib/recipeBookmarklet.ts) is the door that always works.
 *
 * Why ONE seam: the Workers Free plan gives 10 browser-minutes a DAY for the whole
 * account. Every render is charged to the household's `browser` meter (_lib/usage.ts,
 * migration 0145: 20/day for a household, 5 for a sandbox or an unconfirmed one, a
 * strangers' pool on top) BEFORE the browser starts. `usageRule.test.ts` fails the build
 * on a `quickAction(` anywhere else.
 *
 * Returns the rendered HTML, or null — unbound, over budget, refused, `success:false`,
 * empty, or anything thrown. Never throws: the caller falls through to its next door.
 *
 * PROD-ONLY: `quickAction` does not run under local `wrangler dev` (it needs `--remote`)
 * and the d1 harness binds BROWSER to ''. Unverified until a real link runs on prod.
 */

export interface BrowserRun {
  quickAction(action: 'content', options: { url: string; gotoOptions?: { waitUntil?: string; timeout?: number } }): Promise<unknown>
}

const asResult = async (raw: unknown): Promise<{ success?: unknown; result?: unknown } | null> => {
  if (!raw || typeof raw !== 'object') return null
  // A fetch-style Response (`.json()`), or the parsed object itself.
  const r = raw as { json?: () => Promise<unknown>; ok?: boolean }
  if (typeof r.json === 'function') {
    if (r.ok === false) return null
    const body = await r.json()
    return body && typeof body === 'object' ? (body as { success?: unknown; result?: unknown }) : null
  }
  return raw as { success?: unknown; result?: unknown }
}

// Akamai's « Access Denied », Cloudflare's challenge, PerimeterX's — a page that is a
// refusal, whatever its status code said.
export function isRefusalPage(html: string): boolean {
  return html.length < 20_000 && /<title>\s*(?:access denied|attention required|just a moment|access to this page has been denied|403 forbidden)/i.test(html)
}

export async function renderPage(env: Env, url: string): Promise<string | null> {
  const browser = env.BROWSER as BrowserRun | undefined | ''
  if (!browser || typeof browser.quickAction !== 'function') return null
  const verdict = await charge(env, 'browser', 1)
  if (!verdict.allowed) return null
  try {
    const res = await asResult(
      await browser.quickAction('content', { url, gotoOptions: { waitUntil: 'networkidle2', timeout: 30_000 } }),
    )
    if (!res || res.success === false || typeof res.result !== 'string' || !res.result.trim()) return null
    // A bot manager's refusal rendered faithfully is still a refusal, not a page.
    if (isRefusalPage(res.result)) return null
    return res.result.slice(0, 2_000_000)
  } catch (err) {
    console.error('[browser] render failed:', err instanceof Error ? err.message : String(err))
    return null
  }
}
