# STATE.md — where Babillard is, what's left, and how we've been working

> **What this file is.** The single front door. Nine other root markdown files hold real,
> careful detail; none of them answers "what should I do next?", which is why that
> question has to be asked out loud every session. This file answers it, and points at
> the detail rather than repeating it.
>
> **It is kept SHORT on purpose** (2026-09-17). It had grown to 4 289 lines, of which the
> only open work started at line 3 490 — so the question it exists to answer was behind
> 81 % of the file. What shipped, and every closed finding, went to git — where the
> `bmad/` planning folder followed it on the same day. A line budget is enforced by
> `src/lib/docCounts.test.ts`, and it is a ratchet: it may fall, never rise.
>
> **Written 2026-08-27**, after a four-wave sweep (commits `8e526e3`, `e76bfe1`,
> `375856c`, `31598dd`). Everything below was verified against code or a command run
> that day — **not** read off another document. That distinction is the whole point:
> see [§5](#5-process-review--fresh-eyes).
>
> **Keep it living.** When a wave lands, update §1's numbers and §4's ranking here, in
> the same commit. If this file goes stale it becomes the fourteenth problem. And when
> the NEXT session's first §3 entry lands, CUT the current ones — git keeps them, and
> that is what keeps this file short.

---

## 1. Snapshot

| | |
| --- | --- |
| **What it is** | A calm household command-center for a cheap always-on wall tablet. Single-page React app + one Cloudflare Worker (static assets + `/api/*`) + D1 + Workers AI + R2. FR-CA first. |
| **Code** | ~157k lines across 955 `.ts`/`.tsx` files (`src/`, `functions/`, `worker/`) |
| **Schema** | 136 forward-only migrations (0136 = « Les remarques ») |
| **Tests** | 2 392 unit tests in 189 files · 85 real-runtime cases in 12 files (`npm run test:d1`, the Worker in workerd against a real D1) · 157 Playwright spec files |
| **Deploy** | Push to `main` → CI (typecheck · test · build · bundle budget · **test:d1** · knip) gates `db:migrate:prod` + `wrangler deploy`. E2E is decoupled (`workflow_run`), runs after a green CI, never blocks the ship. |
| **Second interface** | `/api/mcp` — read-only over the household — of the 12 tools, most proxy a GET handler that already exists, so the caps, the recurrence expansion and the time zone are decided once and inherited. (This row lives HERE, not in §3: docCounts derives that number from the registry, and the claim died the first time §3 rotated.) |
| **Households in production** | **Six**, counted in D1 on 2026-09-22 — Marc's (4 members), four other real accounts from the invite gate, and the legacy read-only demo singleton. This row said « One (Marc's) » for months: other people's households are already in there, which is what Wave 4 (deletion, privacy, a contact door) is actually about |

*(Numbers re-measured 2026-09-17. They are the kind that rot: re-run the commands before
quoting them — `src/lib/docCounts.test.ts` holds the ones that CAN be derived from code.)*

### Health signals

- `npm run typecheck` · `npm test` · `npm run test:d1` · `npm run build` · `npm run check:bundle` · `npm run knip` — green 2026-09-17, and all six gate the deploy.
- `npm run e2e:ci` — 1 515 passed locally 2026-09-17. **One known cross-spec order
  dependency is fixed** (`config-panels` « a list row opens its editor scene »); CI's
  E2E job is the standing whole-suite signal, and it chains off CI — so **a red CI means
  no E2E ran at all**, which hid three commits' worth of failures for a day.
- `npm run e2e:sw` — 5 passed (the kiosk's offline reboot, against the real PROD bundle).
- `npm run check:bundle` — the door's static closure is **9 chunks / 645 KB** (was 70 /
  1 131 before the hub went lazy); every chunk within budget; the SW precache covers all
  offline-needed chunks and skips build metadata.
- **The build-gating invariants** are the codebase's best feature (§5), and the list is
  long enough that it belongs where it is enforced rather than here: every one lives in
  `src/lib/*.test.ts`, `functions/_lib/*.test.ts`, `scripts/*.test.mjs` or
  `scripts/check-bundle.mjs`, each with a header saying what it caught. *(This line used
  to open with a count spelled in letters — which is a number nobody re-derives, and the
  very thing `docCounts` exists to prevent. It cannot derive "how many guards" honestly,
  so the count is gone rather than wrong.)* Three joined on 2026-09-19: `csrfExempt`
  (a ratchet on the CSRF-exempt set — it found `pair/poll` sitting there answering GET
  only), `ci-untrusted` (no `${{ github.event… }}` may reach a `run:` block — it found an
  existing one in `sw-repro.yml`), and `deployHook` (the polarity of the only inbound
  shared-secret gate). The rule that matters is §5's: **a guard that has never been red
  proves nothing** — plant the defect, watch it fail, restore.
- **`data_invariants` is a new TIER of guard**, not another entry on that list: every
  test above reads source, and this one reads ROWS (`functions/_lib/invariants.ts`, via
  the MCP tool or `worker/invariants.d1.test.ts`). It is read-only and per-household, and
  it distinguishes « not checked » from « fine » on purpose.

## 2. The document map

**Nine** root `.md` files beside this one and `README.md`. They are **not**
interchangeable. Read this table before opening any of them.

> **The checkbox convention** (repo-wide, adopted 2026-08-28 — this is the canonical
> statement; the ledgers carry a copy):
>
> | | |
> | --- | --- |
> | `- [ ]` | **open work.** Someone still has to do it. Nothing else uses this. |
> | `- [x]` | done — with the file:line or commit that settles it |
> | `- [~]` | reviewed and parked, **with the why** — so it isn't re-litigated |
> | `❓` | an open **question**, not a task |
> | ⚪ | an **idea pool** entry — uncommitted, never a queue |
>
> Templates (`PARITY.md` Parts 5–6, `ACTIONS.md` Part 5) and idea pools carry **no
> checkboxes at all**. Before this, `- [ ]` meant three different things and any count
> of "open items" read **75** when the true number was 17 — a mis-count that opened at
> least one session on the wrong work. `grep -rc -- "- [ ] " *.md` is now
> a number you can trust. It reads **9** — eight in the public-readiness plan §4-K, and
> one left from the closed hardening pass (enforce the CSP, waiting on a week of reports,
> not on work). **That number is asserted from the boxes themselves** by
> `src/lib/docCounts.test.ts`, so this sentence cannot drift the way `REVIEW-PASS.md`'s
> own banner once did — it claimed 15 for twelve days against a single box.
>
> **A written box is the RARE case, not the backlog.** Most of what is worth doing lives
> in judgement: the idea pools, the parity matrix's own cells, a device pass, the next
> sweep of screenshots. Read §4 before picking work.
>
> **What `[~]` may NOT be used for:** a bullet that still says "Still open: …" is open
> work, not a park. Four were flipped back from `[~]` to `[ ]` on the day the convention
> shipped, for exactly that reason.
>
> *(How the count moved between 2026-08-27 and 2026-09-16 — 75 → 17 → 0 → 9 — is in git
> and is not needed to pick up work.)*

| File | Kind | Status |
| --- | --- | --- |
| **STATE.md** | ← you are here | The front door. Start here. §4 is what is open. |
| `CLAUDE.md` | **Law** | Build-by-reuse rules, conventions, the primitive table. Read before writing code. |
| `PARITY.md` | **Playbook** | The feature × dimension matrix + the canonical new-entity checklist. 0 open — Wave D is a `[~]` standing policy. Parts 5–6 are a template: copy, don't tick. |
| `ACTIONS.md` | **Playbook** | The action × door matrix (action × entry point × undo tier × non-touch). No open items — Part 5 is a template. |
| `LEAN.md` · `DISCOVERY.md` · `COMPONENTS.md` · `OFFLINE.md` · `DEPLOY.md` | Reference | Consult when touching their concern. |
| `PLAN-mots-and-lifecycle-followups.md` | ⚪ Idea pool | 12 designed-but-unbuilt features (A5–D2), never started. Not a backlog. |
| ~~`bmad/`~~ | **Deleted 2026-09-17** | The planning folder and the archive: brief, PRD, architecture, the idea pools, every finished ledger, and this file's own past. ~10 000 lines of documents about an app that is built. **In git, not in the tree** — `git log --diff-filter=D -- bmad/` finds the deleting commit; `git show <sha>^:bmad/<file>` reads any of it. Code comments still cite its tags (`NFR-CALM-1`, `PRD C5`, `bmad/08 E-36`); they are labels now, not pointers (see CLAUDE.md ▸ Requirement tags). |

**The trap this table used to exist to stop is now fixed at the source.** `PARITY.md` +
`ACTIONS.md` contributed 40 unticked boxes that were templates; they are plain bullets
now, so the repo-wide count is honest for the first time.

---

## 3. What just shipped

### The board card acts — a remark, answered by the loop it asked about — 2026-09-22

The first remark the household ever filed was about « Les remarques » itself — « Widget
on board for remarques (add and resolve) », at build `11fcf248`, the build BEFORE the
board card shipped. The card that answered it was read-only: every row a link into
Réglages, the whole thing one big `<Link>`. That reads well, and costs a navigation for
the only two things anyone does with a remark. Both are in place now, on the board:

- **the header ＋** (`SectionAdd popup`) opens the ONE shared composer — a fourth door,
  not a second form;
- **a `shipped` row carries the two verdict chips**, the same words and the same rule as
  Réglages: offered only once a deploy has claimed it.

**The « ? » bubble stopped navigating**, on every surface. It was a link for a real
reason — mounting a modal in a component rendered everywhere pulls Query, the write hook
and the toast with it — but the shape was wrong: you tap « ? » because something is wrong
HERE, and the answer walked you off the page you were describing. `lazy()` settles it.
`?report=1` stays for the crash screen, which cannot do this (`ErrorBoundary` is
deliberately hook-free).

Three things worth keeping from the way it was built:

- **The PATCH got an owner the moment it had two callers** — `useRemarkVerdict`
  (`lib/remarks.ts`), plus a `remarks` entry in `write-owners.test.ts` naming all three
  write sites (the hook, the composer's POST, the section's DELETE). Exactly the
  leftover-flow shape (one flow, two surfaces, four drifts by 2026-09-03), caught on the
  way in. **Both halves proven red** — a hand-rolled PATCH planted in the card, then an
  emptied `affectedKeys` in the hook — and restored.
- **A card that acts cannot be a `<Link>`**: a button inside an anchor is invalid HTML
  and navigates anyway. `CercleNotesCard` had answered this already — the card is a
  `<div>`, its door survives as a link per row.
- **`.help-bubble__report` dresses a `<button>` now**, so it got the UA-chrome reset
  `link-button-rule.test.ts` exists for. That guard only fires on a class worn by BOTH
  kinds, and this one moved wholesale — which is the gap in it.

**Gates:** typecheck · 2 394 unit · build · bundle (door 7 chunks / 700 KB, eager 555 KB)
· `e2e/remarks.spec.ts` 8 green, three of them new, each asserting the write left AND the
board is still under it; the shared-machinery batch (`help` · `section-add` ·
`board-compact` · `board-customize`) run twice. **The full local `e2e:ci` did NOT run** —
it died of memory pressure twice, once a V8 heap OOM before the first test and once the
Vite server itself refusing connections mid-run. CI's E2E job is the whole-suite signal
for this commit, and [[ci-is-source-of-truth]] now records that this machine cannot
finish the suite.

**And then the loop did not close — the finding this session is really worth.** The
commit above carried the first `Regle-remarque:` trailer ever written. CI ran it, the
step went green (it is `continue-on-error`), and the remark stayed **« ouverte »**. The
annotation said `HTTP 403 <!DOCTYPE html><title>Just a moment…`: **Cloudflare's own edge
challenged the callback before the Worker ever saw it.** `babillard.marcportal.com` is on
a zone whose bot protection challenges a bare `fetch` from a datacenter IP — and a
challenge is not something a `fetch` can solve. The same POST answers `401` from a
laptop, so the shared secret was never the problem, and nothing had caught it because
every other CI job that touches production drives a real browser, which solves the
challenge and moves on.

Fixed by sending the machine-to-machine call to the **`*.workers.dev`** host — the same
Worker without the zone in front — with the URL **read out of the deploy's own output**
rather than hard-coded, so it cannot rot when an account subdomain changes, and the
public host left as the fallback. `X-Deploy-Secret` is the boundary on that route by
design (`remarks/shipped.ts` is deliberately not `authed()`), and that hostname already
serves the app, so nothing new is exposed. The `tee` this needs made `shell: bash`
load-bearing on the deploy step: GitHub's default `bash -e` has **no pipefail**, so
`wrangler deploy | tee` would have reported `tee`'s exit code and a failed deploy would
have read as green. The notify script now names the HOST in its annotation, because the
one that failed named everything except which host had refused. Both shell branches were
exercised by hand, and `ci-untrusted.test.mjs` was proven red against the new `run:`
block before being trusted — then proven end to end by naming the same remark twice, because
an unfired delivery path is a fix nobody has seen work.

**And what production said while picking the work** (`app_health`, 2026-09-22):
`deployHook: true` — the CI half of the loop is armed. `mail: false` and `alerts: false`
— **Wave 3's whole password-reset flow is built and dark**, and the nightly cron's alarm
still has nowhere to ring. Both wait on the Resend steps in §4-K Wave 3, which are
Marc's and outside the repo.

> **Older entries are in git, not here.** This section holds the CURRENT session's work
> and nothing else: when the next session's first entry lands, this one is cut. That rule
> is what keeps this file a front door instead of a chronicle — it had reached 4 289
> lines, with the only open work at line 3 490.

## 4. What still needs improvement — consolidated and ranked

> **Asked « what should we work on? » on or after 2026-09-16 — go to [§K](#k-towards-a-public-app--the-plan-written-2026-09-16-start-here) for the product waves and [§L](#l-the-public-app-hardening-pass--planned-2026-09-16-thirteen-items-in-priority-order) for the hardening pass being worked through one item at a time.**
> It is the plan toward a public app, in six ordered waves, and Wave 0 is the wide-screen
> pass. Everything above §K in this section is settled history.

> **Everything except §K is closed.** The argument, the measurements and the several
> findings that turned out to be wrong are in git (`git log --diff-filter=D -- bmad/` finds the deleting commit; `git show <sha>^:bmad/<file>` reads any of it.). One line each here,
> with the verdict:

| § | What it was | Verdict |
| --- | --- | --- |
| **A** | Verified correctness — the `useWrite` sweep, `/share`'s lost writes | ✅ done 2026-08-27 |
| **B** | The friction pool (the friction audit), tiers 1–3 | ✅ closed 2026-08-28; four of five tier-3 items were already stale |
| **C** | Section debt (`REVIEW-PASS.md`), swept four times | ✅ closed 2026-09-09, 31 → 0 |
| **C-bis … C-undecies** | Eleven rounds reported from the device, 2026-08-28 → 09-03 — list items resurrecting, dead calendars, the day scene's shape, the photo→recipe read | ✅ all closed; the durable ones became guards (`tmpIds`, `healOnError`, `repairImperialFromMetric`) |
| **D** | Judgement calls waiting on Marc | ✅ all answered — pinch-zoom off, calendars retired, the supper hero left alone. **Declined, not deferred: do not re-propose without a new observation** |
| **E** | Tooling gaps found during the cleanup | ✅ closed — `knip` wired into CI, its signal configured down from 58 findings to 7 |
| **G · H · I · J** | Four passes that LOOKED: the 100-screenshot review, what the sweep could not see, the frames re-read, and fresh eyes on the a11y census | ✅ all closed; `color-contrast` went 78 states → 0, and the sweep learned to prune, shoot below the fold, and rebase its fixtures |
| **L** | The public-app hardening pass — thirteen items, 2026-09-16/17 | ✅ 31 boxes closed, 1 parked. Sessions, rate limits, a real-D1 harness, the door's eager graph, password-gated doors, security headers, nightly alerts, a restore door, the weekly stranger walk, the household timezone, Dependabot |

**One thread from §L is still waiting on time rather than on work:**

- [ ] **Enforce the Content-Security-Policy** (it ships report-only today). The door
      reported two blocked INLINE scripts on one run and none on the next — neither is
      ours, the edge injects them — so enforcing `script-src` now would break the
      marketing page intermittently while passing every local test. Read a week of
      `/api/csp-report` logs and the stranger walk's `csp-report-only.txt`
      attachments first, then decide: tighten the policy, or keep `script-src`
      permissive and enforce the rest.

### K. Towards a public app — the plan, written 2026-09-16 (start here)

**Marc: « a way towards being a public app soon ish (months away prob) ».** Decisions
taken the same day, which shape everything below: **no zoom, ever** — the layout must use
the space on every media type (§D); **signup stays invite-gated** until the last wave;
**email goes through Resend**, which Marc's portal project (`anthropicJoffre`, its
`backend/src/utils/emailService.ts`) already uses — an account exists, a Worker calls the
REST API with plain `fetch`, no SDK.

Six waves, in order. Each wave ends with the standing gates (typecheck · test · build ·
the matrix run · a PARITY row or a footnoted ➖ · STATE.md updated in the same commit).
The boxes below are OPEN WORK and count in §2's number; flip them with the commit that
settles them. A wave's findings get their own boxes under it when the wave starts.

**Wave 0 — the wide-screen pass. ✅ CLOSED 2026-09-16**, and the expectation going in was
wrong in the good direction: six surfaces already sat in a centred column or a sidebar
layout, and only three tabs stretched edge to edge. Marc's call was **HYBRID — width
where the shape earns it, a reading column where it does not, and centre the tab bar**,
applied as four surface-agnostic `@media (min-width: 1100px)` rules. The matrix grew
`TABLET` (820×1180) and `DESKTOP` (1440×900, surface `mobile` — a laptop operator, not
the wall) plus 17 states. One thing no 390px frame could ever have shown came out of it:
the board's « Faire » pill at **2.03:1** on a marigold member, which `tintInk()`
(`lib/routineTod`) now answers. Two things were seen and PARKED with the why (the ＋ FAB
over the fourth column; Maison's empty lower third, which is the fixture's size). The
five boxes and their measurements are in git.

**Wave 1 — the stranger's demo walk.** The demo is the product for months. Mint a sandbox
on production the way a stranger would — phone AND laptop, private window, no account —
and time the path from landing to the first useful thing. Log every hesitation as a box.

- [x] **Walked, twice, on production — by Playwright, as a stranger** (a scripted walk in
      the session scratchpad: landing → « Essayer pour vrai » → the six tabs → one list
      write → the ＋ sheet → `/garder`, on a 1440 laptop and an iPhone 13 profile, with a
      frame, a timer, the console and every failed request per step). The clock is not
      the problem: landing 0.4–0.8 s, mint → board 0.8–1.2 s, every tab under a second,
      the first write settled in 70 ms, on both profiles.
- [x] **The first walk could not get past the first screen.** After the mint, the stranger
      landed on `/board/habitudes` — « Le point du jour » — with the welcome dialog drawn
      over it, on both profiles, and no tab could be reached (the tour re-launched on
      every load and pulled the router back). Two shell automations both fire on a
      brand-new device: the tour auto-launch and the habit check-in's morning open (the
      seed puts habits on today; the habits payload lands after the tour has started, so
      its navigation wins). **Fixed `b2bc7ee6`**: the first day belongs to the welcome —
      a device that has not met the tour stamps the day and stands down, BEFORE the data
      gate. `first-run-quiet.spec.ts` replays production's shape (habits delayed 700 ms;
      an instant stub let the OLD code pass) plus a control that the morning open still
      opens once the tour is seen. In production for a month; nobody had minted a demo.
- [x] **Second walk, three more findings, two fixed the same day:**
      · the marketing page opened the household realtime socket with NO credential — a
        401 handshake every 2→30 s forever, the error in the visitor's console. The
        socket now follows the SESSION: `AuthProvider` connects on a confirmed sign-in
        (a sandbox included) and tears down on a confirmed sign-out; `main.tsx` connects
        at boot only for a paired tablet. `stranger-quiet.spec.ts` counts `/api/live`
        sockets on the signed-out door (0) with a signed-in control (≥1), proven red on
        the old unconditional boot line;
      · Réglages ▸ Découvrir greeted the fresh sandbox with « Quoi de neuf » about the
        Business → Commerces RENAME — news only to someone who knew the old name. A
        device with no history now starts with every current line marked seen (the next
        one shipped is the first it meets); same spec, with a control for a device that
        dismissed an older line;
      · the ❓ below.
- [~] **The first-ever undo toast hides the row you just added — ACCEPTED by Marc,
      2026-09-16: « they can close the toast ».** Once per device, the ✕ is right there,
      and the hint is worth its three lines the one time it shows. Declined, not deferred.
      Original note: on the phone, the first
      write's toast carries the once-per-device hint (« Tout se défait ici — tes derniers
      gestes restent dans « Récents » ») — three lines plus « Annuler », sitting over the
      top of the list, which is where the new row went. Once per device, by design, and
      the hint is worth having; the question is its PLACE, not its existence: fold the
      hint under the toast's expander, or shorten it to one line, or accept it. Marc's
      call — a design question, not a defect a test could hold.
- [ ] **Close the sweep loop the guard cannot**: the walks minted sandboxes on 2026-09-16
      (13:30–14:00 ET). On or after 2026-09-17 14:00 ET, mint once more and confirm in D1
      that the day-old ones are gone (`demoHousehold` sweep — unable to delete ANY
      sandbox since 0102 until 2026-09-16, and nobody noticed because nobody minted one).
- [~] **What the walk did NOT find, for the record:** the ＋ sheet, the claim form and
      Réglages all render and read well on the phone; the tab bar, the day-one tour and
      the sample banner's five « try this » doors all worked once the first screen was
      the board. No 4xx from the API on either profile.

**Wave 2 — a fresh household, a small phone, a slow connection.** Everything was tuned
against a SEEDED household on wifi.

- [x] **The fresh household was already photographed** — `board-fresh` and the five
      `first-*` states existed; what had not happened was LOOKING at them with the
      question. Looked (2026-09-16): the board's three-step welcome, the list's one line +
      « Voir le guide », the notes' dashed instruction, Maison's two doors and Découvrir
      all teach. The kitchen's fresh week is a column of empty day cards with no words —
      but its `SectionIntro` (pre-dismissed by the matrix, shown to a real first visit)
      carries the explanation, and the + on each day IS the affordance. Noted, not fixed.
- [x] **320px — fixed, and it was never the greeting's font.** The first 320px frames the
      matrix ever shot (`tiny-board/liste/kitchen/settings`, four new states) showed
      EVERY tab's title cut: « Bon apr », « La li… », « La c… ». The four-disc header
      cluster is a fixed 197px, leaving ~83px for the title. One rule in `today.css`:
      below 340px the section avatar — the last disc, decorative on every tab (the bar
      underneath names the section) and, in help mode, a door the « ? » bar's « Le guide »
      mirrors — is hidden. Mic, loupe and « ? » stay. « Bon après-midi » and « La liste »
      read whole at 320; at 360 nothing moves (the disc stays, the greeting takes two
      lines, which was already its rule).
- [x] **Cold start measured — and it hurts on a slow link.** Production, iPhone profile,
      cache cleared, CDP throttling:

      | link | door `/` first paint | door content | board first paint |
      | --- | --- | --- | --- |
      | Fast 4G (150 ms / 4 Mb/s) | 1.4 s | 1.7 s | 1.4 s |
      | Slow 4G (400 ms / 400 kb/s) | **11.2 s** | 13.2 s | 11.1 s |

      **Re-measured 2026-09-17, after §4-L L4 made the hub lazy** (same profile, same
      throttling, production):

      | link | door `/` first paint | door content | door requests |
      | --- | --- | --- | --- |
      | Fast 4G | 1.0 s | 1.3 s | 16 |
      | Slow 4G | **7.1 s** | 8.6 s | 17 |

      Seventy-eight requests became seventeen and the slow-link headline came four
      seconds sooner. The BOARD pays for it — 16.2 s to content on Slow 4G, because it
      now fetches the hub after the shell — and that is the trade taken with eyes open:
      the board sits behind a sign-in or a demo mint, and a kiosk has every chunk
      precached before it ever reboots. The door is the surface a stranger meets cold.

      The marketing door downloads **487 KB gzipped in 78 requests** — index.html
      modulepreloads the entry's whole static graph, 69 chunks, and the door pays for the
      board, the write/outbox layer, both i18n halves' shell, the QR code… A stranger at a
      school gate on a bad signal waits eleven seconds for a headline.
- [x] **The door's eager graph — CLOSED 2026-09-22, and the box itself had been half
      stale.** It asked to make `HubLayout` + `Board` lazy; they have been lazy since L4
      (2026-09-17), which is what the re-measured table above measures. What was genuinely
      left turned out to be one bad chunk and one blind guard, and they were the same
      thing: **the `drawpad` group had become Rolldown's shared-commons home — 141 KB,
      imported by ~180 chunks INCLUDING the entry**, so the door fetched perfect-freehand
      to render a headline, under a filename that read like the draw pad's own weight. (A
      previous session lost an hour lazy-loading `DrawPad` and measured nothing: the file
      it chased was 3 KB of the 141.) Deleting the group: **door 700 → 645 KB, 7 → 9
      chunks**, DrawPad back to its own 51 KB lazy chunk. And the guard could not see any
      of it, because `EAGER_CHUNKS` matched three FILENAMES: the three-name total is
      retired in favour of the closure the gate already walked, every closure member now
      has a cap (32 KB — a bigger eager chunk than that has leaked), and `DrawPad` is
      named as never-in-the-door now the group is not keeping it out as a side effect.
      Both new checks proven red by re-planting the group. **The production cold-start
      table is NOT re-measured**: this is −55 KB of the door's 700, bytes not a stopwatch.
- [x] **Install prompt — built, two doors, Marc's shape** (« maybe after account creation
      too »). `lib/install` keeps Chromium's `beforeinstallprompt` (preventDefault, so the
      browser's own mini-bar does not double the offer) and knows iOS Safari has none;
      `InstallHint` is ONE quiet line in two faces: the standing door stacked into
      Réglages ▸ Affichage & veille (words + « Installer » where a prompt exists, the
      share-sheet words on iOS, « déjà installé » once standalone, nothing where there is
      nothing to offer), and a one-time `.section-intro` card on the board that signup
      and `/garder` flag on THAT device — « Plus tard » is forever, an accepted install
      spends it too. Five e2e cases (`install-hint.spec.ts`: the button calls the
      browser's prompt, dismissal survives a reload, no flag → no card, the settings door,
      the iPhone face) and a matrix state (`board-install`). Original finding: none
      anywhere — no `beforeinstallprompt` handling, no
      iOS « Ajouter à l'écran d'accueil » hint (grep: zero hits in `src/`). Android shows
      its own mini-bar for a PWA that meets the criteria; iOS never does — a household on
      an iPhone will use the app in Safari with the address bar forever unless told. The
      calm answer is ONE quiet line, once, on the device that could install — in Réglages ▸
      Affichage & veille beside the screensaver (the sub that owns "what this device
      does"), not a banner on the board. Marc's call on whether it is worth a card.

**Wave 3 — password reset (the longest pole; start it the day Wave 0's fixes land).**
There is NO forgot-password flow and the app has never sent an email. The first stranger
who forgets their password is locked out forever.

- [ ] **Resend prerequisites (Marc, outside the repo)**: verify a sending domain in the
      Resend account (`babillard.marcportal.com` or `marcportal.com` — DKIM + SPF records
      on the Cloudflare zone; the portal project's `docs/deployment/EMAIL_SETUP.md` walks
      it). Free tier: 3 000/month, 100/day — plenty. Without a verified domain Resend only
      delivers to the account owner's own address, which is enough for local proof and
      nothing else. Then `wrangler secret put RESEND_API_KEY` + `MAIL_FROM` var.
- [x] **`functions/_lib/mail.ts` — built (2026-09-16).** `mailEnabled` needs BOTH settings;
      `sendMail` is one fetch to Resend, its failure named for the log. Four unit cases
      (`mail.test.ts`: off → no fetch, the exact request shape, a 403 surfaces). Original
      note: ONE `sendMail({to, subject, text, html})` seam over
      Resend's REST API (`POST https://api.resend.com/emails`, bearer key). An OPTIONAL
      binding like `AI`/`PHOTOS`/`REALTIME_HUB` (`_lib/env.ts`): key unset → the reset
      door HIDES on `/login` and the endpoints 503 — never a half-flow. Log the provider
      id on success, the body on failure (observability is on since §4-J).
- [x] **Migration 0133 `password_resets` — built, applied locally, EXEMPT in the sweep with
      its reason.** Original note: `token_hash` (SHA-256 of a random 32-byte
      token — the plaintext exists only in the email), `operator_email`, `expires_at`
      (30 min), `used_at`, `created_at`. A row, not a bare HMAC token, because
      SINGLE-USE needs a mark. No `household_id` → `EXEMPT_TABLES` with the reason (it is
      keyed by email; the sweep never meets it). Cap outstanding rows per email (3).
- [x] **Endpoints — built and PROBED on the local Worker with a real D1** (health says
      `mail:false`; forgot → 503 while mail is unset; reset with a bad token → the one 400
      sentence, with NO CSRF header, while a plain write without CSRF still gets 403 — the
      exemption is exact). `auth/forgot` and `auth/reset` in the TABLE, `CSRF_EXEMPT`,
      `SILENT_PATHS`, `write-rule` ALLOWED with the reason. Original note: `POST
      /api/auth/forgot` (CSRF-exempt like login; ALWAYS 200 whether
      the email exists or not — enumeration; rate-limited per email + per IP the way
      `demo.ts` bounds mints) and `POST /api/auth/reset` (token + new password,
      signup-grade validation from `auth/signup.ts`, marks `used_at`, rotates the session
      secret material for that operator if the scheme allows, signs the user in). Both
      in `worker/routes.ts`' TABLE, `SILENT_PATHS` in `_lib/realtime.ts`, `write-rule`
      ALLOWED with the reason (no outbox: replaying « send me a reset » offline is wrong).
- [x] **UI — built.** `/login` shows the door only when `health.mail` says the deployment
      can send (a door to a form that can only apologise is worse than none); `/oubli`
      answers the SAME sentence whatever the address; `/reinitialiser?t=` is password +
      confirm and lands on the board signed in; a missing, spent or expired link is one
      sentence and the way back. Both scenes wear /login's shell. Original note: « Mot de
      passe oublié ? » on `/login` → `/oubli` (an `EditField` for the
      email, one line of copy, the SAME success screen for any input) → the email's link
      lands on `/reinitialiser?t=` (password + confirm, then straight to `/board`). FR-CA
      first, EN parity, `.scene`/`FormScene` like `/signup`. Expired or used token: one
      calm sentence and the door back to `/oubli`.
- [x] **Guards + e2e — eight cases green** (`password-reset.spec.ts`: the door shown/hidden
      by `health.mail`, the constant sentence, the 503 face, no token, a spent link,
      mismatched passwords never leave the page, a good link lands on the board signed in).
      PARITY row F40 + footnotes 87–92, two ACTIONS doors + notes 23–24, roster 38 → 39.
      Original note: `e2e/password-reset.spec.ts` stubs `/api/auth/*`; a unit test
      pins hash-only storage, expiry, single use and the constant 200. PARITY row (F40,
      «Compte : mot de passe oublié»), ACTIONS doors (two, non-touch ✅).

**Wave 4 — a household can leave, and knows the terms.**

- [ ] **Self-serve deletion**: `DELETE /api/household` (operator-only, confirm by retyping
      the household name, `useConfirm` copy naming what is lost — everything, including
      the photos). It REUSES `deleteDemoHousehold` (`_lib/demoHousehold.ts`) — that
      function IS the whole-schema, R2-freeing delete, and it is correct again as of
      2026-09-16. Offer « Exporter d'abord » (takeout exists) on the same card.
- [ ] **Privacy policy + terms** — two real pages (`/confidentialite`, `/conditions`), FR
      and EN, linked from Home's footer and from Réglages ▸ Système. Say what is stored
      (D1 in Cloudflare's network, R2 photos, no third-party analytics), what the AI
      endpoints send to Workers AI, retention (sandbox 24 h; a deleted household is gone),
      and the deletion + export doors above. Québec Law 25 is the bar to write to.
- [ ] **Contact door** — one address (support@ on the sending domain) on both pages and
      in Réglages, so a stranger can reach a human.

**Wave 5 — bounds, then the gate opens.**

- [ ] **Per-sandbox limits**: a daily cap on Workers AI calls and on R2 upload bytes per
      sandbox household (today only the TTL + the mint cap bound them — fine for one
      household, not for a demo link posted anywhere).
- [ ] **Email verification on signup** through the same `sendMail` seam (a verified flag
      on `operators`; unverified accounts can use the app but cannot mint guest links or
      invite a co-operator — the two doors that reach OUTSIDE the household).
- [ ] **Open signup**: drop the invite code (`LOGIN_PASSWORD` doubling as invite in
      `auth/signup.ts`) — LAST, once Waves 3 and 4 are green in production. Announce
      nowhere yet; let the marketing page carry it.

**Parked, Marc's call, not code:** whether « L'autre parent » (F37) stays — it only
earns its keep if a second phone actually wants full rights; a partner who only touches
the wall is a member face. Retire it the way the calendars went if the second phone never
happens. See the 2026-09-16 conversation; re-raise after Wave 1's walk.

**Capacity, for the record:** ~100 households on the free tier with realtime on, then
Workers AI neurons are the ceiling, then Workers Paid at $5/month buys hundreds. Not a
blocker at any wave above.

### F. Not a backlog — do not mine these for work

The `bmad/` idea pools are gone with the folder (21 never-built ideas, plus the
lifestyle brainstorms — in git if ever wanted). What is left:
`PLAN-mots-and-lifecycle-followups.md` (12 designed features, A5/A6 recommended first).
All explicitly uncommitted. They are inspiration for a *deliberate* feature decision.

---

## 5. Process review — fresh eyes

### What is genuinely working

- **Invariants as tests.** The nine build-gating checks in §1 are the best thing in this
  repo. The calm tenet cannot drift in by accident because a test scans every migration
  for it. Guide deep-links cannot rot because a test walks all seven registries. This is
  the pattern that should absorb every other prose rule.
- **Comments carry the *why*, including rejected alternatives.** `widget-grid.css`
  documents the `dense` trade-off; `outbox.ts` explains why FIFO order is load-bearing;
  `mocks.ts` now records what `fresh` does *not* empty. Sessions land cold and stay
  oriented. Keep doing this.
- **Push-to-main with a fast gate.** ~2m20s CI, deploy on green, browser suite decoupled.
  Four commits shipped in a day with no rollback.
- **Verdicts are recorded, not just decisions.** `[~]` entries that say "reviewed, kept
  distinct, here's why" stop the same question being re-litigated. Underused, but right.

### What is not working

0. **A guard that has never been red proves nothing** — and this is not a slogan, it
   cost real work twice on 2026-08-27. `nested-interactive.test.ts` was written to catch
   a control-inside-a-control on the routines grid and **reported green over exactly that
   defect**: it walked JSX by indentation, and prettier breaks a multi-attribute open tag
   right after the tag name, so `<div` was the whole line and the "does the tag close
   here?" scan ended on the element's own first line. Re-counted by tag depth, it went red
   on the routines grid, on « Notre monde », and on a THIRD case in cook mode that no
   audit had reported. The same hour, `write-rule.test.ts` had been deliberately checked
   against a planted violation, and that habit is the only reason the difference was
   visible. **Every new guard gets run against the bug it was written for, before it is
   trusted.**

   The sibling lesson, same day: **three defects in my own new code were found by
   re-reading it cold, not by a red test** — an undo painted underneath the full-screen
   scene that offered it (z-index 90 vs 40), a payload key destructured wrong on a path
   nothing exercised, and a pull-to-refresh that froze a nested scroller under the thumb.
   Green tests said nothing about any of them. A review pass after the work is not
   ceremony.

1. **The ledgers rot faster than they are ticked, and nobody notices.** This session
   found **~13 stale findings** — work already shipped, boxes never ticked: Voyage's
   "ZERO e2e coverage" (18 cases existed), guest flows' "zero coverage" (4 specs), the
   routine step editor, `createBringList`'s silent failure, help-copy drift, the whole
   UNIFORMIZING Part-D "do this now while it's cheap" list (migrations 0086–0090 had
   shipped *days* after it was written), `DayNote`, the two-todo board question,
   `.board-wall`'s max-width, the masonry's `columns: 300px`. **Roughly a third of the
   work I picked up was already done.**
   *Cause:* a fix lands in the file that owns it, and the *other* document that also
   mentions it is never opened. `PARITY.md` already states the rule — "flip a cell in the
   same commit that resolves it" — and it is not followed across files.
   *Fix:* before starting any item, `grep` the claim in code. Before committing, `grep`
   the repo for other docs naming the same thing.

2. **Five overlapping backlogs, no ranking, no front door.** 6,144 lines of process docs
   against 141k lines of code — individually excellent, collectively unusable. The proof:
   this whole session began with the question "next steps?", which the repo could not
   answer for itself. *This file is the attempted fix; it only works if it is maintained.*

3. ~~**`- [ ]` means three different things.**~~ ✅ **fixed 2026-08-28.** It meant a real
   to-do, a template checklist item (`PARITY`, `ACTIONS`) and a recorded not-doing, so
   anyone counting got a number more than half wrong — 75 against a true 17. The 40
   template boxes are plain bullets now ("copy, don't tick"), the idea pools carry a ⚪
   banner instead, and the convention is stated canonically in §2 with a copy at the top
   of each live ledger. `- [ ]` now means exactly one thing, repo-wide.

4. **Audits are produced faster than they are acted on.** The friction audit generated 33 verified
   seams; none were approved; the document has stood as a permanent unfixed inventory for
   six weeks. The idea pools and PLAN-mots added ~45 more designed-but-unbuilt
   items. **Writing another audit right now would be the wrong move** — the constraint is
   decisions, not information.

5. **Prose rules drift; only tests hold.** The `useWrite` rule is stated forcefully in
   `CLAUDE.md`, and there are ~35 raw `api()` writes, one of which loses user data
   (§4-A). Compare: the CSS invariants have a test and have not drifted. **Every
   cross-cutting rule in `CLAUDE.md` worth enforcing should be asked: could a test hold
   this?** For `useWrite` the answer is plainly yes.

6. **My own scoping was too literal — twice.**
   - I fixed *"Réglages writes via `api()`"* exactly as written and never asked "is this
     rule broken elsewhere?" A 30-second grep would have surfaced `/share`'s data loss in
     wave 1 instead of during cleanup. **When a finding names a rule violation, sweep the
     rule, not the site.**
   - Wave 2 was mis-scoped before it began: I offered "the schema migration window" as a
     major option when every item in it had shipped two months earlier — because I built
     the *offer* from the documents and only verified once I started building. **Verify
     before offering, not just before building.**

7. **Effort went where the documents pointed, not where the harm is.** Waves 2–4 were
   valuable but low-stakes (class renames, doc reconciliation, test coverage, a11y).
   Meanwhile five tier-1 friction seams that block real household rituals sat untouched
   in the friction audit — because they were parked in a file the "next steps?" survey treated as
   settled. The ranking in §4 is the correction.

### The four changes worth making

1. ~~**Decide the friction audit's tier-1.**~~ ✅ **done** — all five closed (2026-08-27/28), and tier 2
   with them. The decision never needed to be a five-seam grouping: taken one at a time,
   verified in code first, five of the fourteen turned out to be already fixed.
2. **Turn the `useWrite` rule into a test** (`write-rule.test.ts` + allowlist), and fix
   `/share` as its first customer.
3. ~~**Adopt one checkbox convention**~~ ✅ **done 2026-08-28** — legend at the top of each
   live ledger, template boxes stripped from `PARITY`/`ACTIONS`, ⚪ banners on the three
   idea pools, and the canonical statement in §2.
4. **Maintain this file, and freeze new audit docs** until the existing pools are decided
   or deleted. ✅ **Partly done 2026-08-28**: the three *finished* ledgers moved to
   the archive (with a README saying why they're kept and not to mine them), so the
   root now holds ten files instead of thirteen and none of them is closed.
