import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// THE OPERATOR-DOORS RULE (2026-11-05, wave 1 of plans/2026-11-05-SOLIDIFY.md).
//
// `authed(handler, 'operator')` rejects a paired kiosk (scope 'kiosk') and a guest with a
// 403 — correct on the server, and a trap on the client: a kiosk that still RENDERS the
// door taps it and reads « Pas enregistré », the one outcome worse than no door. Thirty-
// six handlers are operator-only (transfers, trips and everything shared-trip, habits
// DELETE, members admin, guest links, pairing, takeout…), and the client had no single
// predicate for « this needs the operator »: Virements and Habitudes gated on
// `isGuest()` alone, which is half the truth. `lib/device.ts` `needsOperator()` is the
// whole truth; this test pairs every operator-only (path, method) with every client
// call site of it and fails a site whose FILE never reaches for that predicate (or
// `isPaired()`, its kiosk half) — unless ALLOWED says why the file is only ever reached
// behind an operator gate (a Réglages section declared `access: 'operator'` in
// SETTINGS_TREE, which the pill row derives from; the sandbox claim page; an invite link
// a kiosk cannot hold).
//
// The operator-only set is DERIVED from the handlers (paren-matched `authed(` calls —
// the first draft's lazy `[\s\S]*?` matched 37 files that merely READ `actor.scope`),
// never pinned by hand: a new operator-only method is paired with its client sites the
// moment it lands.

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const rel = (f: string) => relative(rootDir, f).split(sep).join('/')

function walk(dir: string, re: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : walk(p, re)
    return re.test(name) && !/\.test\.|\.d1\./.test(name) ? [p] : []
  })
}
const stripLineComments = (s: string) => s.replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"`])\/\/[^\n'"`]*$/gm, '$1')

/** Every `authed(…)` call's text, by matching parens. */
function authedCalls(src: string): { call: string; before: string }[] {
  const out: { call: string; before: string }[] = []
  const re = /\bauthed\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    let depth = 0
    for (let i = m.index + m[0].length - 1; i < src.length; i++) {
      if (src[i] === '(') depth++
      else if (src[i] === ')' && --depth === 0) {
        out.push({ call: src.slice(m.index, i + 1), before: src.slice(0, m.index) })
        break
      }
    }
  }
  return out
}
const OPERATOR_TAIL = /,\s*['"]operator['"]\s*(?:,\s*\{[^{}]*\}\s*)?\)$/
const METHOD_OF = { onRequestGet: 'GET', onRequestPost: 'POST', onRequestPatch: 'PATCH', onRequestPut: 'PUT', onRequestDelete: 'DELETE' } as const

/** path (as the client spells it: 'habits', 'auth/password') → operator-only methods. */
function operatorOnly(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const f of walk(join(rootDir, 'functions/api'), /\.ts$/)) {
    const path = rel(f).replace(/^functions\/api\//, '').replace(/\.ts$/, '')
    if (path.includes('[')) continue
    for (const { call, before } of authedCalls(stripLineComments(readFileSync(f, 'utf8')))) {
      if (!OPERATOR_TAIL.test(call)) continue
      const exp = /export const (onRequest\w+)\s*=\s*$/.exec(before)
      const method = exp ? METHOD_OF[exp[1] as keyof typeof METHOD_OF] : undefined
      if (!method) continue
      if (!out.has(path)) out.set(path, new Set())
      out.get(path)!.add(method)
    }
  }
  return out
}

// file → why every call site in it is only ever reached behind an operator gate.
// `signedIn` (lib/auth) is true for an OPERATOR session only — /api/auth/me answers
// `signedIn: false` to a device token — so a surface that renders on `signedIn` is
// already kiosk-safe; the Réglages bodies ride SETTINGS_TREE's `access: 'operator'`.
const ALLOWED = new Map<string, string>([
  ['src/components/operator/devices.tsx', 'DevicesSection + ClaimTablet: the `devices` / `claimTablet` sections are access: operator — the pill never renders for a kiosk'],
  ['src/components/operator/guest.tsx', 'GuestSection: `guestLinks`, access: operator'],
  ['src/components/operator/household.tsx', 'members admin: `members`, access: operator'],
  ['src/components/operator/IntakeReview.tsx', 'mounted only inside GuestSection (guest.tsx), access: operator'],
  ['src/components/operator/PostboxReview.tsx', 'mounted only inside GuestSection (guest.tsx), access: operator'],
  ['src/components/operator/sampleData.tsx', 'SampleDataControls: mounted only by operator/guide.tsx behind !needsOperator()'],
  ['src/components/operator/ThisWeekTogetherSection.tsx', '`thisWeek` is access: operator in SETTINGS_TREE (flipped 2026-11-05 — it read household and a kiosk met a card that could only 403)'],
  ['src/components/WelcomeCard.tsx', 'renders only when signedIn (an operator session); the seed POST and the pair/devices GET sit behind that'],
  ['src/components/SampleBanner.tsx', 'renders only when signedIn (an operator session) in a sandbox household'],
  ['src/components/cercle/FamilyShareModal.tsx', 'opened only by Maison\'s two share doors, both hidden on needsOperator()'],
  ['src/components/voyage/SharedPackingList.tsx', 'mounted only inside SharedVoyagePage, which bounces needsOperator() at its head'],
  ['src/components/voyage/VoyageShareModal.tsx', 'mounted only inside SharedVoyagePage, which bounces needsOperator() at its head'],
  ['src/lib/share.ts', 'the share API; its callers are EntityShareModal (opened on `signedIn` from the recipe sheet, the routine form, the event peek) and operator/guest.tsx'],
  ['src/lib/transfers.ts', 'the transfer write hooks; every door that reaches them gates — VirementsSection `ro = needsOperator()`, PlanCard `readOnly`, the two FormScenes in TransferFormPage bounce needsOperator()'],
  ['src/pages/ClaimPage.tsx', '« Garder ma maisonnée »: an online-only auth action on the SESSION the sandbox minted; a kiosk has no account to claim and the form shows the server\'s refusal'],
])

interface Site { file: string; line: number; path: string; method: string }

/** Every client call of an operator-only (path, method), with the method it uses. */
function clientSites(ops: Map<string, Set<string>>): Site[] {
  const out: Site[] = []
  const paths = [...ops.keys()].map((p) => p.replace(/[-/]/g, '\\$&')).join('|')
  const re = new RegExp(`\\b(?:write|writeWith|api)\\s*(?:<[^>]*>)?\\s*\\(\\s*(?:qc\\s*,\\s*)?['"\`](${paths})['"\`]`, 'g')
  for (const f of walk(join(rootDir, 'src'), /\.(ts|tsx)$/)) {
    const src = stripLineComments(readFileSync(f, 'utf8'))
    for (const m of src.matchAll(re)) {
      const after = src.slice(m.index, m.index + 300)
      const next = after.slice(6).search(/\b(?:write|writeWith|api)\s*(?:<[^>]*>)?\s*\(/)
      const scope = next >= 0 ? after.slice(0, next + 6) : after
      const method = /method:\s*['"](GET|POST|PATCH|PUT|DELETE)['"]/.exec(scope)?.[1] ?? 'GET'
      if (!ops.get(m[1]!)!.has(method)) continue
      out.push({ file: rel(f), line: src.slice(0, m.index).split('\n').length, path: m[1]!, method })
    }
  }
  return out
}

describe('operator-only doors', () => {
  const ops = operatorOnly()

  it('derived the set from the handlers (a broken parser must not pass vacuously)', () => {
    expect(ops.get('household')?.has('DELETE')).toBe(true)
    expect(ops.get('habits')?.has('DELETE')).toBe(true)
    expect(ops.get('trips')?.has('GET')).toBe(true)
    expect(ops.size).toBeGreaterThan(30)
  })

  it('every client site of an operator-only (path, method) hides behind needsOperator() / isPaired(), or says why it need not', () => {
    const bad: string[] = []
    for (const s of clientSites(ops)) {
      if (ALLOWED.has(s.file)) continue
      const src = readFileSync(join(rootDir, s.file), 'utf8')
      if (/\b(?:needsOperator|isPaired)\s*\(/.test(src)) continue
      bad.push(`${s.file}:${s.line}  ${s.method} ${s.path}`)
    }
    expect(bad.join('\n'), 'a paired kiosk gets a 403 here — gate the door on needsOperator() (lib/device.ts), or add the file to ALLOWED with why it is only reached behind an operator gate').toBe('')
  })

  it('every ALLOWED file still calls an operator-only endpoint (a stale exemption is a silent hole)', () => {
    const live = new Set(clientSites(ops).map((s) => s.file))
    for (const [file] of ALLOWED) expect(live.has(file), `${file} no longer calls an operator-only endpoint — drop it from ALLOWED`).toBe(true)
  })
})
