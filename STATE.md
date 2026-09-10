# STATE.md — where Babillard is, what's left, and how we've been working

> **What this file is.** The single front door. Nine other root markdown files in this
> repo hold real, careful detail; none of them answers "what should I do next?", which
> is why that question has to be asked out loud every session. This file answers it, and
> points at the detail rather than repeating it.
>
> **Written 2026-08-27**, after a four-wave sweep (commits `8e526e3`, `e76bfe1`,
> `375856c`, `31598dd`). Everything below was verified against code or a command run
> that day — **not** read off another document. That distinction is the whole point:
> see [§5](#5-process-review--fresh-eyes).
>
> **Keep it living.** When a wave lands, update §1's numbers and §4's ranking here, in
> the same commit. If this file goes stale it becomes the fourteenth problem.

---

## 1. Snapshot

| | |
| --- | --- |
| **What it is** | A calm household command-center for a cheap always-on wall tablet. Single-page React app + one Cloudflare Worker (static assets + `/api/*`) + D1 + Workers AI + R2. FR-CA first. |
| **Code** | ~148k lines across 853 `.ts`/`.tsx` files (`src/`, `functions/`, `worker/`) |
| **Schema** | 123 forward-only migrations |
| **Tests** | 1987 unit tests in 156 files · 126 Playwright spec files |
| **Deploy** | Push to `main` → CI (typecheck · test · build · bundle budget) gates `db:migrate:prod` + `wrangler deploy`. E2E is decoupled (`workflow_run`), runs after a green CI, never blocks the ship. |
| **Households in production** | One (Marc's), plus per-visitor demo sandboxes |

### Health signals, all green as of 2026-08-27 (numbers re-run 2026-09-08)

- `npm run typecheck` · `npm test` (2062 in 163 files, 2026-09-09) · `npm run build` · `npm run knip` — green.
- `npm run check:bundle` — **3874 KB** of JS across `dist/assets`, **749 KB eager**; every
  chunk within budget; the SW precache covers all offline-needed chunks and correctly
  skips the online-only ones.
- Full local Playwright suite — **1128 passed, 13 skipped** *(that figure is still the
  2026-08-27 whole-suite run; since then only targeted subsets have been run locally —
  CI's E2E job is the standing whole-suite signal)*.
- Last four pushes: CI green, deployed. Working tree clean, nothing untracked.
- **Seventeen build-gating invariants** (this is the codebase's best feature — see §5):
  `calm-tenets.test.ts` (no streak/points/badge/push table, no inventory column),
  `field-fit.test.ts` + `keyboard-fit.test.ts` (CSS invariants), **`write-rule.test.ts`
  (every `/api/*` write goes through `useWrite`, added 2026-08-27)**,
  `helpRegistry.test.ts` + `discovery.test.ts` (no dead guide deep-links),
  `demoHousehold.test.ts` (a new table must join the sandbox sweep),
  `realtime.test.ts` (`PATH_KEYS` coverage), **`nested-interactive.test.ts` (no control
  inside a control, no `role="img"` on an interactive SVG — added 2026-08-27)**,
  `check-bundle.mjs` (size + precache), and **`ingredient-mirror.test.ts` (the client
  and server copies of `ingredientName` are the same code — added 2026-08-28)**, and
  **the birthday agreement table (`src/lib/cercle.test.ts`, added 2026-08-28 — the client
  and server `parseBirthday` must agree case-for-case)**, and **two added 2026-09-03:
  `intl-rule.test.ts` (`new Intl.*` construction only in the five cached formatter
  homes + a ratchet on `toLocale*String` — `/api/year` had burned 1.8 s of Worker CPU
  rebuilding formatters per day) and `write-owners.test.ts` (owned endpoints: only the
  owner module writes the flow, and every write carries the verified required
  affectedKeys — the leftover flow had re-grown four drifted copies, and an
  every-endpoint sweep found eleven more writes missing a surface's key, all fixed in
  the same commit)**, and **`layer-order.test.ts` (added 2026-09-04 — the fixed-overlay
  sandwich: every full-screen scene below `.scrim`/`.sheet`, every dialog that must
  interrupt an open sheet above it; it discovers new overlays itself rather than
  trusting a list)**, and **`chip-rule.test.ts` (added 2026-09-08 — the `.chip` class
  belongs to `Chip.tsx`; a hand-rolled one fails the build, and its detector is itself
  pinned against a fixture carrying the three near-misses that made the first version
  cry wolf)**, and **`settingsNav.test.ts` (added 2026-09-08 — the Réglages taxonomy is
  well-formed, every legacy fold points at a live pill, and NOTHING in `src/` or `e2e/`
  spells a retired pill; its e2e twins `settings-tree.spec.ts` / `kiosk-settings.spec.ts`
  prove the page agrees with the tree, for the operator and for a paired tablet)**, and
  **`guideBudget.test.ts` (added 2026-09-08 — the guide's concision budgets, listed in
  DISCOVERY.md as enforced for months with no test behind them: a card's one-liner
  ≤ 15 words and a point label ≤ 5 are hard, the rest ratchets down)**, and
  **`confirmCopy.test.ts` (added 2026-09-08 — a destructive dialog says what is lost:
  every `…Confirm` string, in both languages, is ≥ 6 words and carries a consequence)**,
  and **`devkitParity.test.ts` (added 2026-09-09 — a shared primitive is in `/dev/kit`
  or says why not; a gallery entry's file exists and exports what it advertises; and a
  component name may live in exactly ONE file, which is how the second `LoadError` and
  the second `MemberSwitcher` were found)**.
  `knip` now runs in CI too.

---

## 2. The document map

**Eleven** root `.md` files (`UNIFY.md` joined 2026-09-09; was thirteen before three finished ledgers moved to
`bmad/history/` on 2026-08-28). They are **not** interchangeable. Read this table
before opening any of them.

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
> least one session on the wrong work. `grep -rc -- "- [ ] " *.md bmad/*.md` is now
> a number you can trust. It reads **0** — again, as of the same evening: the last box,
> the till card, closed when it names and links its source now, which was the honest answer to
> « don't let a cashier refuse it ». What remains there are two ❓ (terms, licensing), not tasks.
> §4-G wrote nine on 2026-09-10 — the pass that opened all 100 state-matrix screenshots
> instead of sampling them — and all nine are settled: seven fixed, two dissolved once
> the code was actually read (the wall was never wasting width; the « ragged » grids
> stretch). It had
> read **0** for one day (2026-09-09), when `REVIEW-PASS.md`'s last finding closed and
> `PARITY.md`'s Wave D became a `[~]`. That zero was true and is worth keeping in view:
> the ledgers really are settled, and everything open now was found by LOOKING at the
> app rather than by mining a document. That number is **asserted from the boxes
> themselves** by `src/lib/docCounts.test.ts`, so this sentence can no longer drift the
> way `REVIEW-PASS.md`'s own banner did (it claimed 15 for twelve days against one box)
> — it went red within a minute of §4-G being written, which is how it should behave.
>
> **A written box is now the RARE case, not the backlog.** Most of what is worth doing
> still lives in judgement: the idea pools (`bmad/`), the parity matrix's own cells, a
> device pass, and the next sweep of screenshots. Read §4 before picking work.
> It was 75 before the
> convention, and 17 the moment the convention landed. Note what `[~]` may NOT be used for:
> a bullet that still lists "Still open: …" is open work, not a park — four were flipped back
> from `[~]` to `[ ]` on the day the convention shipped, for exactly that reason.

| File | Kind | Status |
| --- | --- | --- |
| **STATE.md** | ← you are here | The front door. Start here. |
| `UNIFY.md` | **Ledger + playbook** | ✅ **Closed 2026-09-09** — seven days, all boxes settled: one word, one mechanism, one door per idea. Now **reference**: the vocabulary census, the verb table, the parked verdicts (Part 4) and what the week changed (Part 5). `src/lib/glossary.ts` is its data and stays live. |
| `CLAUDE.md` | **Law** | Build-by-reuse rules, conventions, the primitive table. Read before writing code. |
| `REVIEW-PASS.md` | **Reference** | ✅ **Closed 2026-09-09 — 0 open** (31 → 29 → 20 → 15 → 4 → 1 → 0, every step a sweep that grepped each claim against code). Kept as the record of what was audited and decided. |
| `bmad/11-friction-audit.md` | Ledger | ✅ **CLOSED 2026-08-28** — tiers 1 and 2 fully resolved; tier 3 swept the same day (five re-checked, four stale). See §4-B. |
| `PARITY.md` | **Playbook** | The feature × dimension matrix + the canonical new-entity checklist. **0 open** — Wave D is a `[~]` standing policy (opportunistic convergence), not a task. Parts 5–6 are a template — copy, don't tick. |
| `ACTIONS.md` | **Playbook** | The action × door matrix. **No open items** — Part 5 is a template. |
| `PLAN-mots-and-lifecycle-followups.md` | ⚪ Idea pool | 12 designed-but-unbuilt features (A5–D2), never started. Not a backlog. |
| `bmad/05` + `bmad/06` | ⚪ Idea pools | Brainstorms. Nothing committed. Not a backlog. |
| `LEAN.md` · `DISCOVERY.md` · `COMPONENTS.md` · `OFFLINE.md` · `DEPLOY.md` | Reference | Consult when touching their concern. |
| `bmad/01`–`10` | History | Brief, PRD, architecture, shipped feature lines. Requirement tags (`NFR-*`, `PRD *`, `OD-*`) resolve here. |
| `bmad/history/` | **Archive** | ✅ Finished ledgers: `UNIFORMIZING.md`, `AUJOURDHUI.md`, `12-ui-polish-queue.md`. Verdicts only. **Do not mine for work.** Tags still resolve by name under `bmad/`. |

**The trap this table used to exist to stop is now fixed at the source.** `PARITY.md` +
`ACTIONS.md` contributed 40 unticked boxes that were templates; they are plain bullets
now, so the repo-wide count is honest for the first time.

---

## 3. What just shipped

### Both ways, and a week later (2026-09-10, night — the last four)

Marc: « what else could we do towards this » — and picked all four. Each shipped
with its guard red on a plant, in one commit:

**The way back: Flipp → Babillard.** The same bookmark, second answer. Leave the
paste box empty and OK — or say « Annuler » when it offers to paste — and it reads
Flipp's list and opens `<this Babillard>/liste#flipp=<base64url>`: a hash (never a
server log), OUR origin (no clipboard — we control the reader). `lib/flippImport`
plans what would change against the live list through the picks seam — a clipping
made IN Flipp becomes the deal on its matching line (`stageDeal`, never a duplicate
line), a typed item not here becomes a line (`ensureListLine`), anything CHECKED at
the store is checked here (a mark, never a logged buy) — and asks first, in words
that say the consequence: « Rapporter de Flipp sur ta liste ? 1 rabais accroché,
1 article ajouté, 1 coché — rien n'est retiré. » A guest gets nothing written and
nothing asked; the hash is consumed before the answer so a refresh cannot ask
twice. The bookmark now carries the household's origin (`flippBookmarklet(origin)`,
refused unless it is a plain origin — a quote there would be a bookmark that
breaks). `e2e/flipp-import.spec.ts` reads the WRITES: none before « Rapporter »,
none after « Annuler », then exactly the three; red on the plant (the answer
ignored → a write before it).

**A week later: refresh the ended deals on the till.** His list that night: every
staged deal from an earlier flyer, a grid of « Aubaine terminée », nothing to hold
up or send. One button — « 3 rabais terminés · chercher ceux de cette semaine » —
re-runs the auto-pick lookup for exactly those lines (`refreshEndedDeals` in
lib/picks: this week's best deal replaces the old one; a line with none is
UNSTAGED rather than kept as a week-old proof); the board refetch redraws the
tiles. Not for a guest. Red on the plant (the lookup found, nothing staged).

**One less paste.** The bookmark reads the clipboard first (`readText`, one
« Coller » permission tap on a phone): a Babillard list there → « Coller ta liste
Babillard dans Flipp ? » OK = paste, Annuler = the way back; anything else, or
no permission → the prompt as before. Twenty unit cases run the exact string:
both directions, both entries, refusals, the readable twin.

**The other phones.** The Réglages card gained « De Flipp vers Babillard » and a
folded « Autres chemins »: Android Chrome (a bookmark run by typing its name in
the address bar) and an iOS Shortcut (« Exécuter JavaScript sur la page web »
from the share sheet, for whoever would rather not edit a bookmark's address).
Longer card, still one screen's worth of steps; `lo-settings-liste-shop@360`.

Live contract re-run with the v2 body: 2/2 (the clipboard path rejects in a
headless context and falls to the prompt, as designed).

### « The flow end to end works, I have a list on my Flipp » — and then the words for it (2026-09-10, night, last)

Marc, iPhone, Flipp app installed, account made with « Connexion avec Google »:
bookmark installed in Safari, signed in on flipp.com, « Ma liste Flipp » tapped in
Babillard, the bookmark run and pasted — **« i have a list on my flipp app at the
end »**. That is the half no probe could exercise (a Google account has no Flipp
password; test 4 of the contract waits for a throwaway email one), confirmed by
the only channel that could: the phone. `joinLocalList` does what their code says.

Three things his run changed, each shipped tonight:

- **« i dont see the notice »** — the copy's confirmation was a toast that fires
  while the flipp.com window COVERS the page and dismisses itself before anyone
  comes back; a confirmation nobody can see. The paste had worked. The word now
  lives under the row and stays (« Liste copiée ✓ — dans Safari, sur flipp.com,
  lance le signet… »), with an honest « le téléphone a refusé la copie » branch.
- **« make it a separate action »** — copying was the list door's side effect.
  Now **« Copier pour Flipp »** (primary) is its own button and **« Ma liste
  Flipp »** only opens their list; the tap-by-tap « Ajouter à Flipp · n de N »
  loop wraps under them at 390px. A side effect nobody sees is one nobody trusts.
- **« can we reinforce and explain, a full step by step »** — one text, three
  doors: the Réglages card (liste ▸ Magasinage ▸ « Ma liste Flipp ») is now two
  numbered phases, **« Une seule fois »** (copy the bookmark — the button sits at
  step 1 — Safari, add bookmark, edit its address, sign in) and **« À chaque
  épicerie »** (Copier pour Flipp → Signets → coller → the Flipp app), plus one
  line on what Flipp receives; a point on the « Rabais » guide card says the same;
  and a « Comment ça marche » chip under the till's confirmation deep-links to
  the card (`?tab=liste&focus=flipp`). No 33rd guide card; the point rides `deals`.

Earlier the same evening, from the same phone: every deal on his list had ended,
so the loop was empty — and the row still offered « Reprendre du début », a
restart of nothing (`fd2fdb6`: no loop → no restart; the list door alone, still
carrying the whole list as typed items).

Guards: `cashier.spec.ts` 16/16 (the copy button, the persistent line, the
all-ended state, the how-it-works chip's href); `flippList.test.ts` 14 on the
bookmarklet string; contract 3/3 live; `lo-settings-liste-shop@360` on the
longer card; `operatorHelpCoverage`, `discovery`, `guideLinks`, `docCounts` green.

### From the iPhone: an ended deal is a dead door — and the WHOLE list goes to Flipp now (2026-09-10, night, later)

Marc, with the Flipp app installed and an account made, from the phone: his third
pick — mini-concombres, Provigo — opened Flipp's « This item is expired. You have
been redirected to the relevant store flyers » onto a « Circulaires de Undefined à
Montsainthilaire » page with zero flyers. A dead screen, held up to a cashier: the
exact thing the postal rule was written against, from the other side. The deal had
been staged from last week's flyer and sat on the list past its `validTo`.

**The till now reads the fact the list row already knew.** `dealEnded` (lib/deals —
the validTo DAY fully past, the « ! » on the row) drives the till too: an ended
pick's tile dims and says « Aubaine terminée »; its card swaps the dates for that
word and drops « Montrer Flipp » (a page that redirects to nothing is not a door);
it is out of the Flipp loop and out of the paste as a clipping. « Voir la
circulaire » stays — the in-app reconstruction degrades to « Circulaire
indisponible » on its own, which is honest. Guard: `cashier.spec.ts` « an ended
deal… » + the loop counts (« 1 de 3 » with four picks, one ended); red on the
plant (filter removed → the door came back, the count read 4). And the spec's own
fixture had been carrying `validTo: 2026-06-30` on every deal since June — read as
ENDED on every surface once the calendar passed it, silently; it rides `flyerIso`
now, with one deal ended on purpose.

**« so I have my full list exported in my flipp app »** — the paste carries the
whole list now, not the deals. Flipp's storage has two kinds of thing, both read
from their bundle: a clipping (`SLFlyerItemClipping`) and a typed line
(`SLListItem`: `{ id, term, checked }`, unique by term, their id `<term, spaces
stripped>-<uuid>`, "clobbered by the server on save"). A row with a LIVE clipping
goes as the clipping; every other unchecked row — plain, its deal ended, its store
hidden at the till — goes as a typed item under their « Ma liste ». Checked rows
stay home. `flippListPayload(picks, terms)`, the bookmarklet merges both (typed
items deduped case-insensitively against theirs, never edited), `mergeFlippList`
twin, `CashierPage` hands the till its rows. **Proven live:** test 2 of the
contract now pastes a typed « Oeufs Babillard » beside three stores' clippings on
flipp.com's real list page, and it renders. Unit test: 14 cases on the exact string.

**Seen on the phone, stated in the setup steps:** from Babillard installed as an
app, a link opens in an in-app browser window (the screenshot's chrome) that has
no bookmarks — the bookmark runs in Safari/Chrome proper; the copied list is
system-wide, so the paste works there. Step 3 says so now, FR + EN.

**Still Marc's:** the sign-in half (test 4 of the contract). His account turned out
to be a « Connexion avec Google » one — no Flipp password, and Google refuses a
headless OAuth popup — so that half is exercised BY HAND on the phone (bookmark in
Safari, signed in, then the Flipp app), and test 4 waits for a throwaway
email + password account as repository secrets.

### The Flipp contract, checked against the real site every week (2026-09-10, late night)

Everything « Ma liste Flipp » rests on lives on flipp.com and is documented nowhere:
the storage shape `localSave()` writes, the bare `/liste_dachats` route, the item
page's postal rule, whether our bookmark string still renders there. A comment
saying so would stay green for months after it stopped being true — the exact
drift the build guards exist to stop, except that no grep of OUR code can see it.
So a harness goes and looks. `e2e/flipp-live.spec.ts` under `e2e/flipp.config.ts`
(`npm run e2e:flipp`): no Vite, no stubs, a real Chromium on the real site, one
worker, one retry, never per-push. CI twin: Actions ▸ « Flipp live contract »,
dispatch + Mondays 07:00 UTC, an hour after the State matrix.

Four tests, three green tonight: **1** a real « Ajouter à la liste » still stores
the shape our payload writes (theirs ⊇ ours, key by key; `price` a string; a
mismatch PRINTS their dump so the fix is a re-read, not a guess); **2** the exact
bookmarklet string renders a three-store payload on their real list page — stores
named, photos counted, storage still the local shape; **3** the routes hold — and
the first run corrected ME: the item page without a postal errors only in a FRESH
browser; once any page has been opened with one, flipp.com remembers it
(`location_info`) and the bare URL renders. The check now runs first, and the
comment in lib/deals is still right for the case that matters (a phone that has
never been to flipp.com). **4** — the sign-in merge, the half that reaches the
phone app — skips itself without `FLIPP_EMAIL` + `FLIPP_PASSWORD`. It is written
against the `/signin` form (email, password, the two consent boxes) and asserts
what `joinLocalList` promises: after sign-in the stored list is a server proxy
that still carries our ids, a write hit the accounts server, the stores render.
Marc is creating a throwaway account for it; as repository secrets it runs weekly,
locally it runs with the two variables set for one command. Never a household's
real account.

### « Any way to populate the localstorage with what they want? » — yes: a bookmark that runs on flipp.com (2026-09-10, late night)

The previous entry said Flipp's list cannot be pre-filled from outside. True as far
as it went — and Marc's follow-up found the edge of "outside". Their web list is a
`shopping_list` object in flipp.com's localStorage, written by `ShoppingList.
localSave()` and read back on every load. Our origin cannot touch it; **a bookmarklet
runs on theirs.** Read out of their bundle (saved, 4.2 MB, six chunks):

- the stored shape — `flyerItemClippings[]` of `SLFlyerItemClipping` (`id:
  "item-clipping-<flyerItemId>"`, name, flyerId, box, `price` as a STRING, merchant
  id/name/logo, thumbnail, validTo) plus `listItems`, `photos`, `ecomItems`,
  `_outstandingOps`, `_delegate`;
- `_outstandingOps` is NOT restored from storage (the constructor resets it), so
  seeding sync ops is pointless — but **`joinLocalList`** is: when a user is signed
  in and the stored list is LOCAL (`_delegate: false`), the list page itself runs
  `createAllItemOps(localList)` and merges every local clipping into the account
  list. That is the path Flipp wrote for "added while logged out, then signed in",
  and it is how the phone APP receives what the bookmark wrote. We call no API of
  theirs and hold no token (theirs live in `flipp-user`/`flipp-login` cookies; we
  never read them);
- the list route is `/liste_dachats` BARE — `/fr-ca/liste_dachats` is a marketing
  shell that shows the flyers home with a list badge, which is exactly why the door
  shipped wrong for an hour (`c0983b4` fixed it); the real route ignores every URL
  parameter tried, re-tested on the right page this time;
- the three `message` listeners are a setImmediate polyfill, an embed-analytics
  handshake, and OAuth popups: nothing writes the list from a message.

**Shipped.** `lib/flippList.ts`: `flippListPayload(picks)` (their clipping shape,
one per pick with a Flipp id — `/api/deals` now also keeps `merchant_id` and the box,
optional so older staged deals still clip) and `FLIPP_BOOKMARKLET` — ES5, self-
contained, refuses anything that is not a `{v:1, clippings}` payload, merges into a
local list (dedupe by flyer item; their typed items untouched), replaces a server
proxy list with a local one so Flipp merges it on load, then goes to
`/liste_dachats`. « Ma liste Flipp » on the till grid now COPIES the payload as it
opens their list (notice: « Rabais copiés — sur Flipp, lance le signet… »); Réglages
▸ La liste ▸ Magasinage gained the one-time « Ma liste Flipp » card (device-level:
three steps, « Copier le signet », the address read-only). React refuses
`javascript:` hrefs, rightly, so it is text to copy, never a link.

**Proven live, not assumed.** The exact string lifted from the source file between
its markers, run on flipp.com's real list page with three live deals from three
stores (Adonis, Metro, Super C), `prompt` stubbed: « MA LISTE » rendered all three
with their clipping photos, badge 3 (`flipp-bookmarklet-result.png` in the session
scratchpad). The sign-in merge is READ from their code, not exercised — that half is
Marc's to try with his Flipp account.

Guards: `src/lib/flippList.test.ts` runs the bookmarklet STRING against a fake page
(merge, dedupe, proxy replacement, refusal of every non-payload, agreement with its
readable twin `mergeFlippList`, ES5-only); `cashier.spec.ts` reads the clipboard
back after « Ma liste Flipp » (Chromium grants it) and sees the notice.
`operatorHelpCoverage` holds the new section's « ? ». Fragility, stated: their
storage schema is private; a change breaks this into an EMPTY list, never a broken
page, and the bookmark writes nothing it did not build itself.

### « Any way to pre-create the list and show it from Flipp? » — no, and here is the loop instead (2026-09-10, night)

Marc, after the card shipped: Flipp lets you add items to a list — can Babillard fill
that list and then show Flipp's list at the till? Probed in a real browser, not docs
(Flipp's help centre 403s every fetcher; the Zendesk API and a headless Chromium
answered). **Three facts, each closing a door:**

- **flipp.com's « Ajouter à la liste » is client-side.** No login, and NO request —
  it writes a `shopping_list` key into flipp.com's own localStorage (the payload
  carries the item's name, price, flyer box, merchant logo, validity: everything
  the page then renders). Another origin; nothing we ship can write it.
- **The list page reads no URL parameter.** `/fr-ca/liste_dachats` with `?items=`,
  `?clippings=`, `?flyer_item_id=`, `?item=` in a fresh profile: empty every time.
- **The app's list is account-synced behind the undocumented backend**, and
  « Partager ma liste » is a one-time invite that MERGES two Flipp accounts'
  lists — receiver accepts; there is no outside-in path. Deep links: iOS registers
  only `/action` (its bundle reads one param, `sourceAction`); Android's
  `assetlinks.json` claims ALL flipp.com URLs, so « Montrer Flipp » may already
  open inside the app there.

**What CAN be made easy is the loop through Flipp's own button.** The till grid now
carries one row above the tiles: **« Ajouter à Flipp · 1 de 4 »** opens the NEXT
pick's Flipp item page (their « Ajouter à la liste » is right there; come back, the
label reads « 2 de 4 »), and **« Ma liste Flipp »** opens `/fr-ca/liste_dachats` —
Flipp's own list, grouped by store with price and dates, which is the screen Marc
wanted to hold up. Where the loop stands is a device-local bookmark
(`lib/flippClipped.ts`, `createDeviceStore`): a clipping lives in the browser that
made it, so the wall has nothing to show for a phone's loop. It is a bookmark, not
a score — « Reprendre du début » clears it — and the whole row needs the same
postal code the item page needs. Marc picked this shape himself (« 1, 3. anything
automatic or easier ») once the probe had ruled the automatic version out.

**Looked at, then trimmed.** The first cut stacked two full-size buttons and an
instruction line above the grid — ~150px before the first tile on a surface that
is SCANNED at a till. Shorter labels, the reset's compact button size, and no hint
(the page the step opens carries the next instruction itself) put both doors on one
line at 390px; read on the phone and wall screenshots before shipping.

Guards: `e2e/cashier.spec.ts` +2 — the step's exact href, the popup advancing it,
the bookmark surviving a reload, the done state (list door leads, restart works);
the no-postal case now also asserts the row is absent. Red on the plant (a tap
that never bookmarks: « 1 de 4 » stayed « 1 de 4 »). `ACTIONS.md` gained the till's
three link-out doors — « Montrer Flipp » had shipped without a row.

### The till card wears the shape a cashier already knows (2026-09-10, night)

Marc, after « Montrer Flipp » shipped: « make sure it looks 90% like flipp ui ». The
card had every FACT the item page shows; it had them in its own order, with the
photo beside the text on a wall and the source line up top. A cashier who has seen
Flipp's item page a hundred times reads by shape before reading a word, so the card
now follows that page's composition, verified in a real browser with a live item:
**small store logo first, then the clipping on a pale block, then the name, then
the big price with the unit price and the « avant » line under it, then the filled
+ outlined action pair, then « prix pour … », the dates, and the provenance as fine
print at the foot.** Left-aligned throughout, as the page is. `CashierMode.tsx` was
reordered to that reading order; `.bigcard*` in `cashier.css` rewritten around it
(the picture is a fixed-height pale band, the price `clamp(40px, 9vw, 56px)`, the
two buttons an `.btn--primary` beside a plain `.btn` in a `Cluster`). On a wall
≥ 760px the media and the facts still sit side by side — that is the page's own
tablet layout too.

**The 10% left out is on purpose and was said so at the time: Flipp's palette and
wordmark.** The card keeps Babillard's marigold and paper. It is recognisably the
same kind of screen; it is not pretending to be the same screen — the real one is
one tap away on the row beneath, and that is the honest version of the argument.

**❓ #3 of the till box is closed by this.** The fixture deal now carries a logo and
a product picture (two inline SVG data URIs in `e2e/mocks.ts`, so the matrix stays
offline), and `cashier-peek` has been photographed for the first time looking like
an ad rather than a receipt: SUPER C · 🥛 on the pale block · Lait 2% 4L · 4,99 $ ·
1,25 $/L avant 6,49 $ · « Montrer Flipp » filled beside « Voir la circulaire » ·
8 sept. au 14 sept. · « Circulaire Super C · via Flipp ↗ ». Read, not assumed.

**CI's E2E then failed five tests on this commit, and it was the fixture, not the
card.** Giving the staged « Lait » deal its clipping flipped that list row into the
product's OTHER shape — a row with a clipping shows the picture as a ZOOM (named by
its alt) and moves « Modifier » to press-and-hold / ⚙ Avancé — which
`row-labels`, `sheet-pricematch` ×2 and `list-item-sheet` ×2 had never seen:
each clicked the first row's picture as the edit door. Corrected to say what the
product does (`button.list-row__img`; the labelled door checked on « Pain »), not
reverted: the till card's photo is the honest fixture, and the row shape it exposed
had been un-photographed since the compact-rows pass.

Guards unchanged and still red-tested from the two commits before: `cashier.spec.ts`
(the item URL's exact shape; no door without a postal), `cashier-peek` +
`cashier-flyer` in the matrix. Nothing about behaviour moved — this is order and
shape only — so no new guard: a guard on "the logo precedes the photo" would pin a
layout, and layouts here are pinned by looking (LEAN.md's rule), not by DOM order.

### Two things the phone found that 142 screenshots could not (2026-09-10, late)

Marc, mid-session, from the device: « we lost the ability to see the recipe directly
in La cuisine when tapping a meal » and « drag n dropping a snack no longer works ».
Both true as experienced, neither what it first looked like — and each took a full
trace to place on the right surface.

**The recipe tap was missing on the DAY SCENE, not the week grid.** The grid's row
already went straight to the recipe (`kitchen-meal-plan.spec.ts` pins it). The day
scene — `/kitchen/day/:date`, THE day door since « Moments » retired on 2026-09-02 —
made a meal tap an in-place RENAME and hid the recipe behind a small 📖. Structural
reason it never took the shared `useOpenMeal` resolver: that route sits OUTSIDE
`HubLayout`, hence outside `DetailProvider`, so the meal peek cannot open there at
all. Now: a linked meal's row opens its recipe (the grid's tested contract — one
door, the row; the 📖 is gone), a free-text meal still renames in place (nothing else
to show), and « Modifier » for a linked meal moved into the row's ⋯ under the word the
tap used to carry. `e2e/day-meal-tap.spec.ts` holds all three; red on the plant.

**The snack never dragged on the week grid — and the same commit made it look like
it should.** `9a1c48f` ("side meals render as full tap-to-recipe rows") gave side
meals the supper row's exact look and set them `draggable: false` by its own comment.
Rows that look identical where only one moves is a promise the layout makes and the
gesture breaks. A side meal now drags to another day AS ITSELF (`meal:date:slot:id`,
lands in its own slot); the supper headline keeps its older meaning (the day's whole
plan, keyed by date). `e2e/grid-side-meal-drag.spec.ts` reads both from the WRITE —
`id: 'meal4', slot: 'breakfast'` — not the screen; red on the plant.

**Two of my own mistakes on the way, kept because they are the recurring shape:**
a `head`-truncated grep that read « no `touch-action: none` on `.dnd-grip` » — the
rule exists (kitchen.css:361); a cut-off listing read as an absence, and I nearly
built on it. And the drag-key regex landed as `(d+)` — the backslash eaten by a
template literal, the very trap `docCounts` fell into this morning — and the new
spec caught it on its first run (the Crêpes row sat `[active]` with no write behind
it). The day-scene row's `hasText` locator also stopped resolving once the row became
an input: a title as a VALUE is invisible to text matching.

**What the sweep could not see, stated plainly.** Both defects are about what a TAP
or a HOLD does. A screenshot shows neither. 142 states, 0 failing, throughout.

### « Montrer Flipp » (2026-09-10, evening)

Marc wanted a cashier never to refuse the app « just because it's not one of the
three », and rejected my first answer — hand them Flipp's flyer page — because on that
page you still hunt for the item. So the real question was whether Flipp has a public
**item** page. It does, and nothing on the web said so: `flipp.com` refuses non-browser
fetchers with a generic error page, which is why every earlier probe read as "no such
route". A real headless browser with a live id settled it: `flipp.com/fr-ca/item/{id}
?postal_code=…` renders Flipp's own proof — logo, clipping, name, price, validity,
format — on the item. The till card's primary door opens that. The accepted channel,
already where a cashier needs it, and the card underneath it still names its source.

The probe fixed three facts, each a guard now: `/flyer_item/…` is a 404; `en-ca` broke
(fr-ca is pinned); and without a postal code the page errors — so the door is simply
not built without one. We already held the id (`deal.id` is Flipp's `flyer_item_id`),
and the live payload carries the merchant logo and clipping URLs the fixture nulls.

**Two device findings from Marc arrived while this shipped**, queued next: tapping a
meal in La cuisine no longer opens its recipe directly, and dragging a snack no
longer works. Neither is visible in any of the 142 screenshots — the device pass
finding what the sweep structurally cannot.

### The till card argues its own case (2026-09-10)

Marc named the apps Maxi honours for « prix imbattable » — Flipp, reebee, Glouton —
and did not want a cashier refusing his app for not being one of them, since it shows
the same ad from the same source. Two rounds to land it. My first answer — make the
official Flipp page one tap away — he pushed back on, correctly: on the official page
you still have to FIND the item, which is the exact friction this app exists to remove.
So the card stays primary, and instead it **names and links its source**:
« Circulaire Super C · via Flipp ↗ ». The apps a till trusts are trusted for what they
show; saying where the ad comes from is the honest form of that argument, where
styling the card to read as one of them would be the dishonest one — and the one that
fails the moment a cashier looks closely.

**« Voir la circulaire » now opens on the item, circled.** The ring was a marigold
box; it is an ellipse drawn on a pseudo-element, around the clipping rather than
rounding it (a border-radius on the item would clip the product photo). The item
also clips its overflow, so the marked one must not — the first render cut the ring
off. Two matrix states photograph the flow now (`cashier-peek`, `cashier-flyer`):
the one screen in this app whose job is to be read by someone else, across a counter,
had never been in the sweep.

**And the flow was lying in two places that only a photograph shows.** `FlyerViewer`
kept a local `money` printing **$4.99** under a French UI while the card one tap back
said « 4,99 $ » — `lib/deals` had unified the DATE formatter "for every deal surface"
and left money behind. And the `flyer` detail fixture hard-coded June ISO strings
(untouched by the epoch rebase), so the header said June over a September card. Both
now share one source: `money` from lib/deals, dates from `flyerIso`.

### The screen a cashier reads (2026-09-10)

Marc named the apps Maxi honours for « prix imbattable » — **Flipp**, **reebee**,
**Glouton** — and asked for a phone UI as presentable as theirs. The trap in that ask,
worth writing down: those apps are accepted for what they SHOW (the retailer's own
unaltered flyer, from a source the store recognizes), not for how they are styled.
Copying the look confers nothing. What transfers is the evidence set, and the one-tap
path to the ad.

**Ours was missing two pieces of that set, and one of them the component's own
docstring claimed it had.** `CashierMode`'s peek promised « store, picture, BIG price,
unit price, dates » and rendered the unit price nowhere — while the unit price is
exactly what a match turns on, since the sizes rarely agree. And validity showed only
« jusqu'au X », half of what makes an ad current; `FlyerViewer`'s header already
computed the full span, under a comment reading « This is the date the cashier checks;
reebee shows it but our reconstruction dropped it ». The span formatter moved to
`lib/deals` so both surfaces share one (`dealValidity`), and the peek now reads:
store · what it matches · product + size · big price · unit price · « 8 sept. au
14 sept. » · « Voir la circulaire ». An AI-INFERRED size wears the same ≈ `DealCard`
gives it — at a till, a number we guessed must not present itself as printed fact.

**The sweep had never opened it.** `cashier` photographed the GRID, which is only how
you pick which deal is being scanned; the peek — the one screen in this app whose whole
job is to be read by someone ELSE, across a counter — was outside the matrix. It is a
state now.

**And the fixture staged the proof card with none of its proof**: `validFrom` and
`validTo` were both null on the staged deal, so every photograph of that surface showed
an ad with no dates. Fixed — and the same pass found the deals-SEARCH copies passing an
epoch NUMBER where `validTo` is declared `string | null`, which `new Date()` reads as
milliseconds: « jusqu'au 21 janv. », 1970. Untyped fixture literals, so tsc never saw
it. Both now ride `flyerIso`, the live-clock helper the flyer fixtures already used.

### Reading the 39 new twins, the last two findings, and one scanner to share (2026-09-10)

**The twins earned their place immediately.** Two more real defects out of the 39, and
both were invisible at 390px in French:

- **The recipe book collapsed to ONE column at 360px** — a 300px-tall thumb, one and a
  half recipes on screen where 390 shows four. The grid is 290px wide there and two
  150px columns plus the gap need 312.8; the BASE rule's 140px floor missed by 2.8px
  too. Floor is 132px now (columns come out ~138px at 360 — wider than the 140 the base
  rule asks for at 390, so nothing is narrower than designed).
- **`first-kitchen` still showed the fixture's June week** while the board beside it
  said September: the `fresh` branch built its empty meals payload from the module
  constant, discarding the matrix's rebase. It reads `DATA[path]` now — the same
  override-aware source the generic fresh branch already used. The two-weeks-on-one-
  screen bug, hiding one branch further down.

**The last two §4-G findings — one real, one wrong.**

- **The pantry's square tick is now the app's round disc**, and it was never only
  cosmetic: `.act .check` carries a 44px hit area (AUJOURDHUI §5's touch-target fix)
  that CheckRow's bare glyph never had, on the surface a parent taps mid-recipe. *The
  first attempt made it a bare `.check` and broke a third surface*: `TodoSection` writes
  the same class and had never been inside an `.act`, so the class was inert there — the
  moment it went global its empty circles became bare ✓ glyphs. Caught in the next
  screenshot. The hosts are named now.
- **Maison ▸ Routines was never wasting the wall.** Measured: three columns of 318px
  across 986px. The fixture simply has one routine per moment bucket, and each bucket
  renders its own grid. Parked, so the next reader of that PNG doesn't re-find it.

**And one scanner, shared and tested.** Three guards walked a wrong shape this session
alone — `nested-interactive`'s old indentation walk (green over its own defect),
`tour-rule`'s literal-only attribute scan (three phantom orphans), and `docCounts`'
comma split that read 29 where the truth was 39. The two shapes that keep recurring
now live once in `buildGuardScan`: `openTags` (brace-aware, because attribute values
hold arrow functions and whole JSX subtrees) and `arrayStrings` (comments blanked
first). `buildGuardScan.test.ts` pins both against the exact traps — **and caught a
real bug in `openTags` on its first run**: `<Chip` matched `<ChipGroup`, so a container
counted as one of the things it contains. That is the whole argument for the file.

### The sweep had one language and one width (2026-09-10)

100 states: **99 French, 1 English**, all but nine at 390px, **none at 360**. And its
single English state is what caught the truncated greeting — which, once measured, was
cut in FRENCH too, at a width the sweep never shot. One language and one width is not a
lens; it is a blind spot with a screenshot in front of it.

The states whose chrome is built out of WORDS — the six tabs, the sub-tab rows, the
empty states, the forms, the ＋ sheet, and the two scenes whose headers carry a date and
controls — now get two more shots each: **EN at 390, and FR at 360**. 100 → 140 states,
3.5 min. The twins carry `noBudgetWhy` rather than a budget, and the reason is stated:
a ratchet is pinned at one width in one language, so holding a twin to it would ratchet
the wrong screen. A renamed state throws instead of silently dropping its twins — the
exact way this coverage would rot back to 99:1.

**Two real finds from the new lenses, and the second fix was wrong twice before it was
right.**

- **Maison's view switch lost a segment at 360.** « Arbre » sat entirely off-screen with
  no cue, because `.subtabs { flex: 1 }` made the segmented control the only thing that
  shrank while the loupe and « Notre monde » shared its row. *Attempt 1 — chevrons —
  made it WORSE*: `SubTabs` suppresses them on `mini` for a stated reason, and turning
  them on cost ~72px of a 320px line, leaving ONE segment visible where two had been.
  Reverted. *Attempt 2 — let the control size to its content so the extras wrap —
  then cost 43px at 390px*, and `contentTopPx` went red within a minute (417 against a
  411 budget). Scoped below 380px it is right: at 360 you pay a line and see all three
  segments; at 390 nothing moves. The ratchet refused a bad trade twice; that is the
  job.
- **Réglages stranded its « ↗ »** on a line of its own at 360 — a lone control under an
  otherwise full row. The « ? » and « Voir dans l'app » are one group now: either both
  sit beside the lens toggle or both drop together.

**And a third suspicion that dissolved.** The EN Réglages tab looked like it rendered a
missing-glyph box before « Discover ». Probed the DOM: byte-identical SVG in both
languages — the pill was clipped at the rail's left edge. Sixth of the day, against
nine that were real.

### Two design changes, one real defect — and four findings that were WRONG (2026-09-10)

The rest of §4-G, and the honest ratio: of the five items left, two were worth
building, one was a real defect, and **four of the "smaller" five did not survive
contact with the code**.

**The routine builder folds its per-card aids.** Four controls (minuterie · truc ·
voix · photo) under EVERY card wrapped to three rows each at 390px, so a four-step
routine opened as twelve rows of things you are not doing. One quiet summary line per
card now, single-open — the whole routine fits on one screen with its footer. The
half worth testing is the invariant, not the fold: a card that CARRIES an aid renders
its row open and shows no summary at all, because a fold in front of a filled field is
how a household loses what it set. `routine-tips.spec.ts` learned the new door in the
same commit — the path a parent takes moved, so the spec that drives it moved with it.

**Toddler « Les notes » is picture-first at last.** It promised « Touche l'image » and
then drew the same document glyph on every tile, so a pre-reader could tell two notes
apart only by a word they cannot read. A picture now comes from the first source that
knows one: the note's OWN drawing or photo, else `pictoFor` on the title and then the
body (the list rows' own map — « Garderie » → 🏫, « la marque de lait » → 🥛), else the
kind glyph in the author's tint. Its guard holds all three tiers *and* that four tiles
never share one picture: "they all render something" is not "you can tell them apart".

**The drawings wall's pin covered the author.** `.drawgallery__item` is the positioned
ancestor and it is taller than the drawing, so a `bottom`-anchored overlay lands on the
credit line — measured, the pin's box (x 21–45) sat on the author's face and the first
letters of their name (x 16–59). Its own comment claimed it "mirrors the delete
corner"; the two corners were never mirrors. Both overlays are on the picture now.

**And the part worth remembering: four of the five smaller findings were wrong**, each
because the code already had a reason a screenshot cannot show.

| Photographed as | What the code said |
| --- | --- |
| an empty list offers 3 inert controls | 🔍 browses the FLYERS, ⚡ restocks past items (the most useful thing on an empty list), ⚙ is a device pref; aisle sort — the one that depends on contents — is already gated on `list.length > 1` |
| tile grids don't stretch | they do: measured 196/196 (`jouer`), 197×4 (`recettes`). A third tile alone in its row is what a grid does |
| quickadd's discs are near-invisible | `.aisle-pip.is-auto` is dashed at 0.75 on purpose — « an untouched (auto-guessed) aisle stays quiet » |
| the ideas drawer strands its ⚙ | deliberate, and commented: right-aligned on its own line because it is the only door back to ✏️/🗑 |

Four of nine findings from the sweep needed code to settle them. That ratio is not an
argument against sweeping — every one of the five REAL findings was invisible to every
assertion in the suite. It is an argument for the rule this repo already has: a cell is
a verdict from a moment; grep it before you build on it.

### Three things that were wrong on a real phone — and the sweep's own honesty (2026-09-10)

The first four of §4-G's nine, plus the fixture fix that makes the next pass
trustworthy. Every guard below was **proven red before being trusted**, and two of
them went red on THIS work rather than on history.

**The greeting was cut in both languages, not one.** The matrix photographed
« Good afterno… » at 390px; measuring found FR cut at 360 and 320 too, and EN at
390/360/320 — the sweep only shoots 390, so only the EN half was ever visible.
`.greet` had `clamp(16px, 4.4vw, 32px)`, added 2026-07-14 for this same bug in FR.
A `vw` clamp is a GUESS at the room; the room is knowable, because the header's
right-hand cluster is a fixed 197px, so `.app-head__main` *is* the title's room
(118px at 390, 88px at 360, measured). It now sizes off that container with `cqw`
and may take a second line when one truly will not do — whole on two lines beats cut
on one. 320px keeps the one-line ellipsis deliberately: below ~76px of room FR breaks
« après-midi » at its own hyphen onto three lines, which is the 2026-07-14 complaint.
`e2e/greet-fit.spec.ts` holds both languages at 360/390/430.

*The first plant of that guard PASSED, and the reason is worth keeping*: planting
`white-space: nowrap` beside the new `text-wrap: balance` does nothing, because
`text-wrap` is part of the `white-space` shorthand family and reset it. A plant that
does not reproduce the defect proves nothing. Re-planted from git — the true
pre-change CSS — it went red on exactly the three measured cases.

**« Maisonnée » had an invisible glyph in light theme.** All three everyone-avatars
inherit `color: #fff`, right over a member's coloured disc and wrong over the
everyone-disc's `--paper-deep`, which is PAPER in light theme. It only ever read when
the face was selected (the accent tints it) or the theme was dark — and the mobile
chip had no background rule at all, so it was white on the white card. Caught by
comparing the day and night screenshots of the same state, which is the whole reason
that pair exists.

**The birthday year clipped its own placeholder** on the person, pet AND intake
forms — one shared row, `flex: 0 0 6.5rem`, i.e. 104px for a placeholder needing
109px. `CLAUDE.md` names the fixed flex-basis as the trap by name. It is a container
query now. **The guard caught a regression the fix was about to ship**: a size
container stops contributing its contents to its own intrinsic width, and while the
person form's grid gives the row a definite width, the pet form's `.operator__inline-form`
is a WRAPPING FLEX — the row collapsed to 0px wide. A full-line basis fixes it, and
without the guard that would have shipped as "the year field is gone".

**And the sweep now rebases the two week-shaped fixtures onto its own clock.**
`voiture-day` had been photographing two different weeks on one screen — header
« 6–12 sept. » (the pinned clock) over rows « 8 juin », « 9 juin » (the fixture) — and
the meal week labelled the fixture's Sunday « AUJ. » on a Thursday. Matrix-local, never
the shared mocks (126 specs freeze at `BASE` and want it). The kitchen now reads
« AUJ. JEU 10 » beside the board's « jeu. 10 sept. », and the weekend tint finally
lands on the weekend. That immediately exposed a budget measured against a screen the
app never shows: `.voiture__presence` (« À la maison : Maman, Léa, Noah ») renders only
when NOW falls inside the week shown, so 189 → **220px**, re-baselined deliberately —
the same discovery as day-plan's missing weather strip, found the same way.

**One word for one idea, settled by Marc: « Maisonnée ».** Four surfaces pass an
`allLabel` to the same face picker and three spelled it differently — « Tout le
monde » (Voyage), « Toute la maisonnée » (the habit form) — and in EN the board itself
said "Everyone" while every other EN surface said "Household". One word per language
now; the dead `cercle.everyone` key is gone; the rival is declared on the glossary term
with `RIVAL_CEILING` floors of 2, because « Tout le monde est là » is a sentence about
the car and « Tout le monde (lien ouvert) » is a link that really is for anyone.

### The « ? » was eating the nav it sat in (2026-09-10)

Asked for as "a third lean pass on Maison", and the measurement said the surface's
problem was not the one the eye reports. Maison ▸ Famille at 390px: the four stacked
control rows are **188px of controls** and the first person sits at 374px — most of
the rest is inter-row margin and the group header, and this codebase is *deliberately*
generous with whitespace, so compressing that rhythm is not a lean pass, it is just a
tighter app. The two earlier passes (2026-08-26/27) had already taken the 168px that
was really chrome.

What WAS broken was horizontal, and no screenshot says it out loud — you have to
measure: the section pill row is a `useHScroll` scroller **189px wide holding 456px of
pills**, because two chevrons and the « ? » take 116px of the 320px line. The tab's
PRIMARY navigation was showing about 40% of itself.

`HubHead` has carried an `action` slot since it was written, documented as « e.g. the
in-place help-mode "?" toggle » — Board and La liste use it. La cuisine and Maison,
the two tabs with sub-tabs, spent it on the nav row instead. Moved both into the head:
**189 → 234px of nav (+24%)**, three pills visible where there was one and two halves,
nothing removed, no earlier decision reversed, and the two remaining tabs now agree
with the other four. `contentTopPx` is unchanged (374 / 382) — this was never vertical.

And the « ? » bar itself, now that it is on seven surfaces: its one centred sentence
was dropping « fait. » alone onto line two on every tab at 390px. `text-wrap: balance`
(the call `.kit-h` and the hub heads already make). The centring stays — that is a
stated decision in `help.css`, not an accident.

### Réglages' « ? » reached five cards that said nothing (2026-09-10)

Found by putting help mode into the state matrix and then LOOKING at the picture:
under an armed « ? », « Rendez-vous » had no tap affordance while « Année scolaire »,
one card below it, had one.

`OperatorSection`'s `helpKey` does two jobs — the help-registry key AND the `?focus=`
anchor id — and it renders a `HelpTitle` only when `help` AND `helpKey` are both
passed. Ten cards passed `helpKey` alone. **Four are right to**: `aisleOrder`,
`health`, `takeout` and `claimTablet` each carry an always-on `hint` that already IS
the explanation, and a bubble repeating it is the always-on-hint smell LEAN.md names
(`buildInfo` — « Version » + « Dernière mise à jour » — explains itself). **Five were
not**, and they are the most-used cards in Réglages: « Rendez-vous », « La maisonnée »,
« Tablettes jumelées », « Corvées », « Routines (mode enfant) ». Each now has bilingual
copy pointing at the guide card + point that was already written for it (`set-agenda`,
`set-household`, `set-devices`, `set-chores`, `routines`).

Nobody could SEE this before 2026-09-09 — Réglages had no « ? » to arm, so the whole
registry was unreachable. The fix that made it reachable is what exposed what it
didn't reach.

**Two guards, both proven red first.** `src/lib/operatorHelpCoverage.test.ts` reads the
JSX: a `helpKey` either names an entry AND gets `help`, or is listed `ANCHOR_ONLY`
with its reason — so "not written yet" stops looking exactly like "anchor on purpose",
the same ambiguity `COMPONENTS.md` carried until `*(no specimen: …)*`. Its tag walk is
brace-aware and pinned against a fixture tag holding `onClick={() => …}` and a nested
`<button>`, because the naive slice-to-first-`>` passes that file and lies — the
`nested-interactive` lesson, fifth entry. And an e2e case reads the SCREEN
(`tour-nav.spec.ts`): arm the « ? », tap « Rendez-vous », get a bubble. Planted
defects: `help=` removed → the JSX guard reds; an ANCHOR_ONLY reason deleted → the
second reds; the brace-aware walk replaced by the naive one → the parser fixture reds;
`help=` removed → the e2e reds.

**And `docCounts.test.ts` caught me.** The matrix commit an hour earlier grew the sweep
80 → 88 entries / 92 → 100 states, and LEAN.md quotes both. It went red on `main` and
was fixed forward inside the hour. Working exactly as designed — that number is derived
precisely because a typed one drifts.

### The state matrix measured itself against the wall clock (2026-09-10)

The sweep whose numbers are RATCHETS was reading them off whatever o'clock someone
happened to run it. It went red this morning on `day-plan` / `day-plan-wall` — 269px
of chrome against a 244px budget — and nothing had changed in the day scene. « Le fil
du jour » drops its « maintenant » marker BETWEEN what is behind you and what is ahead
(`Fil.tsx`, `nowIndex`), so it sits ABOVE the first row until the fixture's 9 h event
has passed and BELOW it after: a 25px swing on the hour. The 244 was baselined after
9 h; the run started at 8 h 47.

This file already recorded the ZONE half of that same trap (2026-09-08: CI's UTC
runner asked for YESTERDAY, so the day scene rendered with no weather strip and a
budget got baselined against a screen the app never shows). The HOUR half was still
open, and it was never only the day scene — every daypart-, greeting- and
« bientôt »-sensitive state in the table carried it, unmeasured.

**One fixed wall time for the whole sweep** — 13 h 20 on TODAY's date, so every
`TODAY_MIDNIGHT`-relative fixture still lands on today, and mid-afternoon rather than
either edge of the fixture's day. `day-plan` now measures a deterministic **234px**;
no budget was re-baselined (244 already sits tighter than the +10% formula would give).
100 states, 0 failing.

**And the sweep had never armed help mode.** `grep -n help e2e/state-matrix.spec.ts`
returned nothing, so the « ? » — including the bar that 2026-09-09 put on all six hub
tabs and on Réglages, and Réglages' 34 `operatorHelp` entries that had been unreachable
for as long as the registry existed — has never been in a picture. Eight `help-*` states
now: the six tabs, Maison's two (its bar takes the SECTION's card, so routines and the
cercle are different bars), Réglages' lens-row bar, and the wall. Each asserts
`.help-hint` is visible — without that, a state where the toggle stops arming
photographs the ordinary page and passes, which is the blank-capture failure this suite
already refuses in two other forms.

### The DevKit parity audit (2026-09-09) — the gallery rule had quietly stopped being true

Marc's queued task: audit `/dev/kit` ↔ code **both ways**. The standing rule in
`CLAUDE.md` — "a new primitive that isn't in the gallery is invisible to the next
session and will get re-invented" — was prose with nothing behind it, and both
directions had drifted.

**Direction 1 (gallery → code) came back clean**, but only on the second pass: the
first scan reported `AskSheet` and `GlossaryTermMark` as gallery-only orphans, because
it followed `from '…'` and not `import('…')`. Both are lazy-loaded. *A scan that walks
the wrong shape reports the wrong thing with total confidence* — the fourth time this
file records that, and the reason nothing here was "fixed" on that first reading.

**Direction 2 (code → gallery) is where the rot was.** `COMPONENTS.md`'s primitive
table sat under a heading that said « gallery-suitable »: 140 rows, 91 with a live
specimen, and **no way to tell an oversight from a deliberate exemption** — so both
kinds accumulated silently for months. What that hid:

- **Eight primitives `CLAUDE.md` itself tells you to reach for had no specimen** —
  `FormScene` (10 importers across 4 areas; the law names it for any typing surface),
  `Loading`/`PairPrompt`, `TopBar`, `HelpDot` (while its neighbour `HelpBubble` was in),
  `SectionIntro`, `SwipeDeletePane`, `DocUploadButton`, `DrawPad`. All eight added.
- **`LoadError` existed TWICE** — `components/Fallback.tsx` and `components/LoadError.tsx`,
  same name, same job, told apart only by which module a page imported. They had drifted:
  the Fallback copy kept an error TONE while the device was merely offline and offered no
  « Réessayer » — the exact two behaviours the other was written to refuse (2026-08-27/28,
  from Marc's phone, after « clicking from the yearly calendar into a month, then nothing
  loads »). **Six surfaces were still on the wrong one**: Maison, Les notes, Notre monde,
  the kitchen's history tab + ideas drawer, and « Cette semaine ». All six migrated, each
  given the retry door; the losing copy is gone. `THIS_WEEK_KEY` has no poll, so on that
  one the button was the only door there was.
- **`MemberSwitcher` was declared twice too** — found by the new guard on its first run.
  `board/chrome.tsx` exported a four-line board wrapper under the primitive's name, which
  forced that file to import the real one aliased: inside `board/`, `FaceSwitcher` meant
  the shared component and `MemberSwitcher` meant the wrapper, the reverse of everywhere
  else. The wrapper is now `TodayFaceRow` (it renders the « Aujourd'hui » face row).
- **The gallery had two names for one category** — « Champs & saisie » beside « Saisie »,
  stranding two entries in a section of their own. Folded.

**The guard: `src/lib/devkitParity.test.ts`.** A primitive row either has a specimen or
ends with `*(no specimen: <reason>)*`; every entry's `file` exists; every name an entry
advertises is exported by a file it cites; no component name lives in two files; one name
per category. The 41 rows that legitimately can't have a specimen now say so, in three
words that cover almost all of them — *a route, not a primitive* · *needs live household
data* · *a seam, not a component*. `docCounts.test.ts` now asserts the two numbers the
doc quotes, and caught a stale one within a minute of being written.

**The follow-ups, worked the same day.** The audit's own leads, each grepped before
being believed — and two of the six turned out to be non-findings, which is the point
of checking:

- **`ProfilePicker` was a hand-copy of `FaceSelect`'s sheet** — the same `Sheet`, the
  same `.profile-faces` grid, the same everyone tile, the same 250 ms beat; FaceSelect's
  own comment said « mirrors ProfilePicker », a fork admitting what it is. They had
  already drifted: only the chip marked a waiting-mot dot on a face other than the shown
  one. Extracted to **`FaceSheet`**; ProfilePicker is now the fetch + the `useProfile`
  binding, which is the only part that was ever its own. Same shape as the
  `MemberSwitcher` fork — a controlled primitive plus an identity-bound sibling that
  re-implements instead of wrapping. 212 e2e cases over that DOM, unchanged and green.
- **`Loading` vs `Skeleton` is NOT two mechanisms for one idea** — `Skeleton.tsx`'s own
  header carries the rule ("a skeleton is a promise about shape… which is why both still
  exist"). But the rule lived only there, and it wasn't being applied: the routines
  overview and the kitchen history tab are section BODIES under an already-painted tab
  bar — exactly where a centred line jumps — and both were on `<Loading/>`. Converted.
  The other sites were re-checked and are correct (a whole scene replaces its own
  SceneHead, so a body skeleton there promises a shape that isn't coming). The rule is
  now in `CLAUDE.md`'s reach-for table, where someone choosing actually looks.
- **The two `comboOptions.tsx` files are not a duplication** — same filename, different
  domains, each already "the one place they agree" for its own entities. Recorded so it
  isn't re-litigated.
- **Three components were in NEITHER list** — `CarnetDocs` (shared cercle ↔ voyage, a
  real cross-section primitive), `MealPlanPicker`, `useAiWake`. All three documented;
  the first two got specimens.
- **The doc's taxonomy claim was false.** It said the primitive table was "categorised as
  the gallery is": 5 role sections against 10 gallery categories. The real mapping is
  written down now, and the guard holds it closed in both directions — a new category
  must join the table, and a retired one must leave it. That is the exact route
  « Champs & saisie » took in beside « Saisie ».
- **The gallery grew a fourth axis: « Données : Réelles | Exemple ».** The audit had
  excused ~20 components with *needs live household data* — and those are the ones most
  worth looking at across theme × lens × locale, so the excuse was the problem. While the
  switch is on, every `/api/*` GET answers from `e2e/mocks.ts`'s `ROUTES` (borrowed, not
  re-invented — a parallel fixture set would drift, which is what this whole audit was
  about) and writes go nowhere. It compiles out of production behind
  `import.meta.env.DEV`; the proof is that `grep "Clinique dentaire Sourire" dist/assets`
  finds nothing while the string does exist in the fixtures. **Two of my own excuses were
  simply wrong**: `DayNote` and `ActivityBring` take props and always did. Four board
  cards now have specimens (those two, plus `DepartureCard` and `ARegler` through the
  switch), and **`e2e/devkit.spec.ts` expands every specimen and fails on a `pageerror`** —
  until now a broken specimen only surfaced when a human happened to open it, and read as
  "this primitive is broken" rather than "the demo is".

**And then the gallery was actually LOOKED at** — the second half of the same pass, and
the half that only became possible once the fixture switch existed. Eleven more rows got
specimens (`SimpleBoard`, `ToddlerBoard`, « Mois », « L'année », the routines overview,
`NotesKidView`, `MotsCard`, `SampleBanner`, `WelcomeCard`, « Le savais-tu ? », « Quoi de
neuf »), taking the table to **117 of 144 rows with a live specimen**. Then screenshots at
390px, day and night, per LEAN.md's rule — *look, don't reason* — and looking found four
things reasoning had not:

- **`MotsCard` and « À régler » were still empty with the switch ON.** Both fixtures are
  deliberately empty upstream, and for a good reason: a mot or a friction signal makes a
  board card appear, so a populated default would put them into every board screenshot
  the suite takes. The gallery's need is the exact opposite of a calm screenshot, so it
  layers `GALLERY_ONLY` overrides on top — the same move `help.spec.ts` already makes
  per-test. The e2e defaults keep their meaning.
- **A fabricated fixture crashed the whole gallery.** The invented `a-regler` kind fell
  through `frictionRow`'s five-way switch, which has no default, so it returned undefined
  and the caller read `.text` off it. Worth carrying beyond the fixture: **the same would
  happen if the server ever emitted a `FrictionKind` this client doesn't ship yet.**
- **The `ToddlerBoard` specimen was 5206px tall**, nearly all of it empty, with every
  later entry stranded behind that scroll. Whole-page lenses now render in a bounded
  `.devkit__lens` window.
- **My own banner ran seven lines at 390px** and pushed every card off the screen — on a
  page whose entire point is the cards. One line now. The lean rule applies to the
  developer tools too.

**And the state matrix was re-run against all of it** (93 states): 0 failures, 0 page
errors, 0 bleed, and its own ratchet reported « nothing new to look at » — so the
`LoadError` and `Skeleton` conversions cost no chrome anywhere.

> **The lesson, again, and it was mine this time.** All six assertions were proven red
> against planted violations — but the *first* prover reported all six "green" while
> actually crashing vitest at startup on a `--reporter=basic` that doesn't exist in
> vitest 4. It printed six confident greens over a harness that never ran a test. The
> prover now refuses to return a verdict from a run whose output has no `Test Files`
> line. Plant the bug, watch it go red — **and check that "red" came from the test.**

### The UNIFY week (2026-09-09) — one word, one mechanism, one door per idea

Seven days, eight commits, closed in [`UNIFY.md`](./UNIFY.md) (read Part 5 for the table
and Part 4 for what was deliberately *not* done). The short version:

- **Vocabulary is now data.** `src/lib/glossary.ts` holds **25** terms; `glossary.test.ts`
  ratchets every rival synonym so a second word for an existing idea cannot come back.
  The delete family went from six verbs — with one key spelled two ways — to five, each
  with an assigned meaning (`effacer` erases a **mark you made**, never a thing).
- **The English copy stopped being the neglected half.** Marc settled the two open naming
  questions on 2026-09-09: `mot` → *Message*, `rendez-vous` → *Appointment*. FR had been
  clean for days while EN still said "Event" in **17** places, because every ratchet was
  FR-only — the English side of « one word per idea » was documented and unenforced. Both
  are now declared rivals, and declaring the first ASCII one immediately exposed three
  latent weaknesses in the guard itself (a substring matcher that would have counted
  "eventually", a quote-scan that paired across newlines, and a scan that cannot tell an
  asserted label from a spec's own test title). All three fixed; see `UNIFY.md` Part 3.
- **Five delete mechanisms became four.** `lib/undoRemove.ts` is gone; its sites moved to
  `useDeferredRemoval`. Two of them were splicing **polled** query keys, which is the
  resurrection bug this repo had already fixed twice and was still latent in.
- **Four entities became fixable where you see them** (corvée, projet maison, routine,
  habitude) instead of only in Réglages or only inside their own editor.
- **Every form scene has help**, and the in-app lexicon (`[[mot:id|label]]`) pops a term's
  definition where the word stands — Réglages/Comprendre only, so a daily user pays
  nothing for it.
- **The returning user has a way back**: `SectionIntro`'s "seen" flag is replayable from
  Découvrir. It used to mean both "don't nag me" and "past onboarding", with no undo.
- **Doc numbers are derived, not typed.** `docCounts.test.ts` now asserts guide cards,
  tours, registries, glossary size, the matrix's size, and each ledger's own headline
  count against the code. `REVIEW-PASS.md` had claimed "15 findings still open" for twelve
  days against **one** box.
- **Zero chrome cost**: the closing 92-state matrix diffed against the Day-1 baseline with
  **no `contentTopPx` change anywhere**.

> **The one lesson to carry out of the week.** Five guards were written; **five times the
> first draft was green for the wrong reason** — a helper that had silently destroyed 98 %
> of every French file it scanned (so the breadcrumb rule saw *zero* crumbs and passed), a
> census that read 6 then 20 before reading the true 14, a tour rule that invented three
> orphans, a nesting rule that ended its walk on an element's own first line, and a matrix
> parser that anchored on `Entry[]`'s brackets and confidently reported an empty array.
> None of them threw. **Plant the bug, watch the guard go red, then trust it** — this is
> now the house rule in `CLAUDE.md`, and it earned its place four separate times this week.

### 2026-08-27 — four waves

Four waves, each its own commit, all green, no rollbacks.

1. **Correctness** (`8e526e3`) — 9 fixes. The screensaver's wake tap never re-armed the
   idle cycle (`stopPropagation()` by design, so it never reached the window listener) →
   new `lib/idleHold.ts`; voice capture now holds off the screensaver; the day-part drift
   never restarted when enabled mid-session; **one permanently-refused write blocked the
   entire offline outbox forever, silently** → bounded attempts + dead-letter
   (`replayVerdict`, unit-tested); the pending-write count was invisible when
   `navigator.onLine` lied; two Réglages writes migrated to `useWrite`.
2. **Uniformization** (`e76bfe1`) — `FamilyBuilder`'s bespoke segmented control →
   `SubTabs` (its "deliberately different" note was simply wrong); `.cercle-share*` →
   `.sharesheet*`. Two rejections recorded with reasoning instead of churn.
3. **E2E** (`375856c`) — 26 cases over 5 real gaps: the routine countdown, the cook-mode
   stepper, board empty-cards, the toddler board, « À apporter ».
4. **Board a11y + polish** (`31598dd`) — every board card is now a **named region**
   (a bare `<section>` is not a landmark, so the whole board reached assistive tech as
   one undifferentiated run); a width sweep at 320/568/667/1600/2560; and `RealtimeHub`
   moved to the **WebSocket Hibernation API** (a wall tablet never closes its tab, so the
   old in-memory socket set billed continuous wall-clock per household for an idle hub).

**Roughly a third of what those waves picked up was already done and never ticked** — see §5.

### The second half of the day — the polish queue and the top-10

Ten more commits, same shape. `bmad/12` is now **empty** (and archived to `bmad/history/`): #10 elevation tokens, #11 focus
rings, #8 night contrast, #1 Skeleton, #6 EmptyState doors, #13 PWA theming, #14 the 360px
heading ramp, #16 Ctrl+Z, #17 pull-to-refresh, #18 hold-the-＋-and-speak, #25 note age,
#26 the stale-link toast. Alongside it, six of the ten ranked seams: the list-item peek,
guest-submit idempotency, the mots broom, « À régler » snooze (**migration 0122**), the
a11y nesting fixes, the voice-mot transcript (**0123**), and mid-cook « Il en manque ».

**Four of the ten were already shipped** — the empty « Ce soir » door, the inline supper
quick-add, the NoteEditor keyboard binding, and most of the list row. Verified in code
first, which is the §5 lesson working a second time. See the note now standing at the top
of `bmad/11`'s tier-2 table.

**Three defects were found by re-reading my own work rather than by a red test**, and they
are the useful part of this entry:

- The **undo I offered from cook mode was painted under it** — the scene is z-index 90,
  the undo bar 40. An undo nobody could tap. It became a toggle on the button itself,
  which is both reachable and calmer.
- Its un-flag **destructured `items` from a payload whose key is `low`.** Nothing
  exercised the path, so nothing said so.
- **Pull-to-refresh swallowed a nested scroller's drag**: a capped list (Réglages' review
  queue) stopped moving under the thumb, because the hook only asked whether the PAGE was
  at its top.

And one guard **reported green over the very defect it was written for** (an indentation
walk where a tag-depth walk was needed). Re-checked against the bug, it found a THIRD
nested interactive nobody had reported, in cook mode. A guard that has never been red
proves nothing — that rule earned its keep twice in one day.

---

## 3-bis. What shipped since this file last spoke (2026-09-04 → 09-08)

**Eighteen commits landed between `3c9b903` and here without STATE.md moving** — the
exact rot §5-1 warns about, in this file's own §"Keep it living" rule. Recorded now,
grouped, with the verdict rather than the diff.

**The wave (Sep 4–6, sixteen commits), all CI-green and deployed.** Its through-line
is *a door should land on the thing, and a row should spend its width on what it
names*:

- **Doors land ON the thing** (`57117ed`): a board card's door used to open the page
  that contains the thing; it now opens the thing (`?item=`/`?date=` landings, with
  `ACTIONS.md` + `DISCOVERY.md` updated in the same commit — the rule this repo keeps
  asking for). `ae23074` made « Aujourd'hui » show the day itself instead of three
  buttons, and `6872992` let a meal with **no recipe** be cooked at all (its « Cuisiner »
  had been recipe-only, so a free-text supper was a dead end).
- **Rows spend width on content**: notes rows (`07a003a`), the board mini-card naming as
  many things as fit instead of assuming two (`18c8a1c`), « Préparer le repas » back to a
  row that NAMES the dish (`1b614f2`).
- **Phone-width fixes**: the three-door header at 320px (`31aea09`) and Réglages' recipe-tag
  rows (`be08820`) — that one also fixed the SWEEP that should have caught it, which is
  the better half of the commit.
- **One feature**: a recipe **étiquette can declare which meals it belongs to**
  (`a5c165f`) — « déjeuner » stops being offered for supper. Extends F15, no new entity.
- Plus: a 401 offering the pairing door instead of crashing the board (`4f5a81c`), the
  tour painting BEHIND the ＋ sheet it explains (`0c34723`), `/api/meal-staples` removed
  as dead (`f87100a`), one drag-and-drop vocabulary with page-scroll-while-holding
  (`f008f05`), and a deal preview no longer writing the product name twice (`589e94f`).

**2026-09-08 — the DevKit ↔ code audit Marc queued on 09-03** (`0a33180`), run in both
directions. The finding was not a stale gallery entry but a **primitive that could only
say one thing**: `Chip` knew "toggle", so 10 action chips that HAD gone through it
announced *toggle button, not pressed* for ever, and 18 more sites had forked the
`.chip` class precisely because the primitive could not say what they were. Chip grew
the four missing shapes (action · link · static · expander), the 18 converged, and
**`chip-rule.test.ts`** now fails the build on the next hand-rolled one (proven red on a
planted violation first). Also found: a habit's **picto was TYPED** into a 2-character
text field (now `EmojiField` — a wall tablet may have no emoji keyboard at all), the
DevKit **DragPill specimen wore classes deleted in `04068e9`**, three stale claims in
`COMPONENTS.md` (the « Mois » density toggle, ToddlerCookBook's printable half,
`pages/Cercle.tsx`), and three shared kitchen seams named in no document. What the audit
did NOT find matters too: nothing lives only by the gallery, and all 23 « In DevKit »
claims are true. The memory-queued guard idea — *every component imported by 2+ pages
must appear in DevKit* — is **rejected**: it would fire on ~50 page orchestrators the
gallery excludes on purpose.

**2026-09-08 — the visual sweep** (`cdde27d`), `npm run e2e:matrix` + a diff against
Monday's CI artifact. Two states red, and the cause was **the harness, not the wave**:
three specs computed midnight in **Node's** zone while all four Playwright configs pin
the browser to `America/Toronto`, so on CI (UTC) the day scene asked for YESTERDAY — CI
screenshotted « Dimanche 6 » on a Monday, the weather strip never rendered, and the
entry's 228px chrome budget had been baselined against a screen the app never shows.
`localDayStart` replaces all three hand-rolled midnights; the budget is re-baselined at
244px on the real screen. Two more, found by looking: the notes fixture had **no
authors**, so both lenses painted every note the same teal and the review called the
tint seen — and with authors seeded, the **toddler lens showed three identical pictures**
(a hard-coded teal), which now follows the same `author_member_id → colour` rule the
parent row uses. And **« Quoi de neuf » had skipped the whole wave** (`lib/whatsNew.ts`
carries that discipline in its own header): three entries added.

---

## 3-ter. Réglages, 28 → 14 pills — and the taxonomy that survives the next one (2026-09-08)

Marc's step-4 answers, recorded: **meal-done is declined** (the supper hero is a plan,
not a tracker — don't re-propose without a new observation); the cashier's second
✓ and the staples chips are **won't-do** (both `[~]` in bmad/11); the queue after
this is settings write coverage, then PARITY Wave D. And a new ask: « far too many
tabs in Réglages — agglomerate », with the aggressive option chosen (28 → 14) and
one condition — *make sure it survives another refactor easily (hints, tools, guides,
concepts)*.

**The model, not the merge, is the deliverable.** `lib/settingsNav.ts` is now the ONE
map: `SETTINGS_TREE` — tab → pill → section cards, each card with an `access`
(`device` / `household` / `operator`). A **section is the stable thing**, a pill is
packaging. Everything derives: the pill ids and order, the `?focus=` anchors, the
guest and kiosk narrowing (no allowlist — `visibleSubs`/`visibleSections` read the
access), the pill labels (`SUB_LABEL_KEY`), and `subOfFocus`, which lets a link name
just the section and have the pill follow it. `settingsHref({ tab, focus })` is how
src spells a settings link now (10 sites converted); the guide's 38 « Régler » links
name their section; retired ids fold forward-only (`LEGACY_TAB` moved beside
`LEGACY_SUB`). Moving a card next time is one line in the tree plus one in
LEGACY_SUB — and then four guards say what else to touch: `settingsNav.test.ts`
(tree well-formed, legacy targets live, **nothing in src/ or e2e/ spells a retired
pill**), `guideLinks.test.ts` (a link into a stacked pill names its card, and the
sub it spells is the card's), `e2e/settings-tree.spec.ts` (every tree key mints its
`#op-<key>` card, in tree order, and `?focus=` alone reaches it), and
`e2e/settings-aliases.spec.ts` (every retired id still lands — walked from the data).

**Proven red before trusted, all four:** a planted retired literal, a planted
focus-less link, and — without planting — the tree spec found `AisleOrderSection`
had no anchor (a multi-line open tag the helpKey sweep missed) and the focus walk
found a REAL bug in the new fallback: consuming `?focus=` dropped the pill it had
derived, unmounting the card just scrolled to. Both fixed; both would have shipped
green otherwise.

Two things the merge itself taught: `.subtabs` alone is no longer "the pills" — the
lens toggle and any SubTabs a stacked card renders inside itself (guest link kinds,
corvées ▸ projets ▸ entretien) match it too, so the pill row carries
`.operator__subs` and specs scope to a card by its `#op-<key>`; and a 31-character
pill label (« Appareils, accès & diagnostics ») filled a 390px row on its own, so the
merge had bought nothing there until it became « Appareils & accès ». The hscroll
spec, whose premise was Système's nine-sub overflow on a desktop, now tests Maison's
four at phone width — same mechanics, honest geometry.

Guards: 1970 unit · the Réglages e2e set 271 + 132 + 5 ✓ at `--workers=1 --retries=0`
· matrix settings states 6/6. `DISCOVERY.md` carries the pill map; « Quoi de neuf »
has the entry.

**Then, settings write coverage (the queue's next item), same day.** Re-measured on the
merged pills: 17 writing sections, nine still asserting nothing. Ten tests appended
to `e2e/config-panels.spec.ts` (member rename · device revoke · season-seed upkeep ·
work-hours block · cercle-group delete · guest-link revoke · sitter info · AI probe ·
AI-log clear · photo delete), each navigating by `?focus=` and scoped to its
`#op-<key>` card, the two deferred deletes asserting the HOLD (nothing sent) before
firing `pagehide` for the write. The revoke test was watched fail on a planted body
without `revokeId`. Two writes stay unasserted and are named in `REVIEW-PASS.md`: a
member DELETE and a photo UPLOAD — the only `- [ ]` left in that file.

**Then PARITY Wave D, the last queue item — and the verdict split it.** The two
"parallel arrays" were never the same case: recipe `steps_json` is a `string[]` by
design (inline « ## » headings, 45 readers), so its side array can only go by
reshaping every step reader — the churn-only wave PARITY forbids, and
`parallel-array-rule.test.ts` (Sep 3) already argues the containment; that half is a
`[~]`. Routine cards are OBJECTS, so their two side columns (0040/0042) simply fold
ONTO each card as `clipKey` / `photoKey` (`functions/_lib/routineCards.ts`, no DDL:
the columns stay locked, read as a fallback for a pre-fold deck, blanked on the first
write so a cleared key can't come back). Every client side array is gone; the demo
sweep reads keys off the cards; the guard shrinks to recipes. Marc picked this split
when asked. Unit-tested; e2e below.

**Then Marc's next ask: « look at sections/tabs/subtabs/pages/screens and check if
help or cross-links to Réglages (through help) are still needed ».** The walk, by
layer: the "?" help doors (17 files render one) speak through 8 registries whose
entries carry `card`/`point` only — they never spell a Réglages path, so the merge
cost them nothing; the guide's 38 « Régler » links name their section (`?focus=`)
and are build-validated; « Voir dans l'app » (`SUB_GOTO`) covers 11 of the 14 pills,
and the three without (Appareils & accès, Voix & IA, Cette année) have no live
surface to go back to — correct as they stand. **The rotten layer was PROSE**: the
breadcrumbs written INTO hint and guide text. 40-odd « Réglages ▸ … » crumbs across
both i18n files and the guide named pills that no longer exist — not just today's
(« ▸ Tablettes », « ▸ Système ▸ Mode veille », « ▸ À compléter », « ▸ L'auto ▸
Horaires ») but ones retired three restructures ago (« ▸ Guide », « ▸ Courses »,
« ▸ Suivi », « ▸ Le cercle »). All re-pointed at the live map, comments included,
and a guard now holds the layer (`settingsNav.test.ts` « prose breadcrumbs »): every
crumb in a user-facing string must name a live tab and pill in either language. It
went red on the sweep's own first draft twice — an EN tab I had named « List »
instead of « The list », and a crumb that ran into its sentence — which is the
canary working. One label became a verb: the board edit bar's link now reads
« Rétablir dans Réglages » rather than spelling a three-line path it already opens.

**Then, Marc's question: « any other improvements for concise, direct, unambiguous
copy for a first-time grandparent? »** Measured rather than guessed — 2659 FR strings
and the 32 guide cards, swept for four smells, and all four tracks run the same day:
(1) **the guide's one-liners** — DISCOVERY.md listed concision budgets as « invariants
tests enforce » with no test behind them, and the `what` line (the one a grandparent
reads before opening a card) was over 15 words on 30 of 32 cards (todos 53, voyage
51, carnets 49); every one rewritten to ≤ 15 plain words, 21 point labels brought
under 5, and `guideBudget.test.ts` now holds the budgets (hard for `what`/labels,
ratcheted for the 60-odd details over two sentences and the 6 cards over their point
cap); (2) **empty states that teach** — 14 section-level empties that stopped at
« Aucun … pour l'instant » now follow the B-15 contract (what this is, one example,
the one action: « Aucune routine encore. Crée-en une avec le ＋ — « Matin »,
« Dodo » — et ton enfant la suivra seul, en images. »); cell-level ones (« Rien de
prévu ») stay terse on purpose; (3) **jargon** — « navigateur » (the mic permission
now says « quand l'appareil demande la permission, réponds Autoriser »), « opérateur »
→ « compte parent », « kiosque » → « la tablette du mur », « réinitialiser / par
défaut » → « remettre … de départ », « désactivée » → « éteinte », « session » →
« jusqu'à ce que tu fermes l'app »; (4) **long on-screen hints** — 20 settings hints
of 30–56 words cut to one or two sentences (the guide card beside them carries the
rest), sound.hint 56 → 22, calmHint 55 → 24, castIntro 47 → 20. What stays: the
generic buttons (« Suivant » on a sequence, « Oui / Non » on a toggle pair) are right.

**The alias drill, run in full (the pass the copy commit had left ratcheted).** Six
cards over their point cap merged down — routines 13 → 8, cercle 13 → 8, capture
10 → 8, recipes 10 → 8, share-access 9 → 8, set-display 13 → 11 — and every detail
trimmed to two sentences, so `guideBudget.test.ts`'s last two rules are hard now, not
ratchets. Every `(card, point)` reference re-pointed (cercleHelp ×14, addHelp ×4,
operatorHelp ×3, kitchenTabHelp, BusinessesTab), nine alias bases re-based, two tour
lookups renamed — and the re-check found what the drill exists for: `capture`'s
three aliases and `cookmode` had been one point off since an earlier trim, unseen
because the guard only proved « in range ». The sentence counter also learned that a
« ? » inside « … ? » is not a sentence end. DISCOVERY.md's drill gained step 5 (tours
look points up by French label).

**And the E2E job caught what the local runs could not** (both copy pushes: CI green,
deployed; E2E red on ONE test, deterministically). The sitter-info coverage test I had
just added typed into « Infos à partager » — a block that starts EMPTY and seeds itself
from a mount fetch — and CI is slow enough to lose that race every time: the seed
landed after the keystroke and overwrote it, so the save PATCHed `wifiSsid: ''`. The
spec was only the messenger; the PRODUCT lost the keystroke, on any slow phone, for
any fast typer. `ShareInfoEditor` now refuses to seed once anyone has typed
(a `typed` ref), the spec waits for the seed before typing, and a new regression test
holds the fetch open, types, then releases it — run against the bug (`Received: ""`,
the exact CI shape). The lesson is the one this file keeps relearning: a mount fetch
that fills a form is a race with the user, and only a slow runner shows it.

**Second copy sweep, fresh eyes (2026-09-08).** The first pass measured LENGTH; this
one measured VOCABULARY, and the four tracks all ran:

- **A destructive dialog now says what is lost.** Four had drifted back to a bare
  question — the shared fallback « Supprimer ? » (reached from a grocery row AND a
  tracked staple), « Supprimer cette recette ? », « Supprimer ce mot gardé ? » — and
  the new guard found **seven more the first audit could not see**, because they are
  FUNCTIONS (`(name) => …`) rather than plain strings. All rewritten on the model the
  app already had (« Supprimer ce groupe ? Les personnes restent dans le cercle. »),
  and `confirmCopy.test.ts` holds the rule in both languages: a `…Confirm` string is
  ≥ 6 words and carries a consequence, with an exemption list for the three keys that
  are buttons or chips rather than questions. Proven red on a planted « Supprimer ? ».
- **« Business » → « Commerces »** (Marc's call): the last English word in the French
  UI, and it named a whole Maison section — 14 strings, the sub-tab, the card title,
  the empty state, the ＋ tile. The guide had described it in French all along
  (« ton carnet de commerces »); only the label never followed. Ids and routes stay
  `business`; « Quoi de neuf » carries the rename so a returning user finds it.
- **One word per idea.** The delete family runs on a real system (retirer = off this
  surface · supprimer = gone · vider = empty · révoquer = kill a link), so the fix was
  the two strays: « Enlever » → « Retirer », and « Effacer la note » → « Supprimer la
  note » (it destroys). And the routines empty screen offered « ＋ Ajouter une
  routine » beside « ＋ Nouvelle routine » — two words, one idea to a newcomer; they
  now say what each DOES: « Partir d'un modèle » and « Partir de zéro ».
- **French spacing** before « ; ? ! » in 29 places. Worth recording how it went wrong:
  the scripted pass ran per LINE, so a `{ fr: '…', en: '…' }` one-liner had its
  ENGLISH half spaced too (« What's for supper ? »), and one English comment with it —
  17 reverts. A rule that applies to one language must be applied per LITERAL, not per
  line.

E2E caught two things on that push, and only one of them was the copy. The first was:
a spec still clicked « Enlever ce rappel » — renaming a label means grepping `e2e/`
for it, every time. The second was **a guard that read the wall clock**, the same trap
as the three « journée vide » gardes fixed the day before (`bacee8f`): « Aujourd'hui »
SAYS what is being cooked never froze its clock, and past **19 h** (souper 17 h 30 +
`SLOT_GRACE_MIN`) the day moves on to the dessert slot, nothing is planned there, so
`pickNextMeal` falls back to the LAST planned meal — the second souper, which the card
already lists — and the prep row correctly stands down. Zero rows; the guard read a
correct behaviour as a regression. It passed here all afternoon and failed in CI that
evening. **A board guard that depends on the hour freezes its clock** (`page.clock
.setFixedTime`) — its own sibling already did, which is how the shape was recognized.

---

## 4. What still needs improvement — consolidated and ranked

**« Le ? ne sert qu'au babillard » — reported 2026-09-09, and it was true.** Arming
the « ? » meant HINTS ONLY. A section's guided tour existed for six sections but was
reachable from two places you had to already know: Réglages ▸ Découvrir, and the
first-visit card that disappears once dismissed. So the tour read as a board feature,
which is exactly how it was reported. Fixed as one uniform thing rather than six:

- **`HelpHint` is now the « ? » bar** — the tap-to-explain line plus two doors,
  « Faire le tour » (THIS section's tour) and « Le guide ». Every hub tab already
  rendered `HelpHint`, so one component made all of them equal; it takes the section's
  `card`, and the tour id IS that card id (the convention `SectionIntro` has used
  since #32, now load-bearing).
- **Les notes had no tour at all** — the last hub tab without one. It has a five-step
  one, single-sourced from its guide points like every other. An e2e that used to pin
  the ABSENCE (« no tour to offer ») now pins the opposite.
- **Maison's « ? » offers the tour of the SECTION you are on**, not the tab's:
  routines and the cercle each own one. The route→card table is shared with the ＋
  sheet (`lib/sectionCard.ts`) so two spellings can't drift apart.
- **Réglages had no « ? » AT ALL — and 34 help entries nothing could reach.**
  `lib/operatorHelp` has an entry per settings section, `HelpTitle` makes a heading
  tappable *while help mode is armed*… and nothing in Réglages ever called `toggle()`.
  The registry had been unreachable for as long as it has existed. The « ? » now rides
  the lens row (Comprendre · Régler), on the Régler face only — on Comprendre the guide
  text IS the explanation — and Réglages got its own tour so its bar offers what every
  other one does.
- **Guard: `tour-rule.test.ts`** — every surface with a « ? » has a tour, every
  `<HelpHint>` names its card (fail-closed), every step's anchor exists, no anchor is
  orphaned. Proven red three ways (a bar with no card, a step pointing at a dead
  anchor, an anchor deleted from the page); the Réglages e2e was proven red by
  removing the toggle again.

**And the guard's first draft was wrong in the repo's favourite way.** It scanned only
literal `data-tour="…"` and reported three orphans — `kitchen-tabs`,
`maison-sections`, `cercle-views`. All three exist: they are passed as `tour="…"` to
SubTabs, which forwards `data-tour={tour}`. I nearly "fixed" three anchors that were
already there. The scan follows both spellings now, and the real findings were
elsewhere (notes had no tour; `add-routines` was an anchor no step named). **A grep
guard that walks the wrong shape reports the wrong thing with total confidence** —
the third time this file records that lesson.


**Coverage + Wave D pass, 2026-09-08 (evening).** Three of the six "honest coverage
backlog" gaps this file listed were **stale**: device-revoke, member-rename and the
note auto-save round-trip are all covered (the first two were written earlier the same
day). The three real ones are now closed, each verified red against planted defects:

- **`/cercle/import` had ZERO tests** — the worst place in the app for that, since the
  URL lives in links already TEXTED to relatives and behind one tap sits the longest
  write chain in the codebase (create-or-merge each person → copy each photo → each
  relationship → each pet + its owner link → the family group). Six cases read the
  WRITES, not the screen (`e2e/family-import.spec.ts`).
- **Both toddler surfaces** — the kitchen's rule is *a child's pick is an IDEA, never a
  plan* (nothing may reach `/api/meals`), plus "one tap never commits" and "a day that
  already has a supper is taken"; Maison's is that a relative's label is read from the
  OTHER person's side (« Mère », not « Fille ») and that closed links put a grandmother
  on a grandchild's card. A kid kiosk has no in-app escape, so a stray write there is
  both unattributable and unreachable.
- **Glisser une personne dans un groupe** (`e2e/cercle-drag-group.spec.ts`) — the last
  uncovered cercle write, driven with the MOUSE (the reachability half of the standing
  rule). Its third case is the session's cleanest catch: « a person already in the group
  posts nothing » passed with `canDrop` **deleted**, because `onDrop` re-checks
  membership too — a guard defended twice tests neither layer. Re-aimed at what canDrop
  alone owns (the drop CUE), with the allowed drag as a control so it can't pass by the
  highlight never appearing at all; now red on the deletion.
- **La galerie photo d'une personne** (`e2e/contact-photos.spec.ts`) — the last line on
  the backlog. A caption saves on blur by id and trimmed; an UNCHANGED caption writes
  nothing (this surface blurs constantly — tab away, tap another photo, close the scene —
  so a write per blur would be a write per glance); and the delete asks first, with
  « Annuler » costing nothing, because deleting frees the R2 blob server-side and there
  is no undo behind it. Gotcha for the next session: the gallery lives inside the
  « Cadeaux, étiquettes et groupes » disclosure, closed unless the person has gift ideas
  or tags — the spec opens it rather than depending on fixture data.
- **Wave D's last item stays parked, but its containment was CHECKED rather than
  trusted.** The client guard went red on the bug it names; the server had two spellings
  of the lockstep rule, now one (`functions/_lib/recipeStepImages.ts`). Details in
  PARITY.md's own entry.


Deduplicated across every source above. Ranked by **user harm**, not by which document
it happens to live in.

### A. Verified correctness — ✅ DONE 2026-08-27

1. ~~**`/share` loses captures offline.**~~ **Fixed.** The share-target capture now rides
   `useWrite()`, so a capture made with no signal queues and replays instead of being
   thrown away in silence. The photo branch — which needs an R2 key back before it can
   write anything — is now honestly gated on `useOnline()` rather than offering a button
   that can only fail. bmad/11 tier-1 seam #2 is closed; guarded end-to-end by
   `e2e/capture-offline.spec.ts`.
2. ~~**The `useWrite` rule is prose-only.**~~ **It is a test now:**
   `src/lib/write-rule.test.ts` fails the build on ANY raw `api()` write in `src/`
   unless its `file → endpoint` is in that file's `ALLOWED` set **with the reason**.
   Fail-closed, so a brand-new endpoint written through `api()` fails by default.
   Verified to actually go red on a planted violation — a guard that was never red
   proves nothing.
   The scan found **95 write sites across 53 endpoints**, not the ~35 first estimated;
   but most collapse into principled categories (blob uploads that need the key back,
   session/pairing, link minting, AI round trips, multi-step operator merges). The
   genuinely queueable strays were **6 sites in 5 files** and are migrated:
   `cercle/ContactPhotos` (caption + delete), `operator/recipePills`,
   `operator/recipesTags`, `lib/measurePrefs`, `operator/guest`.
   The 66 documented exceptions are grouped by *why* in eleven commented blocks.

   *Left standing, deliberately:* `board/Notes.tsx` and `lib/drawingGallery.ts` already
   carried explicit "stays on api() ON PURPOSE" reasoning — each trailing write is
   atomically coupled to a blob upload that cannot be queued, so routing only the write
   through the outbox would land a row pointing at blobs that were never stored.

### B. The friction pool — ✅ CLOSED 2026-08-28

`bmad/11-friction-audit.md` held 14 ranked seams from five flow audits. **All five
tier-1 and all nine tier-2 entries are now resolved.** The five tier-1 seams closed on
2026-08-27 (with #5 found already fixed); tier 2 closed on 2026-08-28 with #10, and
with **#11 and #12 found already done and never ticked** — five of the nine were in
that state, which is §5-1 in one table.

The last piece was tier-1 #2's remaining half: **/share had no routed label and no
« Corriger »**. The fix was to *delete* the re-implementation rather than copy the
missing parts into it — the page now mounts `<CaptureForm seed=…>`, THE capture spine,
so the routed line, the re-route tiles and the undo cannot drift from the ＋ sheet's
again. That is the same build-beside that cost this path its outbox in the first place,
and it is the clearest argument in the repo for fixing one by removing it.

Two things worth keeping from the work itself:

- **The e2e caught what re-reading did not.** `useAnnounceLeftover()` was dropped where
  the plain function it replaced had lived — below the board's `if (unauth) return` —
  so a hook ran conditionally and the locked kiosk crashed outright ("Rendered more
  hooks than during the previous render"). Typecheck and 1823 unit tests were green.
- **A guard that has never been red proves nothing — a third time.** The /share spec
  passed against the very timed bounce it was written to forbid: it read the routed
  label and clicked « Corriger » inside the old 1 s window. It only became a guard once
  it waited the bounce out. Verified by planting the old behaviour back.

**What remains in that file:** tier-3 polish only, **swept 2026-08-28 — five re-checked,
four stale**, which is tier 2's ratio again. Verdicts are now inline in the file. The one
real defect the sweep found was not the one it was looking for: the Jan-1970 cold-grid
flash **was** already fixed at the named site (`Kitchen.tsx` holds a Skeleton), but
sweeping the *rule* turned up a fifth `weekStart ?? 0` consumer that wasn't guarded —
`IdeasPage`, where the epoch week became the ideas drawer's "plan it on…" chips, so a tap
on a cold open **wrote a meal dated 1 Jan 1970**. Fixed, with `e2e/cold-week-anchor.spec.ts`.
~~Still genuinely open: …~~ **tier 3 is CLOSED, 2026-09-08 (evening).** Every one of the
seven resolved, and only one of them by writing code: the cashier's second check-state and
the staples chips are Marc's « won't do »; the supper hero's done state is his « leave it —
the hero is a plan, not a tracker »; the gather tick MEASURES 46px against a 44 floor and is
now guarded against the live `--touch-target`; the routine stopwatch was dropped on his call
and is gone from `RoutinePlayer`; the empty shell routine's cue SHIPPED as "kids seam #6"
(« À compléter » + why, on the parent card); and « Historique » is the "last week" review,
with an « Encore ? » that re-plans a past dish. Six of the seven were verdicts or already-done
work that nobody ticked — the ratio this file keeps re-learning. « Par allée »'s drag grip is a recorded decision, not a gap.

### C. Section debt — `REVIEW-PASS.md`, **closed 2026-09-09** (swept four times)

> **Second sweep, same day (evening).** 31 → 29 → 20 → 15 → **4**. Marc decided the four
> judgement calls and picked three of four bigger items; everything else was re-verified
> against code and either fixed or given a recorded verdict. Of the claims re-checked in
> this pass, **six were stale or misread**: `HomeProjectForm`'s "bare input" (it uses
> EditField, and says so), `firstLine` "recomputed inline" (it isn't), the settings-nav
> "wrapping OperatorJump row" (that component is deleted), the "stale section ids" (they
> are deliberate alias regressions, labelled as such), `?focus=` as the fix for the focus
> lens (that param is already Réglages' section-landing grammar), and the flash-back's
> location (DayPlanPage was safe; **Réglages** was the exposed one). Two findings were
> *worse* than written: the trip cover could never be set at all, and the undo assertion in
> my own new carnet test was reading a log nothing wrote to.

**It said 31. It was 29 boxes, and eight of those were already fixed and never ticked** —
verified by grepping every open claim against code, which is the sweep this section had
been asking for. What is left has been checked and is genuinely open.

Ticked as already-done in the sweep: the nested interactive on the routine grid and the
`role="img"` world SVG (both 2026-08-27, now guarded); `NoteEditor` not bound above the
keyboard (`.note-editor` is in `core.css`'s « Keyboard fit » list); the parent overview's
missing "done today" (`RoutinesTab` shows it); guest submit idempotency; `MONTH_KEY` missing
from `CAPTURE_KEYS`; the inline `['ghosts']`/`['list-history']` literals; `capitalize` ×3
(one definition left, and `MomentsView` no longer exists).

Fixed in the same pass: **`NoteEditor`'s silent auto-save** — and the defect *under* the
reported one, a `.catch(() => {})` on every branch that swallowed real server rejections, so
a note could close and simply not exist; and **`ItemReorder`**, which duplicated `EditField`'s
reorder buttons down to the class names → one shared `<Reorder>`, in DevKit and `COMPONENTS.md`.

One finding was worse than stale: **"`OperatorJump` is not registered in DevKit" was true and
useless** — the component had been deleted from the tree. Checking a gallery for an absence
proves nothing about the codebase; grep the tree.

Shapes still worth batching:

- **Reuse duplicates** — ~~the "which ingredients?" checklist exists twice~~ (✅ 2026-08-28 —
  one `RecipeIngredientPick` body, and the `RecipeListPicker` modal **deleted**: its niche
  was a recipe peek, which `adapters.ts` removes by rule. The **commit** deliberately stays
  with the host, because whether an undo is reachable is a property of the surface); three `Member` shapes converge
  on one face control; `ChoreForm`/`BlockForm` hand-roll the same member-toggle row; ~~two `parseBirthday` derivations that disagree on the year regex~~ (✅ 2026-08-28 — it was
  FOUR spellings; the rule now lives once in `functions/_lib/birthdayRule.ts`, pinned by an
  agreement table in `src/lib/cercle.test.ts`).
- **Silent / inconsistent states** — ✅ **both closed 2026-08-28.**
  `MeasureColorsSection` degrades to a read-only legend instead of vanishing — and the
  finding named the wrong audience: a LINK guest never reached that sub (`kitchen ▸
  apparence` isn't in `GUEST_SUBS`), the one who saw the hole is an operator in **guest
  preview**, where `isGuest()` is true but `isGuestLocked()` isn't. `HeartButton` now shows
  a muted « … » past four faces (never a "+N" — a count is what the calm tenet forbids
  here) and folds « et d'autres » into the `aria-label`. Both in `e2e/readonly-states.spec.ts`,
  each run against its planted bug. *(`ThisWeek` having no error state was itself stale — it
  renders one at `ThisWeekTogetherSection.tsx:137`.)*
- **Remaining e2e gaps** — ~~Le cercle is screenshots-only~~ **stale, and now narrowed**
  (2026-08-28): Businesses + group CRUD were already covered by `cercle-crud.spec.ts`, and
  the **carnet scene**'s R2 + undo seams are covered now — `carnet-scene.spec.ts` 5 → 13
  cases (care-log add/edit/delete, pin delete, both halves of `useDeferredRemoval`, the
  mid-undo resurrection race, the removal-scope split, and `CarnetDocs`' PDF/photo tiles),
  each verified against a planted bug. Genuinely left: the ＋ chooser, drag-to-group + undo,
  ReviewChecklist apply, .vcf import, note autosave round-trip; the toddler kitchen picker
  and `CircleKidView`; config sub-panels are screenshot-only, so a broken PATCH would pass.

### C-bis. Reported from the device, 2026-08-28 — all four fixed

Four reports from Marc's phone. The first three were **pre-existing** (the deploy stamp in the second
predates that day's work) and none was in any ledger; the fourth was a regression from fixing
the second. All four are P1 in `REVIEW-PASS.md`.

1. **The tab bar and ＋ FAB vanished with no keyboard on screen.** `?kbdebug` read
   `kbInset=318 open=true … ae=BODY` — a 318px "keyboard" with nothing focused. The app
   inferred the keyboard from the visual-viewport SHRINK alone, and iOS shrinks that
   viewport for the screenshot preview, the app switcher, Control Centre and share sheets.
   The `document.hidden` guard written for exactly this **does not fire for a screenshot
   preview**; every healer needs an event, and the 1 s watchdog only re-READS, so it never
   recovered. Now: *a keyboard cannot be up if nothing that could summon one holds focus*,
   checked on both edges.
2. **Offline, the Mois grid said the same thing three times**, and one of them was a lie —
   the calm stale line, plus two identical red « Le réseau n'a pas répondu · Réessayer »
   blocks, one carrying a retry button with no network to retry with. `LoadError` is
   offline-aware now (no alarm tone, no dead button — the weather is not a surprise) and
   `onRetry` is optional, so a screen gets ONE retry door while both blank regions still
   explain themselves.

3. **The board cried « Hors ligne » over data one minute old**, and neither a reload nor
   a pull-to-refresh cleared it. The condition was "the board poll failed twice" —
   nothing about age — and a phone banks pairs of misses constantly (iOS aborts
   in-flight fetches when the web view suspends), while a reload and a refresh each bank
   their own. The AGE is load-bearing now, on the same yardstick the OfflineBanner was
   already using. Pure `isBoardStale`, six boundary tests, run against the bug.

4. **« Du calendrier annuel vers un mois, rien ne charge »** — and this one was MINE, from
   fix #2 the same day. Removing the retry button while offline looked principled (it
   "cannot work with no network") and was wrong: a person taps it when they think the
   signal is back, and the month view NEVER retries itself (`MONTH_KEY` has no `live`; the
   client sets `refetchOnWindowFocus: false`). The quiet tone stays; the door comes back.

**How it got out, which matters more than the bug:** a local e2e run printed « flaky » and
still exited 0, so a genuinely broken change read as green here and CI failed it
deterministically. The flaky test's NAME was printed the first time and I skipped over it.
`failOnFlakyTests: true` now fails the local run, and `npm run e2e:ci` mirrors CI exactly
(`--workers=1 --retries=0 --forbid-only`) — run that, not `npm run e2e`, before pushing
anything touching shared machinery. Recorded in `CLAUDE.md`, verified by planting a
deliberate flake and watching the run exit 1.

**The lesson worth keeping:** the first two were not reachable from the desk at all. The first needs a real
iOS system overlay; the second's exact state (offline AND errored) is **unreachable
through a real query in the harness at all**, because going offline makes TanStack pause
the query before it can error. A screenshot from the actual phone found both in one
morning. When Marc reports a state, reproduce it from the pixels, not from the model of
how it should be reachable.

### C-ter. The third sweep — the ledger is effectively empty (2026-08-28, evening)

`REVIEW-PASS.md` went 31 → 29 → 20 → 15 → 4 → 1 → **0**. The last pass settled the residual
nit bullets, and the ratio held to the end: of the sub-claims re-checked, **five more were
stale or misread** — `firstLine` recomputed inline (it is not), the NoteEditor body
mislabelled in edit mode (it is not; the cited line no longer exists), `HomeProjectForm`
on a bare `<input>` (it uses `EditField`, and says so), the settings-nav's second
`OperatorJump` row (that component is deleted), and the "stale section ids" (deliberate
alias regressions, labelled as such in the file).

**Three were settled by MEASUREMENT rather than by reading code**, which is the habit
worth keeping from this pass:

- the bmad/11 "gather tick ~27px" measures **46px** (the floor is 44) — now guarded
  against `--touch-target` read from the live stylesheet, not a hard-coded number;
- `.cf__addr-row` "packs tight at 320px" — it wraps to two lines and ends at x=304 inside
  a 320px viewport. Tight is a fair description; it is not a defect. Left alone;
- the 7-up re-file grid at 320px — measured with `worstRightBleed` (the card does not clip,
  so `assertClean`'s precondition does not apply) and guarded against a planted bleed.

Two real fixes came out of it: **`ContactForm`'s avatar rides `useMediaUpload()`** (the last
hand-rolled resize→POST→key, and `write-rule.test.ts` caught its allowlist entry going stale
the moment the raw `api()` left), and **a pet weight re-entered on the same date now
CORRECTS the reading instead of appending a duplicate** — two rows for one day corrupts the
trend the log exists to show, and re-entering the date is also the edit door a weight row
never had.

And one guard now holds a TENET rather than coverage: **`ThisWeek` asserts
faces-not-counts**. The section widens the chore ledger to the whole household and inherits
its hard rule — say WHO, never HOW MANY — which the file stated and nothing enforced. The
assertion is that no digit appears in the block at all.

**What is left is one honest coverage backlog** (device-revoke / member-rename round-trips,
untested config sub-panels, photo upload+delete+undo only smoke-rendered) plus PARITY's two
Wave-D items — and Wave D itself was halved on inspection: only `recipes.steps_images_json`
and the routine cards are genuinely positional parallel arrays, while `care_log.media_json`
(a multi-document LIST) and `members.avatar_ref` (a polymorphic colour-or-key pair) are
correct as they stand.
### C-quater. Reported from the device, 2026-09-02 — deleted list items resurrecting, calendars dead until hard refresh

Two reports from Marc, both chased to mechanisms rather than symptoms.

1. **« I delete items in La liste and they come back. »** No soft delete exists — every
   "return" is a delete that never reached the server, or a fresh INSERT. Three real
   mechanisms found, all fixed:
   - **The tmp-id delete black hole (the big one).** Swipe-delete a row whose optimistic
     create hadn't reconciled → the deferred delete fired 15 s later with `{id: 'tmp-…'}`
     → `DELETE /api/list` matched zero rows, answered 200, and the real row lived forever.
     Fix: a session tmp→real registry (`src/lib/tmpIds.ts`) fed by `undoCreate` (online)
     and the outbox replay; `writeWith` resolves path+body through it at fire time, and
     the deferred-removal store hides BOTH spellings so the row can't visibly come back
     mid-undo. The outbox's E-41 rewrite still owns the queued-before-replay case.
   - **Held deletes silently lost on teardown.** The ToastProvider's only safety net was a
     React unmount effect, which never runs on reload/tab close/PWA kill/SW-update reload —
     the row was hidden client-side only and the next load showed it again. Now every held
     write commits on `pagehide` + `visibilitychange→hidden` (while hidden the user can't
     see « Annuler » anyway), and `api()` sends hidden-state writes with `keepalive` so
     teardown doesn't abort the fetch.
   - **« Meilleurs prix » resurrected mid-delete rows in batch.** `autoPick` walked the raw
     board frame; a held row can't match in `lib/picks` (which rightly excludes held ids),
     so `stageDeal` fell through to `addLine` — INSERTING a fresh line with the deleted
     item's text. AddSheet now filters through `removal.visible` like every list surface.
2. **« The monthly/yearly calendar can't load until a hard refresh. »** Both views are in
   the EAGER chunk — not the stale-chunk theory. The wedge is the data layer: no poll
   (D-18), `refetchOnWindowFocus: false`, retries spent → a failed fetch never retried.
   `MonthView` had the manual « Réessayer » (ddf0a4e); **`YearView` had no error state at
   all** — twelve blank mini-months plus a lying « rien cette année », forever. Fixes:
   `YearView` wears the same `LoadError` face, and both (+ the car query) ride
   `healOnError` (`lib/query.ts`): refetch on focus + a quiet 60 s retry **only while
   errored** — never a poll on success. E2E planted-bug-verified (`year-to-month.spec.ts`).
   Related latent bug closed while in there: a deploy deletes old lazy chunks, `React.lazy`
   memoises the rejection, and ~55 routes could go dead until a hand refresh — `main.tsx`
   now reloads once (loop-guarded) on `vite:preloadError`.

3. **« The hovering quick-add button doesn't add any item at all. »** Three add doors,
   only Liste's own bar had an optimistic row — so on the ＋ sheet's « Ajouter à la
   liste » and the ⚡ « Ajout rapide » chips, an offline/queued write painted NOTHING
   (the sheet closed; the chip locked ✓ and « Ajouté N » ticked up off LOCAL state) and a
   server rejection on the ⚡ page was 100 % swallowed (`.catch(() => {})` — the only
   write site in the app with no error path). Fixes: the optimistic splice is now ONE
   shared helper (`lib/listAdd.ts` `spliceListLine`, + `mintTmpId` in `lib/tmpIds`) used
   by all three doors, and a rejected ⚡ add un-locks its chip + says `saveFailed` once.
   Still open (judgement call, §D): the BOARD ＋ files typed text as a fridge NOTE — it
   has no list door and no AI routing since the capture spine moved to the header mic —
   so a grocery item typed there lands on the board as a note with zero feedback. If
   that's the button Marc meant, the mechanics above don't cover it; adding a
   « liste » tile to the board ＋ is a product decision, not a bug fix.

### C-septies. Asked by Marc, 2026-09-02 (evening) — the day scene's shape, and the meal peek restored

Four asks, all shipped together:

1. **The sub-tab row is now the FIRST thing in the day scene's body**, and the **weather
   strip + the day-note headline moved INSIDE « Journée »**. They were above the tabs as
   "the day's identity, not a face" — but they are context for the AGENDA, not for the
   meal planner, and sitting above the picker they pushed the face choice down the screen.
2. **Every tapped meal opens the peek again** — `useOpenMeal`'s split is REVERSED. A meal
   that resolved a recipe used to navigate straight to `/kitchen/recipe/:id` under "tap
   the thing, get the thing"; only a free-text meal peeked. That split cost the thing a
   plan is FOR: the recipe view knows nothing about the day, so from a planned supper
   there was **no door back to the day**. The peek is the only surface holding both
   halves, so `buildMeal` now carries « Voir la journée » + « Ouvrir la recette » + a
   primary « Cuisiner », with restants/retirer folded into the ⋯ (five visible buttons
   would bury the three you came for). This is NOT the menu-peek the codebase deletes
   elsewhere — it carries the PLAN (day, slot, cook), which neither page shows.
   - **Accepted, budgeted regression, Marc's explicit call when asked:** cooking tonight
     from the board's « Ce soir » hero is **2 taps, not 1**. `tap-budget.spec.ts` is
     re-pinned 1 → 2 *with the reason written into it*: if it must be 1 again, the fix is
     a surface-scoped `useOpenMeal`, never deleting the day door. ACTIONS.md footnote ¹⁰.
3. **« Vider la journée » → « Vider les repas »**, key `clearDay` → `clearDayMeals`. It
   lives on the « Repas » face only since the scene split, so the old label over-promised
   (it never touched rendez-vous, corvées or the note).
4. Guards: `interactions.spec.ts` « a recipe-linked meal peeks too, carrying the day door
   AND the recipe doors » (new), the recipe-less case kept beside it, and the re-pinned
   tap budget.

### C-sexies. STILL reported after C-quater, 2026-09-02 — and what production actually said

Marc re-reported both bugs the same afternoon, with screenshots (« they always come
back », « the calendar bug is still there »). C-quater's mechanisms were real and are
still right — they were just not the whole story. **This round was diagnosed against
PRODUCTION, not by reading**, and the evidence reversed the assumption underneath it:

- **The deletes were NOT lost.** Six list rows (« 1 », « 2 », « 3 », « 4 », « Qw »)
  were swipe-deleted and still on screen 26–31 s later. Queried prod D1 directly
  (`wrangler d1 execute babillard --remote`): **none of them exist.** Every DELETE
  had landed. The rows on screen were a CLIENT hallucination, not a failed write.
- **The server is not the calendar's problem either.** Prod holds 43 events (0 recurring),
  120 meals, 15 tasks, 32 todos — nothing that strains `/api/month`'s 17-query batch.
  All 123 migrations are applied. `wrangler tail` showed `outcome: ok`, no exceptions.
- So BOTH symptoms share ONE root cause: **that device's reads were failing.** La liste
  rendered its last good (pre-delete) frame; the month view, having never loaded one at
  all, showed the honest error face — which is C-quater's fix *working*, not failing.

**The defect that fix exposed, now closed: a CONFIRMED delete could be resurrected by a
stale frame.** `unhideWhenFresh` carried a 90 s cap that un-hid the pending ids
*regardless* of whether a fresh frame ever arrived — justified as "a row must never be
hidden forever". On a device whose reads were failing, that cap is precisely what
repainted six rows the server had already deleted. Fixed:

- **No cap on the confirmed path.** We wait for a genuinely fresh frame however long it
  takes. Nothing hides "forever": the pending set is session-only module state (a reload
  clears it) and the row is gone server-side, so the next successful frame simply lacks it.
- **`remove` now OBSERVES its held write.** The call sites swallowed it
  (`write(...).catch(() => {})`), so the hook could not tell "deleted, but the refetch
  failed" (keep hiding) from "the delete failed" (show it again) — and defaulted to the
  resurrecting choice. `Liste.tsx`'s `deleteItem`/`clearChecked` no longer swallow; a
  write that genuinely FAILS un-hides at once, because then the row really is still there.
- Guard: `useDeferredRemoval.test.ts` § "deferred-removal freshness fence", **verified
  red** by re-planting the 90 s cap.

**Also found and fixed: every `/api/*` JSON response shipped with NO cache directive.**
Verified against production (`curl -D -` on `/api/board`: `content-type` and nothing
else). Per-household data behind a session cookie, freshness left to browser/intermediary
heuristics and iOS's bfcache — on a surface whose whole correctness story is "the poll
reconciles", a cached frame is a frame that can show a row the household already deleted.
`_lib/json.ts` now sets `cache-control: no-store`. Image bytes are untouched:
`/api/img/*` and `/api/flyer-img` build their own Response with
`public, max-age=31536000, immutable`.

**Still not explained, and deliberately not guessed at:** *why* that phone's requests
failed. The Worker was healthy throughout, the SW passes `/api/*` straight through
(verified in `vite.config.ts`'s fetch handler), and the same account was served fine on
desktop in the same minutes. The self-heal (refocus + 60 s retry while errored +
« Réessayer ») is in place and is the intended recovery. If it recurs on a healthy
connection, the next step is a device-side capture, not another code guess.

### C-septies. Reported STILL happening, 2026-09-03 — two more gaps under C-quater/C-sexies' own umbrella

Marc reported both symptoms again: swiped list rows "sometimes" still come back, and
"offline app should always be able to start." Neither is C-sexies' 90 s-cap bug (already
closed) — both are separate gaps under the same two headings, found by reading the code
(not by re-trusting the ledger — this file's own rule).

- **The resurrection: `[].every(...)` is vacuously `true`.** `unhideWhenFresh`
  (`src/lib/useDeferredRemoval.ts`) only ever checked `cache.findAll({queryKey:[scope],
  type:'active'}).every(q => q.state.dataUpdatedAt >= t0)`. If the undo timer fires while
  **nothing is actively watching that scope** — swipe-delete on `/liste`, then navigate to
  a tab that doesn't query board data before the 15 s hold elapses — `findAll` returns
  `[]`, and an empty array's `.every()` is vacuously true. The id un-hid on the spot with
  no fresh frame ever confirmed, leaving the stale pre-delete cache untouched; the next
  time a query for that scope mounted (navigating back), Query painted that stale frame
  first and the "deleted" row flashed back until its own fetch resolved. Fixed:
  `fresh()` now requires `queries.length > 0` — an empty match reads as "not fresh yet",
  not "fresh," so it falls through to the existing subscribe-and-wait path instead of
  un-hiding blind. Guard: new case in `useDeferredRemoval.test.ts` § "deferred-removal
  freshness fence" — **verified red** against the un-fixed code (`queries.length > 0 &&`
  removed) before landing the fix.
- **Offline cold start: a FREQUENT user, offline in a store (weak/stalled signal, not
  clean airplane-mode), saw only a loading spinner — never the board.** Marc's own
  follow-up correction: this isn't a fresh-visitor routing gap, it's a genuine HANG.
  `src/lib/api.ts`'s `fetch` carried no timeout at all — a stalled connection (captive
  portal, a wifi AP fading in a store, any "packets silently dropped, no TCP RST" black
  hole) leaves that promise unresolved forever, not rejected. `AuthProvider.refresh()`
  (`src/lib/auth.tsx`) `await`s it inside `try/finally`, so `loading` never flips false
  if it hangs; the router's `/` entry (`Entry()` in `router.tsx`) renders only
  `<Loading/>` while `loading` is true, with nothing else to force an exit. Two fixes,
  complementary rather than either alone being enough:
  - **`api()` now bounds every request** with an `AbortController` timeout — 20 s for a
    plain call (matches `lib/online.ts`'s own `SUPPRESS_WINDOW_MS`, so a timeout and
    "this looks offline" agree), 60 s for a Blob body (photo/audio/drawing upload,
    legitimately slower and more likely attempted on a weak signal in the first place).
    A timeout rejects with a plain `DOMException`, not an `ApiError`, so `writeWith`
    still classifies it as a transport failure and queues it to the offline outbox —
    the existing contract is unchanged, just now actually reachable. Guard:
    `api.test.ts` § "api() timeout on a stalled connection" — **verified red** by
    reverting the timeout (the mock fetch throws synchronously on the now-missing
    `signal`, proving the test is coupled to the fix, not just decorative).
  - **A returning device also stops waiting on that round trip at all.** A persisted
    `wasSignedIn()` flag (`localStorage`, mirrors `device.ts`'s device-token pattern for
    kiosk) is set on every server-CONFIRMED `auth/me` answer (true or false) and cleared
    on explicit sign-out — never touched on a network failure/timeout, so it survives
    exactly this case. `Entry()` now checks `chosen || isPaired() || wasSignedIn()`
    before ever looking at `loading`, so a known device skips the round trip (and its
    now-20s-bounded wait) entirely and lands straight on `/board` with cached data. This
    is the faster path for a *frequent* user specifically; the `api()` timeout is what
    protects everyone else (first cold visit, a cleared profile, any OTHER query in the
    app that could otherwise hang the same way once past Entry()).
- Both are read-only-mode gaps: correct app state existed (cache, session) but the UI
  didn't trust it. Neither had a prior guard exercising the "nothing is watching" /
  "the network call itself fails" branch — every existing test kept at least one
  active observer, or mocked a real 401 rather than a transport failure.

**A `/code-review high` pass on the diff above (Marc's explicit ask — "make sure
those bugs won't come back") found seven real issues the first pass missed**, all
fixed in the same slice, each with its own regression test verified red first:

- **The timeout only covered the CONNECTION, not the body.** `fetch()` resolves as
  soon as headers arrive; a proxy/captive-portal that answers the handshake and
  then stalls MID-BODY would still hang, one phase later — reproducing the exact
  bug the timeout exists to fix. Fixed: the same timer/signal now also covers
  `res.text()`.
- **The 20 s default was too short for several legitimately-slow AI-backed
  endpoints** (`recipe-import` — which chains its own 20 s server-side scrape fetch
  before structuring, `ask`, `deals`'s multi-term Flipp walk, `capture`'s inline AI
  classification): a slow-but-working call would now abort instead of finishing,
  and for `capture` specifically that meant a genuinely-online write got silently
  queued to the offline outbox. Fixed: `api()`/`WriteSpec` grew a `timeoutMs`
  override, wired at each of those call sites (30–45 s).
- **A `keepalive` request (the undo toast's pagehide flush) got the SAME 20 s
  bound** — defeating the point of `keepalive`, which exists specifically to
  outlive teardown. Fixed: a keepalive request gets no `AbortSignal` at all.
- **`wasSignedIn` would also fast-path a demo SANDBOX visitor** straight past
  `Entry()`'s marketing/login fallback once their throwaway household is swept —
  landing them on a dead board instead. Fixed: never persisted true for
  `isSandboxEmail`.
- **Two overlapping `refresh()` calls (mount + an `onAuthLost` re-check) could
  resolve out of order**, letting a slower/stale answer overwrite a fresher one —
  including `wasSignedIn`. Fixed: a sequence-number guard drops any response
  superseded by a newer request.
- **The vacuous-truth fix's fallback (`cache.subscribe`) had no upper bound** — a
  scope nobody ever revisits for the rest of a (potentially weeks-long, always-on
  kiosk) session leaked one permanent cache listener per orphaned delete. Fixed: a
  10-minute give-up that stops WATCHING (never un-hides on its own — that's the
  90 s-cap bug already fixed once above) if no fresh frame ever arrives.
- **`wasSignedIn`/`rememberSignedIn` hand-rolled the exact localStorage
  get/set/try-catch shape `createDeviceStore` exists to collapse** (CLAUDE.md's
  "build by reuse" rule). Fixed: rebuilt on that primitive.

### C-quinquies. Asked by Marc, 2026-09-02 — the day scene split into « Journée | Repas »

Shipped inside `d7710d5` (three parallel sessions, one commit — this slice was the
day-scene one; the message describes the liste/calendrier and deals slices). What changed:

- **`/kitchen/day/:date` has two faces behind a `?vue=` SubTabs row** (the Voyage
  pattern): « Journée » (default — rendez-vous, corvées, projets, à compléter, the
  Avant-de-partir door) and « Repas » (the full DayEditor). The weather strip and the
  day-note headline stay shared above the tabs.
- **The door decides the landing.** Meal doors → `?vue=repas`: the kitchen grid's
  pencil, the ＋ « Planifier un repas » day picker, the history pencil, a meal search
  hit, the calendar day-⋯ « Planifier un repas ». Day doors → default « Journée »:
  « Voir la journée » (calendar + event/meal peeks), « Planifier aujourd'hui/demain »,
  the SimpleBoard tile.
- **The kitchen day peek carries doors now** — `buildDay`'s zero-actions verdict was
  REVERSED (ACTIONS.md ⁹): « Voir la journée » + primary « Planifier un repas », both
  plain navigations so they survive a read-only guest.
- Guards updated: `day-plan-lean.spec.ts` (faces + guest on both), `kitchen-meal-plan`
  (locks the `?vue=repas` landing), state-matrix `day-plan` budget 178 → 228 (the one
  deliberate chrome addition: the sub-tab row).
- `t.kitchen.mealsHeading` removed (the « Repas » pill names the face; a heading
  repeating the tab is a LEAN smell).

**Follow-up, same day (Marc, on review): the peek's MEALS became doors too.** The day
peek listed its meals as plain text; a meal that resolves a recipe now carries the small
📖 / 🍲 « Cuisiner » pair `MealRows` already gives a planner row — 📖 → the recipe view,
🍲 → straight into cook mode. Per MEAL deliberately: one full-width « Cuisiner » on a day
holding N meals could not say which one it meant. Mechanics:

- The `list` DetailBlock was EXTENDED, not forked: an item is now `string | DetailListRow`
  (`{ text, actions?: DetailAction[] }`), rows reusing the footer's `DetailAction` so they
  close the peek then navigate through the same `runAction` — no second action grammar.
  A plain string still renders exactly as before, so no other adapter moved.
- Both call sites pass `recipeId`: the kitchen week grid (already holds `recipeForMeal`)
  and Historique, which has no recipes of its own and uses `useRecipeForMeal()` with no
  argument — the shared-cache mode that hook was built for.
- A free-text meal (« Salade César ») keeps no buttons: there is nothing to cook. The
  window-level « Voir la journée » / « Planifier un repas » doors are unchanged.
- Both doors are plain navigations (reads), so a read-only guest keeps them; they are
  real `<button>`s, so the non-touch verdict stays ✅.
- Guard: `e2e/kitchen-meal-plan.spec.ts` « day peek — a recipe-linked meal carries 📖 +
  « Cuisiner »… », **verified red** against a planted text-only regression before being
  trusted (the standing rule). ACTIONS.md row + footnote ⁹ updated.

### C-octies. Self-directed sweep, 2026-09-03 — settings write coverage + the parallel-array guard

Picked from this file's own §4/§D backlog (Marc: "do 1, 3, 4 in order, ask about 2").
Each item verified against code first, per the standing rule — one candidate ("`ChoreForm`/
`BlockForm` hand-roll the same member-toggle row") turned out already stale (`ChoreForm`
already goes through the shared face control; `BlockForm` doesn't exist) and was dropped
without doing the work.

**1. Nine new settings-write tests, six previously-silent subs (`0c047b6`).** Measured
before writing anything: 24 subs in `SETTINGS_SUBS`, 17 operator panels that write, and
only a handful had ever asserted a real request. `stores`, `aisles`, `todos` (templates),
`routines` (the ToD chip), `members`, and `tablets` now do — each proven red against a
planted bug (wrong field name, dropped id, missing colour) before being trusted. See
`e2e/config-panels.spec.ts`'s header for why this class of panel fails silently: every
control here commits optimistically, so a broken PATCH looks identical to a working one
on screen.

**3. The parallel-array write path is now structurally guarded.** PARITY's Wave D called
`recipes.steps_images_json` / the routine-card side arrays unconverged; re-checked, the
sync ops already lived in one place (`lib/parallelArray.ts`, unit-tested) since migration
0041 — ten weeks before that note was written. What was actually missing was enforcement
that a writer USES it: three call sites (`RecipeForm`'s import-replace reset, `RoutineForm`'s
template-apply reset ×2) had quietly re-implemented `alignSide` by hand as
`rows.map(() => '')`. Converged onto the shared helper, plus a new build-gating test,
`src/lib/parallel-array-rule.test.ts` (sibling of `write-rule.test.ts`), that fails the
build if a side-array setter is ever fed a hand-built array again, or a new positional
side array is added without registering it. Verified red against both plants. PARITY's
Wave D entry updated in place — the schema stays positional on purpose (never a
churn-only migration wave), but the fragility it named is now contained.

**Hardened same day, from a `/code-review` pass on the session's own commits.** The
guard's first cut had two real enforcement gaps, both since fixed and each re-verified
red against a fresh plant: (1) its OPS check was a substring test over the whole args
text, so a top-level ternary could hide a hand-rolled array behind a real op mentioned
in the OTHER branch — closed with a dedicated `HAND_ROLLED` pattern that flags
`rows.map(() => '')`-shaped code unconditionally, wherever it sits in the expression,
rather than trying to anchor the whole-expression check (tried and reverted — it broke
every real call site, all of which use the `setX((prev) => opCall(...))` functional-
updater form). (2) the bare-`[]` exemption ran BEFORE the `ALLOWED` lookup, making the
two documented `ALLOWED` entries dead code and silently exempting any future `setX([])`
anywhere with no reasoning required — folded into the same ALLOWED gate instead, so an
un-listed `[]` is now a violation like anything else. Also fixed in the same pass: the
tree-walk was reading all of `src/` twice per run (once per `it()`); now read once and
shared. `sources()`/`blankComments()` were also a byte-for-byte third copy of
`write-rule.test.ts`'s — extracted to `src/lib/buildGuardScan.ts` and both files
converged onto it (safe because the two were identical; `nested-interactive.test.ts`'s
variant genuinely differs — different extensions scanned, different comment logic — so
it was deliberately left alone rather than risking an already-trusted guard for
cosmetic reuse). `blankComments` itself also gained real block-comment stripping,
string-aware this time — the naive version briefly regressed `write-rule.test.ts`
(`IntakeForm.tsx`'s `accept="image/*"` looked like a comment opener and swallowed a
real `api()` write between it and the next JSX comment), caught immediately by that
file's own "every exception still exists" self-check before it ever reached a commit.

**4. Tooling hygiene — mostly already done, one real fix.** §E's "configure away
knip's noise" turned out stale: `ignoreExportsUsedInFile` was already set the same day
that bullet was written (`421aa91`, 2026-08-27) — nothing to configure. Confirmed local
knip still can't run to re-verify the live count (same environmental `oxc-parser`
crash); CI's is the run that counts, unchanged. The stray `.code-workspace` stub was
real: moved from `src/pages/` to the repo root rather than deleted — its `path` pointed
back at the repo root, reading as Marc's live workspace shortcut, and deleting an
untracked file outside git's safety net on a guess would have been the wrong kind of
clean-up for something this small.

**The §D judgement calls, asked and answered the same session** — see below, each now
struck through with its verdict.

~~**Found in passing, not yet acted on:** `AisleOrderSection`'s reorder is drag-only —
`DragPill` has no button/keyboard mirror, which the desktop-reachability rule (this file's
own standing rule) forbids.~~ ✅ **Done same day — and it was systemic, not a one-off.**
A follow-up `/code-review` + UI/UX audit (below) found the same gap at **all 8** of
`DragPill`'s call sites, one of them `boardLayout.tsx` — the panel CLAUDE.md itself
documents as the board's "ACCESSIBLE MIRROR", drag-only despite the name. Fixed once in
the shared component (an `onMove?: (dir) => void` prop makes the grip a real Tab stop
with ↑/↓, copying the pattern `pages/Liste.tsx` had already hand-rolled outside the
shared component instead of in it) and wired at all 8 sites + the DevKit gallery.
`e2e/board-customize.spec.ts` gained a test, verified red against a planted regression
(the tabIndex removed) before being trusted. `components/board/CardSlot.tsx` (the live
2D board grid) was NOT touched — it hand-rolls its own grip rather than importing
`DragPill`, and its documented keyboard door is `boardLayout.tsx` itself, not a direct
one on the grid (arrow-key semantics across a 2-zone masonry layout have no obvious
meaning, so guessing one wasn't in scope for "apply the existing fix"). The
`<Reorder>`-primitive angle in the original finding turned out to be a red herring —
`Reorder` is `EditField`'s own up/down button pair for a plain list, a different
shape from a shared drag grip; `DragPill` gaining `onMove` is the actual fix.

### C-nonies. Self-directed review + audit, 2026-09-03 (continued) — reviewing today's
own work, then a fresh UI/UX pass with no new features

Asked by Marc after the four commits above shipped: "review our work then look for more
improvements on ui/ux — no new features, only improvements or uniformity." Two tracks,
run in parallel as background agents.

**`/code-review` on the session's own four commits (`66fb663..1a1fb09`).** Production
code (the stopwatch removal, the `alignSide` convergence) came back clean. The new guard
test itself, `parallel-array-rule.test.ts`, had two real enforcement gaps: its OPS check
was a substring scan over the whole args text, so a top-level ternary could hide a
hand-rolled array behind a real op mentioned in the OTHER branch; and the bare-`[]`
exemption ran BEFORE the `ALLOWED` lookup, making the two documented entries dead code
and silently exempting any future `setX([])` with no reasoning required. Both fixed —
see the guard-hardening commit (`5f1bc56`) for the detail, including a real bug caught
mid-fix (a naive block-comment strip briefly broke `write-rule.test.ts` on
`IntakeForm.tsx`'s `accept="image/*"`, caught by that file's own self-check before it
reached a commit). Also converged `sources()`/`blankComments()` — a third identical copy
of `write-rule.test.ts`'s — into `src/lib/buildGuardScan.ts`.

**A fresh UI/UX uniformity audit** (explicitly no new features — reuse gaps and
inconsistencies only), re-verified against code rather than read off the docs:

1. **`DragPill` had no keyboard mirror at any of its 8 sites** — see above, done.
2. ~~`Chip` not adopted at its last two stragglers.~~ ✅ **done.** `recipesTags.tsx`'s
   tag-name label and `recipePills.tsx`'s pill-name label + its tag-pick multi-select
   toggle converged onto `<Chip>`; zero hand-rolled `.chip` spans left in either file.
   COMPONENTS.md's uniformization row 2 updated in place.
3. ~~`VoiceButton.tsx` hand-rolls error text instead of `StatusMessage`.~~ ✅ **done —
   and a 4th site turned up while there.** `operator/micTest.tsx` hand-rolled the exact
   same `list-add__voicemsg` class for its own listening line, missed by the original
   audit (it only grepped `VoiceButton.tsx`). All four converged onto `StatusMessage`
   (`tone="error"`/`"info"`); the dead `.list-add__voicemsg`/`--err` CSS removed from
   `list-actions.css`. One deliberate behaviour change, not a bug: the two denied/error
   lines move from `role="status"` (polite) to `StatusMessage`'s `tone="error"` →
   `role="alert"` (assertive) — matching how every other error line in the app already
   announces, which is the whole point of converging onto one primitive. No existing
   unit or e2e coverage existed for `VoiceStatus` to begin with (checked, none found);
   none added — the swap is markup-only, same conditions, same text, and a Web
   Speech-mocking harness from scratch is out of scope for a uniformity fix. COMPONENTS.md
   rows 2 (VoiceButton entry) and 6 updated in place.

Checked and confirmed already clean (worth recording so it isn't re-investigated):
`RowActions` adoption, `EmptyState` usage, `useConfirm` usage (no bare `window.confirm`
anywhere), hand-rolled flex rows outside `Cluster`/`Rail` (only hits were in DevKit, not
user-facing), and PARITY's full Part-4 ranked backlog (all resolved, including Wave D
above).

### C-decies. Asked by Marc, 2026-09-03 (evening) — "I press buttons but what I see is
not what I thought it would do"

A different lens from C-octies/C-nonies' code-reuse audits: this one hunts USER-FACING
predictability — does a button's icon/label correctly promise what happens on tap?
Calibration was C-septies' own "Vider la journée" fix from earlier the same day (a
label that over-promised scope). A fresh audit found the icon-side twin of that bug:

**`arrow-counter-clockwise-bold` carried 7 unrelated meanings across ~13 real buttons**
(32 raw uses total, but ~13 of those are a recurring "leftovers/restants" CONTENT tag,
not a button — correctly left alone). A user who learns "counter-clockwise arrow = undo
one small thing" from `DrawPad` had no visual reason to expect the same glyph on the
aisle-order screen to discard their whole custom order — with no confirm behind it
either. Verified against live code (not just the audit's word) before touching
anything; one correction found in the process: `boardLayout.tsx`'s reset button doesn't
actually use this icon at all — it had NO icon, text-only, so the audit overcounted it.

Fixed by splitting the meanings, not by picking one winner:

- **Kept** `arrow-counter-clockwise-bold` for its one canonical meaning — undo one
  action (`DrawPad`). Everything else moved OFF it.
- **Reused two already-distinct existing icons**, no new assets: `play-bold` for
  "replay from the start" (`RoutinePlayer`'s « Recommencer » — restarting a routine
  IS playing it again, a better semantic fit than a rotation icon); `crosshair-bold`
  for "reset zoom to center" (`PanZoom`).
- **Added 4 new icons** to `pipIcons.ts` (real Phosphor bold SVGs, fetched via curl
  from `unpkg.com/@phosphor-icons/core@2` per the file's own documented process —
  never hand-typed path data, and each rendered as a standalone SVG + screenshotted
  before trusting it, since a garbled path fails silently as a blank glyph):
  `arrow-clockwise-bold` (retry/reload — `DealsBrowser` ×2, `PriceMatchPage`),
  `eye-bold` (show-again — `CashierMode`'s « Tout réafficher », a genuinely better
  fit than a rotation icon for "make things visible again"), `arrow-u-up-left-bold`
  (restore a deleted item — `CarnetsTab`), `arrows-counter-clockwise-bold` (the
  fuller double-arrow, for the highest-stakes meaning — **discard ALL customization
  to factory default** — `aisles.tsx`, `meals.tsx`, `display.tsx`'s measure-colours,
  and `boardLayout.tsx`, which now gets an icon for the first time).
- **All 4 factory-reset buttons also gained a `useConfirm` guard** (`tone: 'default'`
  — a preference reset, not data loss, so no trash icon / danger styling), sharing
  one new i18n key `t.operator.resetConfirm`. This was the audit's #2 finding,
  folded into the same fix since it compounds #1: the icon collision made a full
  wipe read as a small undo, and nothing stood between the tap and the wipe.
- **Left alone, by design:** `ambient.tsx`'s replay button (explicitly dev-only
  tooling, not user-facing — "Dev tooling (the idleDebug spirit)"); `VoyageShareModal`'s
  link-reset and `VoiturePage`'s week-reset (both low-frequency operator surfaces;
  the latter already carries `tone: 'danger'` styling, so it isn't visually
  unmarked the way the other four were).
- Two e2e tests updated for the new confirm step (`board-customize.spec.ts`,
  `config-panels.spec.ts` — the latter written earlier THIS session for the aisle
  reset, so this is that test's own guard catching its own subject changing under
  it). `.confirm` scoping used since the dialog's confirm button repeats the
  trigger's label verbatim.

Checked and confirmed already clean by the same audit: `aria-pressed` toggles all
pair with a visible state class (~45 sites checked — no "I tapped it, nothing looked
like it happened" bugs); every `Vider`/`Effacer`/`Réinitialiser` label's actual scope
matches what it says (Board Notes' « Tout effacer » does clear exactly the shown set);
`caret-up/down-bold`'s dual meaning (collapse vs. reorder) reads fine in practice —
reorder always renders as a paired ↑↓ set, collapse as a lone directional caret, no
real ambiguity; every `❌`-flagged undo gap in ACTIONS.md already carries a recorded,
deliberate reason.

**Follow-up same day, three more passes (Marc: "review flow across sections and
uniformity when editing, viewing").** Split into view/peek flow, edit-door flow, and
cross-section navigation flow — each independently re-verified against current code,
not against this file. **Verdict: already solid.** Every candidate the three passes
surfaced turned out either already correct-by-construction or a documented, deliberate
split (create-vs-edit door "mismatches" for events/home-projects, member-vs-pet edit
doors, no silent auto-saves anywhere, no dead-tap rows, `x-bold`/FAB/undo-toast all
uniform). Two genuinely-open, low-severity items survived:

- **Fixed**: `buildMemberPerson`'s primary "Fiche complète" action and its own
  "Relier à quelqu'un" action (`src/components/detail/adapters.ts`) shared
  `users-three-bold` — two DIFFERENT actions in the SAME peek sheet, the same
  failure class as the arrow-icon fix above. `users-three-bold` is `connect`'s
  correct, established, app-wide meaning ("connect people" — same glyph AddSheet's
  own category and `ConnectPeople`'s save button use); `detail` was the intruder,
  swapped to `arrow-up-right-bold` ("step out to a fuller view" — its existing
  meaning everywhere else it's used: share, open-in-new-tab, export).
- **Fixed same day, on Marc's ask** ("fix 1 then ship"): `arrow-left-bold` also meant
  "reply" (a mot's peek action + `MotComposer`'s "en réponse à" context line)
  alongside its ~10 other, correct "go back a step" uses. No existing icon fit
  without recreating the same collision elsewhere (`envelope-bold` already means
  "mot," `arrow-u-up-left-bold` already means "restore a deleted item," `link-bold`
  already means "share/copy a URL"), so `arrow-bend-up-left-bold` was fetched from
  `unpkg.com/@phosphor-icons/core@2` and rendered standalone (Playwright screenshot,
  side-by-side with an existing icon) before trusting the path data, per
  `pipIcons.ts`'s own documented process. `arrow-left-bold` now means exactly one
  thing app-wide.

### C-undecies. Reported by users, 2026-09-03 — the photo→recipe read "hallucinates"
(1/2 tasse → 1/3; 225 g (1/2 lb) → « 2 tasses ») + how columns are read

A full audit of the photo→recipe pipeline traced the two complaint classes to two
DIFFERENT causes — the worse one was **our own repair code, not the AI**:

- **`repairImperialFromMetric` trusted the ml side unconditionally** and overwrote a
  perfectly-read « ¼ de tasse » whenever the ml was the mis-read side (a 6 read as an
  8) — and the rewritten line, now self-consistent, sailed past the verify panel's
  mismatch flag. **Fixed**: gated on the paren amount being actually unreadable
  (`findMeasures(inner)` empty); a legible disagreement is flagged, never rewritten.
  Band tightened 0.55–1.8 → 0.7–1.45 (a 6↔8 misread is 0.64×) + a g↔lb cross-check.
  Guard proven against the pre-fix code (3 red) before trusting it.
- **The "faithful, no-AI" path was the exception, not the rule**: one OCR-garbled
  heading and the whole transcript went through the generative 70B (`structureRecipe`)
  whose prompt never forbade unit conversion — the « (2 tasses) » class. **Fixed**:
  verbatim-quantities/no-conversion rule in the prompt (FR+EN), `max_tokens` 900→1700
  (truncation read as "doesn't resolve"), commentary-stripping, AND a structural guard —
  `linesWithForeignNumbers()` cross-checks every output number (and number+unit pair)
  against the source transcript; foreign lines come back as `suspect`, flagged « à
  confirmer ». Markdown-shaped transcripts (the cloud Mistral reader answers in
  markdown, tables included) now flatten through `parseRecipeText()` and hit the
  deterministic parser — the accuracy the cloud reader was bought for no longer
  falls back into the AI.
- **"Doesn't resolve"** was infrastructure: tesseract's ~15 MB traineddata comes from
  a CDN on first read with no timeout (spinner forever), and a failed create was
  cached null for the session (every later read silently used the vision fallback).
  **Fixed**: 60 s create timeout, retry-on-next-read, `engineFailed` → its own honest
  message (`readFailEngine`).
- **Columns** (`columnizeOcrPage`): a genuine full-width body line (meta/intro) used to
  be CHOPPED at the gutter mid-phrase (only display-size lines were exempt). **Fixed**:
  a line with a word physically crossing a gutter is kept whole — the merge artifact
  this function un-merges has the opposite signature (fragments each side, gutter empty).
- **The verify panel flagged every fraction line** (contradicting its own comment) —
  alarm fatigue meant the one real flip was skimmed past. **Fixed**: risky-only flags
  (mismatch / unparseable amount / shaky word / AI-changed number), and the dead
  `c. à` unit check came alive (JS ASCII `\b` after « à » — the exact gotcha
  measure.ts documents — replaced with a letter-lookahead).
- **New: the « Rapport » tab** in `RecipeReadReview` — pipeline honesty for the cook:
  which reader ran (on-device Tesseract / cloud `mistral-ocr-latest` / vision
  `llama-3.2-11b`), OCR confidence, columns detected, how the text was organized
  (headings = no AI / AI with the model named / heuristic), each metric→fraction
  repair (before → after), the numbers that could not be traced back to the photo,
  and the shaky-word count. Endpoints return `structuring`/`model`/`suspect`;
  `readPhoto` builds the report as it actually runs. DevKit specimen + both e2e specs
  (`recipe-read-review`, `recipe-photo-import`) exercise the new taxonomy and the tab.

Still open (deliberate): multi-photo `mergeOcrPages` can swallow an ingredient when
two different lines share qty+unit+connector tokens (Jaccard 0.55 on 5-token lines);
and a qty-column | name-column print layout could still read as two columns. Both need
real-photo corpora to tune against — not guessed at.

### D. Judgement calls waiting on Marc, not on code

- ~~**A done state for a planned meal** (the supper hero headlines tonight's supper all
  evening; « Marquer mangé » exists only on a leftover peek).~~ ✅ **answered
  2026-09-08: leave it — the hero is a plan, not a tracker.** Declined, not deferred;
  don't re-propose without a new observation.
- ~~**The cashier's second ✓ / the staples chips** (bmad/11 tier 3, the two flow-audit
  design questions).~~ ✅ **answered 2026-09-08: won't do**, both. Recorded as `[~]` in
  bmad/11 so they stop being re-litigated.

- ~~**`ARM_MS` 6s → 10s** on the toddler tiles.~~ ✅ **answered 2026-08-28: 6 s stands.**
  `bmad/history/AUJOURDHUI.md` now has no open boxes at all. Declined, not deferred — don't
  re-propose without a new observation.
- ~~**Review-queue counts** in intake/postbox section titles.~~ ✅ **answered
  2026-09-03: keep.** The no-counts tenet targets household-facing gamification
  (streaks, ranks, tallies of who did more); an operator-only work queue's depth is
  operational information for deciding whether to open the section, not a score. No
  code change. Declined, not deferred.
- ~~**Routines invalidate `BOARD_KEY` but never surface on the board.**~~ **Stale,
  re-verified 2026-09-03 — both halves.** The "possible missing feature" already
  ships: `RoutineNextCard.tsx` is a registered board card (`routineNext` in
  `lib/boardCards`) reading `ROUTINES_KEY` directly. And the invalidate is not dead
  either — `/api/board` returns no routine data, and the co-invalidate sites
  (`household.tsx:334`'s member save, `Operator.tsx:174`'s refresh-all) are broad
  cache refreshes where `BOARD_KEY` is warranted alongside `ROUTINES_KEY`, not a
  routine-specific write with nowhere for it to land. Nothing to decide or fix.
- ~~**Two timers on screen at once** on a timed routine step.~~ ✅ **answered
  2026-09-03: drop the run stopwatch entirely.** The per-step countdown ring stays
  (it serves the task — a 2-minute brush); the session stopwatch goes (elapsed time
  per run is the raw material a personal-best score would be built from, closest to
  the calm stance). `RoutinePlayer.tsx` — parent-only rendering removed, along with
  its dead-code trail.

### E. Tooling gaps found during this cleanup

- ~~**`knip` is not a gate, and currently does not run.**~~ ✅ **wired into CI 2026-08-27**
  (it still crashes locally on this machine — environmental — so the CI run is the one
  that counts), and `ignoreExportsUsedInFile` collapsed 58 findings to 7 real ones.
  The original finding, for the record: it was absent from `.github/workflows/ci.yml`,
  and on this machine it now crashes every time (`oxc-parser` `RangeError: Array buffer
  allocation failed`) — it ran once earlier the same day, so it is environmental, but the
  "dead-code gate" is neither gating nor runnable. Either fix and wire it, or stop calling
  it a gate.
- ~~**Its signal is buried anyway.**~~ ✅ **already configured away, same day as the
  gate wiring (`421aa91`, 2026-08-27).** `knip.json`'s `ignoreExportsUsedInFile: true`
  is exactly the fix this bullet asked for. Re-verified 2026-09-03: local knip still
  can't run to confirm the live count (the same `oxc-parser` `RangeError: Array buffer
  allocation failed`, environmental to this machine — CI's is the run that counts).
  Nothing left to configure; this bullet was stale.
- ~~`src/pages/PlannerOrSomething.code-workspace` — a stray VS Code stub.~~ ✅ **moved
  2026-09-03**, not deleted — its `path` pointed back at the repo root, so it reads as
  Marc's active workspace shortcut rather than a build artifact; deleting an untracked
  file outside git's safety net on a guess would have been the wrong kind of clean-up.
  Now `./PlannerOrSomething.code-workspace` (repo root), `path` corrected `"../.."` →
  `"."`. Still git-ignored; nothing to commit.

### G. The 100-screenshot pass — 2026-09-10, and what LOOKING found

Marc asked for every PNG in the sweep to be opened, not sampled. All 100 were. Each
claim below was then **grepped against code before being written down** — two of the
first candidates died that way (the toddler nav's icon-only exit is documented and
keeps its `aria-label`; « Système » vs « Réglages » is the settings THEME's name, and
the six themed tabs mirror the hub on purpose). What survived, ranked by user harm:

- [x] **The EN board greeting truncates: « Good afterno… »** at 390px, where FR
      « Bon après-midi » fits. `.greet` carries `clamp(16px, 4.4vw, 32px)`, added
      2026-07-14 for exactly this bug in FR (« Bon apr… ») — the fix under-shoots by a
      few px in the other language. A viewport `vw` clamp is a guess at the room left
      by four fixed-width round buttons; a container query would know.
      **Fixed 2026-09-10** — sized off `.app-head__main` with `cqw`, which IS the room
      (the button cluster is a fixed 197px), and allowed a second line when one truly
      will not do. 320px keeps the ellipsis on purpose. `e2e/greet-fit.spec.ts` holds
      both languages at 360/390/430; proven red on the old clamp in exactly the three
      measured cases.
- [x] **« Maisonnée » has an invisible glyph in LIGHT theme** — the mobile face
      dropdown (`FaceSelect`'s collapsed chip) draws a white household glyph on a white
      disc. `notes-night` renders it fine and so does the wall's face ROW, which is how
      it was caught: the day/night pair is the tell. Board, habits and the wall all
      show the icon; only the light-theme dropdown eats it.
      **Fixed 2026-09-10** — all three `--all` avatars carry ink on paper, and the wall
      face keeps its tint when selected. The chip had no rule at ALL, which is why it
      was invisible rather than merely faint.
- [x] **The birthday YEAR field clips its own placeholder** — « Année (o| » on the
      new-person, new-pet AND intake forms (one shared three-up row: Mois · Jour ·
      Année at 390px). A filled year fits; only the placeholder is cut, which is the
      one thing an empty form has to say. `composer-fit.spec.ts` already holds « the
      placeholder must fit » for composers — this row is outside its reach.
      **Fixed 2026-09-10** — the fixed basis is a container query now, so the year takes
      its own line on a phone. `composer-fit.spec.ts` grew a scene-form block for it,
      and that guard immediately caught a regression the fix was about to ship: size
      containment stopped the row feeding its own intrinsic width, and on the pet form
      (a wrapping-flex parent, unlike the person form's grid) it collapsed to 0px.
- [x] **Three words for one idea: everyone.** « Maisonnée » (board · Notes · Maison),
      « Toute la maisonnée » (the habit form's scope), « Tout le monde » (Voyage's face
      picker, `i18n` `everyone`). `glossary.ts` settles the winner — `maisonnee` — and
      its own definition spends « tout le monde de la maison » as the EXPLANATION of
      the winning word. UNIFY's `RIVAL_CEILING` never declared this rival, so the
      ratchet cannot see it. Declaring it is the fix; renaming a user-facing word is
      Marc's call, which is why this is a box and not a commit.
      **Settled by Marc 2026-09-10: « Maisonnée » everywhere.** Four call sites feed one
      picker; three spelled it differently, and EN's board said "Everyone" while every
      other EN surface said "Household". One word per language now, the dead
      `cercle.everyone` key deleted, and the rival declared on the glossary term with
      `RIVAL_CEILING` floors of 2 — a sentence about the car and a genuinely open intake
      link may still say « tout le monde »; a face picker may not.
- [x] **The routine builder shows five always-open chips under EVERY step**
      (Minuterie · Le truc · Enregistrer ta voix · Ajouter une photo · Dessiner) —
      three chip-rows per step, so a four-step routine is twelve rows of secondary
      controls. `Disclosure` is the primitive for exactly this.
      **Fixed 2026-09-10** — one quiet « Minuterie, truc, voix, photo… » line per card,
      single-open, and the whole four-step routine now fits on one screen with its
      footer. The invariant is the interesting half: a card that CARRIES an aid renders
      the row open and shows no summary at all, because a fold in front of a filled
      field is how a household loses what it set (`e2e/routine-aids-fold.spec.ts`,
      red when `hasAid` is removed). `routine-tips.spec.ts` gained the new door in the
      same commit — the path a parent takes moved, so the spec that drives it moved.
- [x] **Toddler « Les notes » is not picture-first.** It says « Touche l'image pour
      l'écouter » and then draws the same generic document glyph on every tile; the
      only thing telling two notes apart is a WORD, to a pre-reader. `kitchen-toddler`
      and `liste-toddler` are genuinely picture-first (food, groceries) — this tab,
      the last to get a toddler lens, kept the shape without the pictures.
      **Fixed 2026-09-10** — a picture from the first source that knows one: the note's
      OWN drawing/photo, else a picto from the title and then the body (`pictoFor`, the
      list rows' map — « Garderie » → 🏫, « la marque de lait » → 🥛), else the kind
      glyph in the author's tint, which stays a legitimate tier. `e2e/toddler-notes.spec.ts`
      holds all three AND that four tiles never share one picture — "they all render
      something" is not the same as "you can tell them apart", which was the old state.
- [~] **Maison ▸ Routines on the 1280px wall keeps phone-width cards** — two cards in
      one narrow column, more than half the screen empty. The kitchen's wall view
      stretches; this one does not.
      **WRONG — measured 2026-09-10 and parked.** On the wall the grid IS three columns
      of 318px across 986px (`.routines-grid` is `auto-fill, minmax(15rem, 1fr)` and the
      width cap is lifted for this page in hub.css). What the screenshot shows is the
      FIXTURE: one routine in « Soir », one in « Matin », and each moment bucket renders
      its own grid — so every row holds one card because there is one card to hold. A
      household with three morning routines gets three across. Nothing to fix; parked so
      it is not re-found by the next person who looks at that PNG.
- [x] **The garde-manger ticks a SQUARE box; La liste ticks a ROUND one** — same idea
      (« I dealt with this »), two shapes, on two tabs a person moves between while
      cooking. Its rows also carry no picto where the list's do.
      **Fixed 2026-09-10, and it was not only cosmetic**: `.act .check` is a 30px disc
      with a 44px hit area (a documented touch-target fix, AUJOURDHUI §5) and a sage
      done-fill; CheckRow drew a bare `square-bold` GLYPH with neither, on the surface a
      parent taps while cooking. The disc now names its hosts —
      `.act .check, .checkrow__check .check`. The first attempt made it a bare `.check`,
      which looked equivalent and was not: `TodoSection` also writes `className="check"`
      and had never sat inside an `.act`, so the class was INERT there and its rows drew
      their own empty circle. Going global turned them into bare ✓ glyphs — caught in the
      next screenshot of `day-plan`. A selector list says who opted in; a bare class
      conscripts whoever happens to share the word. (The missing picto is left: a pantry
      row is a word a parent typed, not a catalogued item, so `pictoFor` has less to go
      on there than on the list.)
- [x] **« Montrer à la caisse » — the evidence a till accepts, and where it comes from.**
      Marc, 2026-09-10: a cashier must not refuse the app « just because it's not one of
      the three » — Flipp, reebee, Glouton — « it does the same thing ». And his pushback
      on my first answer was right: pointing a cashier at the OFFICIAL flyer page means
      hunting for the item on it, which is precisely the friction this app removes.
      **Shipped** — our card stays the thing shown at the till, and it now carries what
      the three are trusted for: the store, what it matches, product + size, big price,
      **unit price** (what a match turns on; an AI-inferred size wears ≈), the **validity
      span**, and a provenance line — « Circulaire Super C · via Flipp ↗ » — that names
      the source and links the official page in one tap. « Voir la circulaire » opens our
      reconstruction **on the item, circled** in marigold (the category convention).
      What I would not do, and said so: style it to read AS Flipp. That deceives the
      cashier rather than convincing them, and collapses the moment anyone looks closely.
      Naming the source is the honest version of the same argument.
      Found on the way: `FlyerViewer` kept a LOCAL `money` printing `$4.99` under a French
      UI while the card one tap back said « 4,99 $ » (the date formatter had been unified
      into lib/deals for exactly this reason; money hadn't); and the `flyer` detail
      fixture hard-coded June ISO dates, so the flow showed two weeks — both fixed.
      **« Montrer Flipp » — shipped 2026-09-10 (evening), and it settles ❓ #2 as far
      as a till is concerned.** Marc: « try it out as a clear Montrer Flipp ». The
      question was whether Flipp has an ITEM-level public page, since his objection to
      the flyer page was hunting for the item on it. Probed in a real browser with a
      live id (Lactantia at Adonis, valid that week): **`flipp.com/fr-ca/item/{flyer_item_id}
      ?postal_code=…` renders Flipp's own proof** — store logo, clipping photo, name,
      price, « Valide du … au … », format in the description, Flipp's own "the flyer has
      precedence" disclaimer. Three facts the probe fixed, each now a guard in
      `e2e/cashier.spec.ts`: `/flyer_item/…` is a 404 (do not "fix" to that shape);
      `en-ca` redirected to a broken "Undefined store" page, so the locale is pinned to
      fr-ca whatever the UI language; and WITHOUT a postal code the page renders Flipp's
      error state — so the door is not built at all without one (a dead link is worse
      than none at the moment a cashier is waiting). Both guards proven red on the exact
      wrong shapes. The postal rides the shared `HOUSEHOLD_KEY` cache (the aislePrefs
      idiom). We already held the id: `deal.id` IS Flipp's `flyer_item_id`. The live
      payload also carries `merchant_logo` and `clipping_image_url` — so ❓ #3's nulls
      are only ever the fixture's.
      ❓ The acceptance RULES were never read — `maxi.ca/fr/unbeatable-legal` renders as
        an SPA shell. Identical vs comparable item, printed vs on-screen, limits,
        exclusions: still unknown. Paste the terms and the card can be scored against them.
      ❓ Whether Babillard may present Flipp-sourced data as a price-match source AT ALL
        is licensing, not layout (the data limit: cutouts only, link out). Unsettled.
      **Settled 2026-09-10 (night): a Flipp list cannot be pre-filled from outside** —
        flipp.com's add is that browser's own localStorage (no request), the list page
        reads no URL param, the app's list is account-synced with no write API. The
        till grid steps through it with Flipp's own button instead (« Ajouter à Flipp ·
        n de N » + « Ma liste Flipp »); see §3 « Any way to pre-create the list… ».
        **Then reopened and answered the other way (late night):** a BOOKMARKLET runs on
        flipp.com's origin and can write that storage — proven live on their real list
        page with three stores. `lib/flippList.ts`; « Ma liste Flipp » copies, the
        bookmark pastes, and a signed-in Flipp merges it into the account (their own
        `joinLocalList`). See §3 « … yes: a bookmark that runs on flipp.com ».
      ~~❓ Store logo and product picture are null in the fixture, so the card has never
        been photographed looking like an ad rather than a receipt.~~ **Closed 2026-09-10
        (night):** the fixture carries both now and `cashier-peek` was read wearing them —
        see §3 « The till card wears the shape a cashier already knows ».
- [x] Smaller, all photographed — and **four of the five were wrong**, which is the
      entry worth reading. Only the first was real: **the drawings tile footer
      collided** (the 📌 is `position:absolute` and `.drawgallery__item` — its
      positioned ancestor — is TALLER than the drawing, so `bottom` put it over the
      credit; measured, the pin's box x 21–45 sat on the author's face and name at
      x 16–59). Both overlays are on the picture now, and
      `e2e/drawings.spec.ts` measures it (red on the old position, on both tiles).
      The other four died on inspection, each because the code already had a reason:
      · **the empty list's three controls are all meaningful** — 🔍 browses the
        FLYERS (not the list), ⚡ restocks past items (the most useful thing on an
        empty list), ⚙ is a device-local display pref; the one control that does
        depend on contents, aisle sort, is already gated on `list.length > 1`.
      · **tile grids DO stretch** — measured 196/196 (`jouer`) and 197×4
        (`kitchen-recipes`). What read as ragged was a third tile alone in its own
        row, which is what a grid does.
      · **quickadd's pale discs are a designed state** — `.aisle-pip.is-auto` is
        dashed at 0.75 opacity on purpose: « an untouched (auto-guessed) aisle stays
        quiet ».
      · **the ideas drawer's ⚙ is deliberate** — its own comment: right-aligned on a
        quiet line because it is the only door back to ✏️/🗑, so it cannot be
        host-optional.
      A screenshot shows what a surface LOOKS like; it cannot show what a line of CSS
      was for. Four of nine findings from the sweep needed the code to settle them,
      and the ratio is the point — not a reason to stop sweeping, a reason to keep
      grepping before building on a cell.
clock) while every row reads « dim. 8 juin », « lun. 9 juin » (the shared fixture,
anchored a year back at `MMID`). The kitchen week has the same split — it labels the
fixture's Sunday « AUJ. » on a Thursday, because the meals API's contract is "the
window starts today" and the app honours it. Neither is an app bug; both mean a
reviewer cannot judge the one thing those screens are FOR. The fix is a matrix-local
fixture override (rebase `MEALS`/the car week onto the sweep's clock), not a change to
the shared mocks 126 other specs freeze at `BASE`.

### F. Not a backlog — do not mine these for work

`bmad/05` (21 never-built ideas), `bmad/06` (lifestyle ideas),
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

4. **Audits are produced faster than they are acted on.** bmad/11 generated 33 verified
   seams; none were approved; the document has stood as a permanent unfixed inventory for
   six weeks. bmad/05, bmad/06 and PLAN-mots add ~45 more designed-but-unbuilt
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
   in bmad/11 — because they were parked in a file the "next steps?" survey treated as
   settled. The ranking in §4 is the correction.

### The four changes worth making

1. ~~**Decide bmad/11 tier-1.**~~ ✅ **done** — all five closed (2026-08-27/28), and tier 2
   with them. The decision never needed to be a five-seam grouping: taken one at a time,
   verified in code first, five of the fourteen turned out to be already fixed.
2. **Turn the `useWrite` rule into a test** (`write-rule.test.ts` + allowlist), and fix
   `/share` as its first customer.
3. ~~**Adopt one checkbox convention**~~ ✅ **done 2026-08-28** — legend at the top of each
   live ledger, template boxes stripped from `PARITY`/`ACTIONS`, ⚪ banners on the three
   idea pools, and the canonical statement in §2.
4. **Maintain this file, and freeze new audit docs** until the existing pools are decided
   or deleted. ✅ **Partly done 2026-08-28**: the three *finished* ledgers moved to
   `bmad/history/` (with a README saying why they're kept and not to mine them), so the
   root now holds ten files instead of thirteen and none of them is closed.
