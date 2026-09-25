import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROUTES } from './routes'

// A RATCHET ON THE CSRF GATE.
//
// `CSRF_EXEMPT` in worker/index.ts is the shortest list in this codebase with the
// largest blast radius: every entry is a POST that any page on any origin can make with
// the operator's cookies attached. The file's own comment block already demands that each
// entry name the NARROWER gate replacing CSRF — this makes the list itself un-growable by
// accident, so adding one is an edit someone chose to make and had to come here to
// finish.
//
// It reads the SOURCE rather than importing the constant. worker/index.ts is the Worker
// entry; exporting a private set just so a test can see it would widen its surface and
// hand knip a question, and this repo already reads source for guards that cannot be
// expressed any other way (docCounts, deployHook's constant-time check).

const SRC = readFileSync(join(import.meta.dirname, 'index.ts'), 'utf8')

function exemptPaths(): string[] {
  const m = SRC.match(/const CSRF_EXEMPT = new Set\(\[([^\]]*)\]\)/)
  if (!m) throw new Error('CSRF_EXEMPT is no longer a `new Set([...])` literal — update this guard, do not delete it.')
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

describe('the CSRF-exempt list', () => {
  it('is exactly these paths — a new one is a decision, never a drift', () => {
    expect(exemptPaths().sort()).toEqual(
      [
        'auth/forgot',
        'auth/login',
        'auth/reset',
        'auth/signup',
        // « Confirme ton courriel » (0138). The click may land in a browser that has
        // never met this app — a mail opened on another device — so there is no cookie
        // pair to double-submit. What makes it safe to exempt is what the token can do:
        // it is single-use, it expires in seven days, and redeeming it grants exactly
        // one thing — a `verified_at` stamp. Nothing else is reachable with it, and the
        // resend half refuses anything but the address on the signed-in ACCOUNT.
        'auth/verify',
        'demo',
        'mcp',
        'operator-join',
        'pair/start',
        // The deploy pipeline's callback (0136). Gated by DEPLOY_NOTIFY_SECRET, which
        // fails CLOSED when unset — see the comment above the set.
        'remarks/shipped',
      ].sort(),
    )
  })

  it('every exempt path is a REAL route', () => {
    // A typo here is the quiet failure: the intended path stays CSRF-gated (so the
    // pipeline 403s forever) while a phantom entry sits in the list looking correct.
    const paths = ROUTES.map((r) => r.path)
    for (const p of exemptPaths()) expect(paths, `« ${p} » is exempt but is not in the route table`).toContain(p)
  })

  it('every exempt route actually has a non-safe method to exempt', () => {
    // CSRF only ever gates a non-safe method, so an exemption on a read-only route is
    // dead weight that reads as a live hole to the next person auditing this list.
    const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])
    for (const p of exemptPaths()) {
      const row = ROUTES.find((r) => r.path === p)!
      expect(
        row.methods.some((m) => !SAFE.has(m)),
        `« ${p} » is CSRF-exempt but only answers ${row.methods.join('/')} — there is nothing for CSRF to gate`,
      ).toBe(true)
    }
  })
})
