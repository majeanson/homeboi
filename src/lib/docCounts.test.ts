import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { arrayStrings } from './buildGuardScan'
import { TOURS } from './tourContent'
import { join } from 'node:path'

// Numbers written in prose go stale silently, and a stale number is worse than no
// number: it is read as current. PARITY.md said « 6 tours » and « 7 registries » for
// weeks after a 7th tour and an 8th registry shipped, and « 32 guide cards » while
// 34 existed — in THREE documents, one of which contradicted itself (DISCOVERY.md
// said 34 on one line and 32 on another). One of the stale copies was written by the
// very pass that was correcting the others.
//
// So the counts are asserted from code. If you add a tour, a registry or a guide
// card, this test names every document that now lies about it.
//
// A missing claim FAILS rather than skips. A doc that quietly reworded its way out of
// the check would otherwise look green forever, which is the exact failure mode this
// whole family of guards exists to kill.
const ROOT = join(import.meta.dirname, '..', '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

const guideCards = () => {
  const s = read('src/lib/guideContent.ts')
  const body = s.slice(s.indexOf('export const GUIDE'))
  return new Set([...body.matchAll(/^ {4}id: '([a-z0-9-]+)'/gm)].map((m) => m[1])).size
}
// Counted from the MODULE, not from its text. The textual scan this used to do (a
// 4-space `id: '…'` literal) went blind the moment a tour stopped being a literal:
// « le grand tour » is DERIVED (tourContent's `sectionChain` builds it from the section
// tours), so the docs kept claiming 9 tours while the app shipped 10 — and the guard
// that exists to stop exactly that stayed green, because it could not see the tenth.
const tours = () => TOURS.length
const registries = () => readdirSync(join(ROOT, 'src', 'lib')).filter((f) => f.endsWith('Help.ts')).length

// The MCP tool registry (functions/api/mcp.ts). Sliced from `const TOOLS` so the
// `name:` keys of the RPC dispatch below it cannot be counted as tools, and anchored
// at four spaces so only a registry entry matches.
//
// This claim exists because of a near miss in the very commit that added it. The count
// lived in FOUR places — twice in mcp.ts's own header, once in STATE.md, once in a
// test's title — and all four said « eight », in LETTERS. docCounts is the guard
// against exactly that drift and it could not see a word: every regex here reads a
// numeral. Adding two tools would have left three of the four lying, silently, with
// the guard green. They are numerals now.
const mcpTools = () => {
  const s = read('functions/api/mcp.ts')
  const body = s.slice(s.indexOf('const TOOLS: Tool[]'))
  return new Set([...body.matchAll(/^ {4}name: '([a-z_]+)',$/gm)].map((m) => m[1])).size
}
// The state matrix, parsed from its own table. Two traps, both hit while writing this,
// and both of the kind that report a confident wrong number rather than throwing:
// the array is declared `Entry[] = [`, so anchoring on `indexOf('[')` lands on the
// TYPE's brackets and reads an empty body (it said 0 entries, twice); and three entries
// span several lines, so a per-line count is short by exactly those three. Hence: strip
// line comments, anchor on `= [`, then walk brace depth.
// The EN / narrow LENS TWINS are generated, not literal, so `matrixEntries` — which
// parses the MATRIX array — cannot see them. Without this the docs could say "100
// states" while the sweep runs 140, and every guard would stay green: the exact drift
// this file exists to refuse (added 2026-09-10, the day the twins landed).
const lensTwins = (): number => {
  const src = read('e2e/state-matrix.spec.ts')
  const list = (name: string): number => arrayStrings(src, name).length
  // every TEXT_STRESS name gets an -en and a -narrow; board takes the narrow one only
  return list('TEXT_STRESS') * 2 + list('BOARD_NARROW_ONLY')
}

const matrixEntries = (): { entries: number; states: number; budgetedStates: number } => {
  const src = read('e2e/state-matrix.spec.ts')
  const raw = src
    .slice(src.indexOf('const MATRIX: Entry[] = ['))
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')
  const open = raw.indexOf('= [') + 2
  let d = 0
  let end = -1
  for (let i = open; i < raw.length; i++) {
    const c = raw[i]
    if (c === '[') d++
    else if (c === ']') {
      d--
      if (!d) {
        end = i
        break
      }
    }
  }
  const objs: string[] = []
  let depth = 0
  let cur = ''
  for (const c of raw.slice(open + 1, end)) {
    if (c === '{') depth++
    if (depth > 0) cur += c
    if (c === '}') {
      depth--
      if (!depth) {
        objs.push(cur)
        cur = ''
      }
    }
  }
  // An entry pinned to one theme photographs once; every other entry runs day AND night.
  const width = (o: string) => (/themes: \['(day|night)'\]/.test(o) ? 1 : 2)
  return {
    entries: objs.length,
    states: objs.reduce((n, o) => n + width(o), 0),
    budgetedStates: objs.reduce((n, o) => n + (/budgetPx:/.test(o) ? width(o) : 0), 0),
  }
}
// The e2e measurement debt: `(await x.boundingBox())!`, which throws when React detaches
// the node between the two resolves (see e2e/measure.ts). Counted from the suite, not
// typed into prose — CLAUDE.md and measure.ts both said « 74 » long after the real number
// was 40, which made a nearly-finished sweep read as hopeless.
const bareBoxSites = () => {
  const dir = join(ROOT, 'e2e')
  let n = 0
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
      // Never count the prose that DOCUMENTS the anti-pattern — measure.ts quotes it.
      if (/^\s*(\/\/|\*)/.test(line)) continue
      n += (line.match(/\.boundingBox\(\)\)!/g) ?? []).length
    }
  }
  return n
}

// A ledger's headline, counted from its own boxes. `- [ ]` means exactly one thing
// repo-wide (STATE.md §2), which is what makes this countable at all.
const openBoxes = (file: string) => (read(file).match(/^\s*- \[ \] /gm) ?? []).length
// Every root ledger's open work, summed. Anchored at line start ON PURPOSE: STATE.md
// quotes the grep command `- [ ] ` inside its own prose, and a substring count reads
// that as a third open item — the counter counting its own documentation.
const rootOpenBoxes = () => {
  const files = readdirSync(ROOT).filter((f) => f.endsWith('.md'))
  const per = files.map((f) => [f, openBoxes(f)] as const).filter(([, n]) => n > 0)
  return { total: per.reduce((n, [, c]) => n + c, 0), per }
}

// The term table (UNIFY.md day 1). Its size is quoted in UNIFY.md's census; a census
// number that drifts from the data is the very thing this week exists to stop.
const glossaryTerms = () => new Set([...read('src/lib/glossary.ts').matchAll(/^ {4}id: '([a-z0-9-]+)',$/gm)].map((m) => m[1])).size

// The component gallery and the primitive table it is supposed to mirror. COMPONENTS.md
// states both sizes in the sentence explaining WHY the parity guard exists (2026-09-09),
// and a wrong number there would undercut exactly that argument. Parsed the way
// devkitParity.test.ts parses them — the two must not grow separate ideas of "an entry".
const PATHS = /[A-Za-z0-9_/.-]+\.(?:tsx?|css)/g
const kitFiles = () =>
  new Set(
    [...read('src/pages/DevKit.tsx').matchAll(/\n\s+file: '([^']+)',/g)].flatMap((m) => m[1].match(PATHS) ?? []),
  )
const primitiveRows = () => {
  const lines = read('COMPONENTS.md').split(/\r?\n/)
  const a = lines.findIndex((l) => l.startsWith('## Shared primitives'))
  const b = lines.findIndex((l) => l.startsWith('### Page orchestrators'))
  const kit = kitFiles()
  let rows = 0
  let specimens = 0
  for (let i = a; i < b; i++) {
    const l = lines[i]
    if (!l.startsWith('|')) continue
    const cells = l.split('|').map((c) => c.trim())
    if (cells.length < 4) continue
    const name = cells[1].replace(/\*\*/g, '').trim()
    if (!name || /^-+$/.test(name) || name === 'Component') continue
    const files = cells[2].match(PATHS) ?? []
    if (!files.length) continue
    rows++
    if (files.some((f) => kit.has(f))) specimens++
  }
  return { rows, specimens }
}

// PARITY.md Part 1 is a roster of feature ROWS (`| F36 | Les virements | …`), and its
// opening line states how many. It read « ~33 » against 35 rows, then against 36 — a
// tilde is how a number stops being checkable. The count is the rows themselves now.
function parityRoster(): number {
  const lines = read('PARITY.md').split('\n')
  const a = lines.findIndex((l) => l.startsWith('## Part 1'))
  const b = lines.findIndex((l) => l.startsWith('## Part 2'))
  return lines.slice(a, b).filter((l) => /^\| F\d+ /.test(l)).length
}

describe('the docs quote the real counts', () => {
  // Each claim: the file, a regex whose FIRST capture group is the number as written,
  // and the live value it must equal. Keep the regex tight enough that it only matches
  // the sentence it is meant to check.
  const claims: { file: string; what: string; re: RegExp; actual: () => number }[] = [
    { file: 'PARITY.md', what: 'Part 1 roster size', re: /\*\*(\d+)\*\* user-facing features/, actual: parityRoster },
    { file: 'PARITY.md', what: 'help registries (D7 method)', re: /coverage by one of the \*\*(\d+)\*\* help registries/, actual: registries },
    { file: 'PARITY.md', what: 'tours (D7 method)', re: /`lib\/tourContent\.ts`, \*\*(\d+)\*\* tours/, actual: tours },
    { file: 'PARITY.md', what: 'guide cards (Appendix A)', re: /`src\/lib\/guideContent\.ts` \(\*\*(\d+)\*\* GUIDE cards\)/, actual: guideCards },
    { file: 'PARITY.md', what: 'tours (Appendix A)', re: /\(\*\*(\d+)\*\* tours: essentials/, actual: tours },
    { file: 'CLAUDE.md', what: 'guide cards (jargon table)', re: /\*\*(\d+)\*\* guide cards today against/, actual: guideCards },
    { file: 'DISCOVERY.md', what: 'guide cards (add-a-feature step 1)', re: /there\s+are \*\*(\d+)\*\* today/, actual: guideCards },
    // A ledger's own banner, against its own boxes (UNIFY.md day 7). This one had said
    // « 15 » for twelve days after the boxes fell to 1 — and STATE.md had it right the
    // whole time. The headline is the part everyone reads and nobody re-derives.
    // LEAN.md keeps the FIRST sweep's numbers as dated history; these are the live ones.
    { file: 'LEAN.md', what: 'matrix entries (current size)', re: /today the sweep is (\d+) entries/, actual: () => matrixEntries().entries },
    { file: 'LEAN.md', what: 'matrix states (current size)', re: /entries → (\d+)\s*\n?states/, actual: () => matrixEntries().states },
    { file: 'LEAN.md', what: 'budgeted states (current size)', re: /states, (\d+) of them budgeted/, actual: () => matrixEntries().budgetedStates },
    { file: 'LEAN.md', what: 'lens twins (EN + narrow)', re: /plus (\d+) lens twins/, actual: lensTwins },
    // STATE.md §2's headline: the repo's entire written open work, in one number. It is
    // the first thing a session reads, so it is the worst one to let drift.
    // The per-file breakdown that used to sit here is gone with the boxes it counted:
    // both files reached zero on 2026-09-09, so « 0 in X, 0 in Y » would be noise. The
    // total still carries the whole claim, and REVIEW-PASS keeps its own banner check.
    { file: 'STATE.md', what: 'repo-wide open boxes', re: /It reads \*\*(\d+)\*\* —/, actual: () => rootOpenBoxes().total },
    { file: 'CLAUDE.md', what: 'bare boundingBox sites', re: /\*\*The sweep is done \(2026-09-09\):\s*\n?\s*(\d+) bare call site/, actual: bareBoxSites },
    { file: 'e2e/measure.ts', what: 'bare boundingBox sites', re: /\*\*(\d+) site[s]? left in this suite\*\*/, actual: bareBoxSites },
    // The size of the primitive table and how much of it the gallery actually shows.
    // The pass's own evidence sentence ("140 rows against 91 specimens", 2026-09-09) is
    // deliberately NOT asserted: it is dated history, like LEAN.md's first-sweep numbers,
    // and freezing the live claim to it would make the doc lie the next time a row lands.
    // These two are the LIVE pair, one line above it.
    { file: 'COMPONENTS.md', what: 'primitive rows (live)', re: /holds (\d+) rows, of which \d+ have a live specimen/, actual: () => primitiveRows().rows },
    { file: 'COMPONENTS.md', what: 'rows with a live specimen', re: /holds \d+ rows, of which (\d+) have a live specimen/, actual: () => primitiveRows().specimens },
    // The MCP server states its own size three times; all three are checked, because
    // the one that goes stale is always the one nobody re-read.
    { file: 'functions/api/mcp.ts', what: 'tool registry size (header)', re: /^\/\/ (\d+) tools, hand-picked/m, actual: mcpTools },
    { file: 'functions/api/mcp.ts', what: 'tool registry size (the argument)', re: /less legible\. (\d+) tools that say what they/, actual: mcpTools },
    { file: 'STATE.md', what: 'MCP tool registry size', re: /of the (\d+) tools, most proxy a/, actual: mcpTools },
  ]

  for (const c of claims) {
    it(`${c.file} — ${c.what}`, () => {
      const m = read(c.file).match(c.re)
      // Not a skip: a claim that vanished is a claim nobody is checking any more.
      expect(m, `${c.file}: the sentence stating ${c.what} no longer matches ${c.re}. If you reworded it, update the regex here — do not delete the claim.`).not.toBeNull()
      expect(Number(m![1]), `${c.file} says ${m![1]} for ${c.what}; the code has ${c.actual()}`).toBe(c.actual())
    })
  }

  // Sanity: if these ever read 0, the extractors broke and every assertion above
  // would be trivially comparing 0 to a doc that also says 0.
  it('the extractors actually find things', () => {
    expect(guideCards()).toBeGreaterThan(20)
    expect(tours()).toBeGreaterThan(3)
    expect(registries()).toBeGreaterThan(3)
    expect(glossaryTerms()).toBeGreaterThan(15)
    // A slice-then-regex parser that stops matching reads as a plausible small number,
    // and a doc edited in the same commit would happily agree with it.
    expect(mcpTools()).toBeGreaterThan(5)
    // Both parsers walk hand-written prose/JSX, so both can fall silently to a
    // plausible zero — floors, not just equality against a doc that would then agree.
    expect(kitFiles().size).toBeGreaterThan(100)
    expect(primitiveRows().rows).toBeGreaterThan(130)
    expect(primitiveRows().specimens).toBeGreaterThan(80)
    // The matrix parser is the one here that fails SILENTLY into a plausible zero (see
    // its comment); a floor is the whole difference between a guard and a decoration.
    const m = matrixEntries()
    expect(m.entries).toBeGreaterThan(50)
    expect(m.states).toBeGreaterThanOrEqual(m.entries)
    expect(m.budgetedStates).toBeGreaterThan(30)
    // The box counter needs a floor too — but NOT "at least one box is open". That was
    // the floor until 2026-09-09, when the last two closed and a correct 0 turned this
    // canary red for being right. A counter must not require the thing it counts to
    // exist. What actually proves the scanner works is that it still finds boxes at all,
    // so it counts the DONE ones instead: those only ever accumulate.
    const done = ['STATE.md', 'PARITY.md', 'ACTIONS.md'].reduce((n, f) => n + (read(f).match(/^\s*- \[x\] /gm) ?? []).length, 0)
    expect(done, 'the box scanner found no [x] anywhere — the regex is broken, not the ledgers').toBeGreaterThan(10)
  })
})

// THE FRONT DOOR STAYS A FRONT DOOR (2026-09-17).
//
// STATE.md exists to answer « what should I do next? ». It had grown to 4 289 lines, of
// which the only OPEN work started at line 3 490 — so the answer sat behind 81 % of the
// file, and the front door had become the chronicle it was written to replace. Its
// history moved out, and on 2026-09-17 out of the repo entirely — `bmad/` was deleted.
// Git holds all of it; `git show <sha>:bmad/history/SHIPPED.md` still reads it.
//
// Two RATCHETS hold it there. Both may FALL and must never RISE, exactly like
// check-bundle's chunk budgets: a file like this regrows one honest paragraph at a time,
// and a number that only goes down is the only thing that has ever stopped that here.
// Raising either is a decision to argue for in the commit message, not a convenience —
// and the escape hatch is the same one it has always been: the finished part belongs in
// git history, not in the front door.
// The numbers are a CEILING for what this file should be — a snapshot, the document
// map, ONE session's entries, the open plan, the process review — not a snapshot of what
// it happens to be today (653 / 254). A session writes its §3 entry and moves the
// previous one out (git keeps it), which is net-neutral; the headroom is for the
// moment between those two edits, not a licence to accumulate.
// THE COUNT HERE IS `wc -l` + 1, and that off-by-one pushed a red build on 2026-09-22.
// `split(/\r?\n/)` on a file ending in a newline yields a trailing empty element, so a
// file `wc -l` calls 600 measures 601 to this test. Trim to **`wc -l` ≤ MAX − 1**.
// Deliberately not "fixed" by dropping the empty element: this number is a budget, and a
// budget that quietly forgives one line is how the next one gets forgiven too.
const STATE_MAX_LINES = 545 // today 536 by wc -l, 537 here
const STATE_FIRST_OPEN_BOX_BY = 300 // today 254

describe('STATE.md stays a front door', () => {
  const state = read('STATE.md').split(/\r?\n/)

  it(`is at most ${STATE_MAX_LINES} lines — a ratchet: lower it when you prune`, () => {
    expect(
      state.length,
      'STATE.md grew. Cut the finished part (git keeps it — that is what git is for) and LOWER this number, do not raise it',
    ).toBeLessThanOrEqual(STATE_MAX_LINES)
  })

  // The length is a proxy; THIS is the property it stands for. A file whose open work
  // sits on line 3 490 is not a front door, whatever its length.
  it(`puts the first open box within the first ${STATE_FIRST_OPEN_BOX_BY} lines`, () => {
    const first = state.findIndex((l) => /^- \[ \] /.test(l))
    expect(first, 'no open box at all — if that is true, say so in §4 rather than leaving the section empty').toBeGreaterThanOrEqual(0)
    expect(
      first + 1,
      'the open work moved down the file. Whatever grew above it is history: cut it — git keeps it',
    ).toBeLessThanOrEqual(STATE_FIRST_OPEN_BOX_BY)
  })
})
