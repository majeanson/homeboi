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
| **Schema** | 143 forward-only migrations (0143 = la table `mots` s'en va) |
| **Tests** | 2 452 unit tests in 195 files · 124 real-runtime cases in 19 files (`npm run test:d1`, the Worker in workerd against a real D1) · 157 Playwright spec files |
| **Deploy** | Push to `main` → CI (typecheck · test · build · bundle budget · **test:d1** · knip) gates `db:migrate:prod` + `wrangler deploy`. E2E is decoupled (`workflow_run`), runs after a green CI, never blocks the ship. |
| **Second interface** | `/api/mcp` — read-only over the household — of the 12 tools, most proxy a GET handler that already exists, so the caps, the recurrence expansion and the time zone are decided once and inherited. (This row lives HERE, not in §3: docCounts derives that number from the registry, and the claim died the first time §3 rotated.) |
| **Households in production** | **Six** real, re-counted in D1 on 2026-09-29 — Marc's (4 members), four other real accounts from the invite gate, and the legacy read-only demo singleton — plus two live 24 h sandboxes. **Zero signups in the five days since the gate opened (09-24)**: the door works (the weekly stranger walk is green), nobody has come through it yet — and whether nobody CAME is now answerable: the nightly mail counts trials opened, kept and refused at the cap, and direct signups (0141, `_lib/strangers.ts`) |

*(Numbers rot: re-run the commands before quoting them — `docCounts.test.ts` holds the derivable ones.)*

### Health signals

- `npm run typecheck` · `npm test` · `npm run test:d1` · `npm run build` · `npm run check:bundle` · `npm run knip` — green 2026-09-29 (TypeScript 7), and all six gate the deploy.
- `npm run e2e:ci` — CI's E2E job is the standing whole-suite signal, and it chains off
  CI, so **a red CI means no E2E ran at all** (that hid three commits' worth of failures
  for a day). It cannot be finished on Marc's machine: two attempts died of memory
  pressure on 2026-09-22 (a V8 heap OOM, then Vite itself refusing connections mid-run).
- `npm run e2e:sw` — 5 passed (the kiosk's offline reboot, against the real PROD bundle).
- `npm run check:bundle` — the door's static closure is **9 chunks / 522 KB** (was 70 /
  1 131 before the hub went lazy); every chunk within budget; the SW precache covers all
  offline-needed chunks and skips build metadata.
- **The build-gating invariants** are the codebase's best feature (§5), and the list is
  long enough that it belongs where it is enforced rather than here: every one lives in
  `src/lib/*.test.ts`, `functions/_lib/*.test.ts`, `scripts/*.test.mjs` or
  `scripts/check-bundle.mjs`, each with a header saying what it caught. Three joined on 2026-09-19: `csrfExempt`
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
> a number you can trust. It reads **0** — §4-K's last box (the retired
> `LOGIN_PASSWORD` secret) closed 2026-09-29. **Asserted from the boxes themselves** by
> `src/lib/docCounts.test.ts`, so this sentence cannot drift the way `REVIEW-PASS.md`'s
> banner once did — it claimed 15 for twelve days against a single box.
>
> **A written box is the RARE case, not the backlog.** Most of what is worth doing lives
> in judgement: the idea pools, the parity matrix's own cells, a device pass, the next
> sweep of screenshots. Read §4 before picking work.
>
> **What `[~]` may NOT be used for:** a bullet that still says "Still open: …" is open
> work, not a park. Four were flipped back from `[~]` to `[ ]` on the day the convention
> shipped, for exactly that reason.

| File | Kind | Status |
| --- | --- | --- |
| **STATE.md** | ← you are here | The front door. Start here. §4 is what is open. |
| `CLAUDE.md` | **Law** | Build-by-reuse rules, conventions, the primitive table. Read before writing code. |
| `PARITY.md` | **Playbook** | The feature × dimension matrix + the canonical new-entity checklist. 0 open — Wave D is a `[~]` standing policy. Parts 5–6 are a template: copy, don't tick. |
| `ACTIONS.md` | **Playbook** | The action × door matrix (action × entry point × undo tier × non-touch). No open items — Part 5 is a template. |
| `LEAN.md` · `DISCOVERY.md` · `COMPONENTS.md` · `OFFLINE.md` · `DEPLOY.md` | Reference | Consult when touching their concern. |
| `PLAN-mots-and-lifecycle-followups.md` | ⚪ Idea pool | 12 designed features, walked with Marc 2026-09-25: 7 accepted and shipped, 4 dismissed. Closed. |
| ~~`bmad/`~~ | **Deleted 2026-09-17** | The planning folder and the archive: brief, PRD, architecture, the idea pools, every finished ledger, and this file's own past. ~10 000 lines of documents about an app that is built. **In git, not in the tree** — `git log --diff-filter=D -- bmad/` finds the deleting commit; `git show <sha>^:bmad/<file>` reads any of it. Code comments still cite its tags (`NFR-CALM-1`, `PRD C5`, `bmad/08 E-36`); they are labels now, not pointers (see CLAUDE.md ▸ Requirement tags). |

**The trap this table used to exist to stop is now fixed at the source.** `PARITY.md` +
`ACTIONS.md` contributed 40 unticked boxes that were templates; they are plain bullets
now, so the repo-wide count is honest for the first time.

---

## 3. What just shipped

### Une image ne reste plus vide — 2026-10-30
Marc's phone: the board « Dessins » strip showed three EMPTY tiles on one open, three drawings on the next (the Souvenirs photo under them fine). **Cause:** a bare `<img>` gets one shot at its bytes — one bar of signal, iOS cancelling in-flight requests as the PWA backgrounds, the SW's synthetic 504 — fires `error` once and stays blank all session (polls never change its `src`); the SW-cached pictures beside it load, which is what made it look random. And with no bytes an `<img>` has no size, so a 3 MB drawing PNG still travelling collapsed the card to its two icon rows — slow and dead looked the same. Prod D1 could not be read to confirm the keys (the `.env` token and the OAuth login both lack D1 — 7403); the screenshot's collapsed tiles ARE the no-bitmap signature. **Shape now:** `components/Img.tsx` is THE `<img>` (66 sites converted; FlyerViewer's private retry was the prototype) — retries 600 ms · 2.5 s · 6 s by key remount (same URL, SW-cache-friendly), then ONE re-ask per reconnection / foregrounding, `data-loaded` `0|1|x`, `onError` only once spent; `img-rule.test.ts` fails a bare `<img>` (planted red on Avatar, and it caught two raw tags a sibling commit restored mid-conversion); the SW asks once more before its 504 on a reject / 5xx; `.note-card__draw[data-loaded]` reserves 9×7 rem with the shared shimmer. Not done: the other placeholder-less surfaces (routine step photos, the gallery grid) still have no reserved shape — they retry now, they do not shimmer.

### La lecture photo ne coupe plus rien — 2026-10-30
Marc's « Saumon à l'asiatique », two photos: page 2's sauce REPLACED page 1's marinade (`mergeOcrPages` word overlap — the same « ml (1 c. à thé) de » scaffolding scored sriracha as a clearer read of sesame oil, « Pour la sauce : » of « Pour la marinade : »); printed step 3 came back as three steps (`selectionLines` cut every line > 100 chars at sentences — the 10-27 run-on fix, one layer above where `refineSteps` had just stopped doing it); the column-break remainder « du feu et laisser reposer… » was dropped. **Shape now:** a later page is a zoom only when most of its lines match the first (else appended whole, repeats included); a line matches by a GLYPH, never a word; only a ≤ 3-line text is segmented (a packed ingredient line still is); a lowercase continuation rejoins its line; the selection model sees a 240-char preview, the draft copies the WHOLE line; transcription at temperature 0, 4000 tokens; selection 1500. **Then every cut in the pipeline, on Marc's « never split or truncate anything »:** ingredient 200 → 400, notes 2000 → 4000, ingredients 40 → 80 (headings count), the footer's words go to notes instead of away, a printed « Notes » heading is no longer eaten as model commentary, `refineSteps` no longer dedupes (the audit's `dup-step` can finally fire). Guards: `ocr.test` ×2, `ai.test` ×3, `recipeImport.test` ×2, `recipeRepair.test` — each red against the old code first. **Open:** the reader's own misspellings (« Couver ») are the verify screen's to catch. **Later the same day — THE PHOTO CORPUS** (`functions/test/fixtures/recipes/photos/`, 10 entries from 14 of Marc's cookbook photos: two-page spreads, three columns, times in badges, a sidebar, a notes box): the reader's REAL transcripts stored beside each page, `recipePhotoCorpus.test` holds the model-free stretch exactly (stitched whole · every expected line ONE pickable line · the draft built from a perfect selection = `expected.json`), `scripts/recipe-photos.mjs` re-reads / proposes / scores on prod (a sandbox mint; the reader is non-deterministic, read three times). It found five more pipeline faults before a model ran: the chapter kicker as title (« plaques-bols » ×3 — the title is the line above the time strip now, two all-caps boxes joined), « Marinage 30 minutes » breaking the strip rule, « > » not a separator, « QUANTITE » unaccented, numbered steps sentence-split by the shape read (6 → 15), a bare « 3 » kept on every step, a « SE CONGÈLE » badge as notes, and a numbered « Se conserve… » step deleted as a footer. 3 entries are `pending` on READER errors (a ⅔ read as ¼ — `measurePhotoCorpus.test` proves the panel flags it; a step lost at a column break; a column-top continuation numbered) — two prompt rules added, unverifiable until the next real read. **Then the LIVE score said 0/10 exact** on the deployed code: the shape read now claimed numbered cookbook cards (its « good enough » gate) and put « Sel au goût » and the page's blurb into the steps — a NUMBERED-CARD rule in the shape pass (before the first numbered line = the list, number or not; after the last = the notes, in page order; a page footer = junk), the corpus test now holds the shape read exact wherever it claims a page (§4, planted red), and the selection path got two post-rules (a part label heads the lines UNDER it, wherever the model's `before` points; a heading, a bare label or a numbered line is never a note). Re-scored after deploy: **5/10 exact live** (the selector at temperature 0 since). **Then the READER evaluation, with Marc's Claude key, before any wiring** (`recipe-photos.mjs read-claude [--model] [--effort] [--run N] [--saved]`, the production prompt, the corpus's own measure): Opus 5.5 PARAPHRASES a printed step and summarises a blurb (low effort too) — not a transcriber; Haiku 5.5 drops most lines; **Sonnet 5.5 reads every expected line whole on every page in three runs** (Mistral misses 3/3/1/1/1) and, once six pipeline faults it exposed were fixed (a « › » bullet read as a comma, « ²⁄₃ », a badge label alone on a line taken for the method heading and the body above it dropped, « Se con‑serve de 1 à 2 jours » yielding « 1 jours », badges leaking into notes, a title wrapped as printed), scores **10/10 exact, three runs out of three**, ~1.5 ¢ and 4–8 s a page. Four expectations had inherited Mistral's errors and were corrected against the photos. **Marc's call: stay FREE — the key is a measuring tool, not the reader.** Two free levers measured and REJECTED the same day: hand-tiling the page into column crops for Mistral (misses 3→3, 1→2, 1→3, 3→3 — it makes new errors on crops: stylised step digits 8/9/10 read 3/4/5, « ¾ » read « ⅓ », hyphenated words left as « pep‑ »); reconciling Mistral with on-device Tesseract as a completeness oracle (glossy cookbook pages: 8 lines recovered against 19 false insertions, misses 8→9 — garble, even columnized). **Open: the free BAKE-OFF** — `recipe-photos.mjs read-cf --model @cf/…` runs any Workers AI vision model through the production prompt and the production call shape and scores it like Claude; needs `CF_API_TOKEN` + `CF_ACCOUNT_ID` in `.env`. Candidates never given a turn (Mistral answers first): Gemma 4 26B (its notes list OCR, handwriting, variable resolution — and a fifth of Mistral's neurons), Qwen 3.8 27B, moondream 3.1, Llama 4 Scout, DeepSeek V4.1 Flash, Kimi K2.6, Clairic. The acceptance gate is Sonnet's: zero misses on every page, three runs out of three. **Run the same evening (token in `.env`), on the four discriminating pages — misses vs Mistral's 3/1/1/3:** Gemma 4 — 3/5/8/8 (worse); Llama 4 Scout — 12/6/8/21 (worse); Qwen 3.8 with reasoning « low » — **1/1/12/4** (it FIXES the coquilles column break and reads the muffins like Mistral; porc's 12 are printed wraps kept as lines + one glyph) but **27–81 s and 2.7–5.9 k tokens a page**, and with thinking off it collapses (12, 20 s) — the fix is the reasoning; GLM-5.3 Flash, DeepSeek V4.1 Flash, Kimi K2.6 — **not on the Workers Free plan** (403); moondream 3.1 — an empty `result` for the query task, twice. **Verdict: on the free plan Mistral Small 3.1 stays the one-shot reader; a 100 % one-shot free reader for a dense three-column page does not exist in this catalog today.** The one free door left open: Qwen 3.8 *with* reasoning as a slow second opinion AFTER the Mistral draft lands (its lines Mistral lacks flagged in the verify panel) — needs a generic printed-wrap join first, and ~20 pages a day of the 10 k-neuron allowance. Not built; measure before building. **Last live fault of the day, fixed without a model:** the selector filed the saumon's four « › » garnish lines and their label NOWHERE on every run (« au choix » read as not-an-ingredient) — a bulleted printed line the model leaves unfiled is now restored as an ingredient at its place, under the label printed above it (`recipeSelection.test`, planted red). **The trust layer, built the same night (Marc: « make sure the users can trust our imports 100 % »; « if some AI are not hit because of lack of neurons or bad model it should resurface to the user too »):** (1) the photo door's hint now carries the four tips the corpus measured (one page at a time, nothing beside it; no hand or shadow; two pages = two photos; no close-ups — a column crop made Mistral WORSE) instead of recommending close-ups; (2) `lib/photoCheck` measures every photo before a reader runs — blur (Laplacian variance, CALIBRATED on the 14 originals: 937–3454 sharp vs 8–17 blurred, threshold 60) and something past the frame (text-like edges in the border band: the next page's column 0.098 vs ≤ 0.065 framed) — said at once and under the verify panel; the SHADOW measure is computed but never warned (a printed food photo scores like a hand's shadow on glossy pages — a warning that cries wolf on the saumon teaches the cook to ignore it); (3) every model TRIED and not answering rides in the read report with its reason (the day's AI budget, an error, nothing read, « saw no image ») — `transcribeImage` and `selectRecipeLines` record them, `recipe-vision` returns `readerAttempts`, a draft carries `attempts`, and the verify panel says « Lecteur de secours : Llama — Mistral : quota IA du jour épuisé » / « L'IA n'a pas organisé ce texte » in one line (planted red); (4) a `step-gap` audit: the page's numbering skips a step (« 1, 2, 3, 5 ») → named, with bare cookbook numbers now counting as printed steps; (5) a one-line nudge on a photo read: check the foot of each column. Where text can still be INVENTED is now exactly one place: the reader's transcript (seen today with Mistral: a cut-off column completed from fragments, « de saumon » added, « Couver », a flipped fraction) — the selector copies lines by number, every deterministic pass only joins or moves, and the measure flag + the photo in the verify panel are the catch. **The next live test (Marc, the same night): « Retirer du feu is lost, only Retirer is kept », the steps misnumbered (the book sets its numbers in a display face), and two asks for the verify panel.** Three deterministic faults, each planted red: (1) the SHAPE read — which claims a confident numbered card without a model — rejoined a lowercase remainder only when the step before it had no final period, and the reader closes a column's cut half with one (« Retirer. » / « du feu et laisser reposer… » became a note, or a step of its own); `CONTINUATION_START` moved to `recipeImport` and both the shape read and `joinContinuations` rejoin on it past a period; (2) a step number the reader gives a line of its own (« 3 » / « Dans une casserole… ») left the step unmarked — `joinLoneNumbers` glues a lone 1–30 back onto the sentence (or the amount's noun) it numbers, in both paths, a page number stays alone; (3) **Marc's rule — « it's easy for a user to remove extra text than find missing one »**: `draftFromSelection` now keeps EVERY line the model filed nowhere, where the page puts it (between picked steps a step, inside the picked list an ingredient, elsewhere a note); only furniture stays out — the header above the title, the time/yield strip (`isMetaLine`: each fact opens on its label or figure), a page number, a lone figure, a label heading nothing (≤ 4 words or a colon), a ≤ 3-word badge. The verify panel: the step NUMBERS are shown (a page's « 1, 2, 3, 5 » is checked by eye), and the PHOTO is the pinned part on every width — the hints moved into the scrolling column at its head (they were the pinned part; the photo scrolled away). **Marc's phone said « not usable »** (the whole photo pinned at full width left no room for the lines): the panel is now a FULL-SCREEN sheet on a phone, « Rapport » is a chip beside a « Photo » show/hide chip (no tab band), and the page sits under a LOUPE — the shared `PanZoom` grew two opt-ins, `initialScale` and `minimap` (a thumbnail with the visible window drawn on it, tap or drag to jump) — a 30 vh strip at 2×, pinch / drag / wheel / +−, top centred. Then: two fingers MOVE the content too (the pinch now follows its midpoint), and several pages read = one chip each (« Photo 1 », « Photo 2 »… the picked one under the loupe, keyed per page), « Rapport » last (`photoUrls`). Then the chips moved ONTO the page (a frosted pill top-left, like the zoom cluster top-right) and the strip lost its padding: one 36 vh block, edge to edge, no band above the picture. **Then the ALTERNATIVES (Marc: « sometimes it adds the ingredients in the ingredient list, not as a full "this is another way if you want" thing » — his pick: one recipe, a version switch):** no new table — a VERSION is a matched pair of « ## » sections (a step section titled T, ingredient sections titled T or « T — part »); the import composes them from the page's `VERSION_LABEL` (« pour une version bol », « Variante », « Version au barbecue ») — everything printed after the label is the version's, its part labels become « T — part » (`draftFromSelection`, planted red; the saumon fixtures' truth updated; the corpus loader maps a composed heading back to its printed part); the client (`lib/recipeSections` `recipeVersions` / `applyVersion` / `versionGroups` / `versionLabel`, unit-tested) shows the switch on the sheet and at the top of the cook stage (parent only): « Recette » = the base, « Bol » = base ingredients + the version's, and ITS steps instead. Not yet: a version detected by a numbering that restarts at 1 with no label; the form's editor shows the composed headings as plain text. Then (Marc's next three): the loupe's chips went to ONE letter (« P1 P2 R ») inside PanZoom's own bar with − ⌖ + (`tools` + `.panzoom--bar`, a flat strip on the top edge); a picked line that is only a part LABEL (« pour la sauce : ») now heads the lines under it instead of sitting in the list (planted red); an ingredient's « (facultatif) » is worn as a tag at the end of its line (`IngredientLine`, the page's word). On iOS a scrolled line showed ABOVE the loupe: the sticky block's negative margin (cancelling the scroller's padding) offset it — the scroller has no padding now, the lines column pads itself; the bar is 32 px. And « Tel qu'importé » keeps EVERY page read (`sourceImages` in the original snapshot beside `sourceImage`, all uploaded on confirm, all freed with the row). **« Do all » (the evening's list):** a numbering that restarts at 1 with no label opens « Version 2 » (a figure, never a word; planted red); the sandbox sweep now frees the source pages that live inside the original snapshot's JSON (a real leak until then); the grocery checklist puts « (facultatif) » lines last with their word; `e2e/recipe-versions.spec` guards the switch on the sheet and in cook mode. The live re-score could not run: the account's daily neurons were spent (every page fell to the last fallback reader with 0 chars) — re-run `recipe-photos.mjs read` then `score` on a fresh day. Qwen-with-reasoning as a second opinion is OFF the table: the 10 k neurons are per ACCOUNT, shared by every household, ~20 slow reads a day for the whole app. **The quota spent is now SAID** (Marc's English « Chicken meatballs » page at 18 h 49 answered « connexion ? »: every vision reader had answered « budget », then the device engine failed to fetch its language data on one bar of signal and its message won) — `readFailBudget` first, the engine second, « illisible » last. That page is in the corpus as `chicken-meatballs-pistachios` (English, two columns, a blurb, « ¾ cup/100g » amounts), photo only until a fresh AI day gives it a transcript (the loader skips an unread entry). Still wanted from Marc: the transcript of that read (Rapport ▸ the source) — the step misnumbering is fixed for the lone-figure shape; another shape would need its own rule.

### La routine du tout-petit, solidifiée — 2026-10-29
Reported from the wall: stepping too fast misbehaved, and a big sticker wall could not be scrolled. **Causes found, all fixed:** the ✓ was painted after an `await`, so two taps in one task both read the SAME current step (→ `[1,1]`, which `length >= cards` read as « finished »); a poll that left after the tap but before the write landed un-ticked the step; ▶ and → share one spot, so a double-tap on ▶ ticked step one unseen; `.sticker-wall` was a flex child of a fixed 100dvh `.scene` with no overflow of its own; the kiosk's 60 s « nobody is here » drift fired mid-tooth-brushing countdown; a superseded parent-voice clip fell back to TTS of the OLD step over the new one. **Shape now:** `lib/routineProgress` (pure: done = distinct, in-range; shared by player, picker, board card, Maison tab) · `lib/routineWrites` (cache painted SYNCHRONOUSLY, PATCHes in tap order, pending ops re-applied over any fetched frame, a queued offline write held until the outbox drains) · a 600 ms `aria-disabled` rest after ▶/→/←/Recommencer. `lib/optimistic.ts` is gone (player was its only user). e2e mock `routines` is now stateful. Guards: `routineProgress.test`, `routineWrites.test`, `e2e/routine-run-solid.spec` (burst taps, poll race, 8 viewports × 2 decks, 150-sticker wall) — each run red against the pre-fix code first.

## 4. What still needs improvement — consolidated and ranked

> **No open box.** (2026-09-29) §K's six waves and §L are all closed; what is left is §M
> (needs a device) and F37's review (~12-29). New work starts from what real households do.

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

**§L's last thread — the CSP is ENFORCED (2026-09-22), the report-only twin dropped 2026-09-25.** The week of reports found one
thing, and not ours: the edge injects inline scripts into the door, so `script-src` keeps `'unsafe-inline'` and every other
directive is enforced (`securityHeaders.ts` carries the why). `frame-ancestors` now also admits marcportal.com (2026-10-15).

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

**Wave 1 — the stranger's demo walk. ✅ CLOSED.** Walked twice on production by
Playwright, as a stranger, on a laptop and an iPhone. **The clock was never the problem**
(landing 0.4–0.8 s, mint → board 0.8–1.2 s, the first write settled in 70 ms); the first
screen was. The first walk could not get past it: a brand-new device landed on
« Le point du jour » with the welcome dialog over it and the tour pulling the router back,
because two shell automations both fire on a fresh device — fixed `b2bc7ee6`, the first
day belongs to the welcome, and `first-run-quiet.spec.ts` replays production's timing
(an instant stub let the OLD code pass). The second walk found three more: the marketing
page opened the household realtime socket with NO credential (a 401 handshake forever in
a visitor's console — the socket follows the SESSION now), Découvrir greeted a fresh
sandbox with « Quoi de neuf » about a rename it had never seen, and the first-ever undo
toast covering the row you just added — **accepted by Marc, « they can close the toast »:
declined, not deferred.** The 24 h sandbox sweep was confirmed in production D1 on
2026-09-22: zero aged sandboxes, zero orphaned households.

**Wave 2 — a fresh household, a small phone, a slow connection. ✅ CLOSED.** The fresh
household was already photographed; what had not happened was LOOKING at those frames
with the question. **320px** was the find — the first frames ever shot there had EVERY
tab's title cut (« Bon apr », « La li… »), and it was never the font: a fixed 197px
four-disc header cluster left ~83px for the title, so below 340px the decorative section
avatar hides. Cold start was measured on production under CDP throttling, then re-measured
after the hub went lazy: **78 requests → 17, and the slow-link headline 11.2 s → 7.1 s.**
The last 55 KB came off 2026-09-22; the install prompt shipped. **Re-measured 2026-09-25**
(`npm run perf:door`, presets in its header): **15 requests / 305 KB** on the wire (was 78 /
487), one parallel wave, no chained round trip — bandwidth-bound; the levers left are bytes.

**Wave 3 — password reset. ✅ CLOSED 2026-09-23, verified against production.** It was
called the longest pole and it was: there was no forgot-password flow at all and the app
had never sent an email, so the first stranger to forget a password was locked out
forever. Built 2026-09-16 (`_lib/mail.ts` over Resend as an OPTIONAL binding, migration
0133 `password_resets` storing only a token HASH, `auth/forgot` answering the same 200
whatever the address, `auth/reset` single-use + signup-grade validation, `/oubli` and
`/reinitialiser?t=`, eight e2e cases) — then sat DARK for a week because the secrets were
not set, which is why `app_health` exists to say so out loud.

Turned on 2026-09-23. `marcportal.com` had been verified in Resend for four months
already (the portal project); what was missing was a key of Babillard's own — « Sending
access », not the portal's full-access one, so revoking one cannot silence the other and
the Emails log can tell the two apps apart — plus `RESEND_API_KEY`, `MAIL_FROM` and
`ALERT_EMAIL`.

**Walked end to end, which is the part no test could do.** An unknown address answered
`200 {"ok":true}` in 0.14 s and wrote no row — the enumeration guarantee observed from
the outside, where an attacker stands. A real one answered the SAME 200 in 0.53 s, the
extra ~400 ms being the Resend call, and the mail arrived at Hotmail. The link was opened
and a password set: the row was marked `used_at` **15 seconds after it was minted**, and
the abandoned token beside it stayed `UNUSED` and expired on its own. Single use,
hash-only storage and the 30-minute window all hold against real rows.

Two things worth carrying: `reset.ts` bumps `session_version` in the same batch (0134), so
completing a reset signs the operator out of every other device — correct, and surprising
if you meet it on a phone. And **the nightly cron can finally reach a human**: `alerts`
was false for as long as mail was, so a failed backup or an unsweepable sandbox had
nowhere to go but the log.

**Wave 4 — a household can leave, and knows the terms. ✅ SHIPPED 2026-09-22.**
`DELETE /api/household` behind three locks — operator scope, the password (`_lib/sudo`),
and the household's NAME retyped, which is the half a password cannot be: a password is
typed while thinking about something else, a name has to be read off the screen. Folded
under the export, because the first thing to offer someone leaving is their own things.
No undo tier, recorded as a ➖ with the argument (PARITY ¹¹¹). `deleteDemoHousehold` became
`deleteHousehold` in the same commit. `/confidentialite` + `/conditions` ship FR and EN
from the marketing footer and from Réglages, written to be TRUE rather than reassuring —
every claim checked against code that day — and living in their own lazy page, not in
`i18n.ts`. `CONTACT_EMAIL` is the contact door — **set in production** (`app_health`
reports it, 2026-09-29), so the Law 25 prerequisite held when signup opened. Guards: `worker/leave.d1.test.ts` (5, including the
neighbouring household left untouched) + `e2e/leave-and-legal.spec.ts` (6).

**Wave 5 — bounds, then the gate opens.** Both bounds shipped 2026-09-23.

**Daily spend limits (0137)** — two resources cost money per use and nothing counted
them: not one AI endpoint called the rate limiter, and a demo sandbox is a real operator
session, so one unauthenticated POST bought a credential `/api/transcribe` (16 MB of
audio per call) accepted without limit. R2 is rented and the sweep reclaims it; neurons
are burned. **Every** household is capped now, not only sandboxes — a runaway loop in a
real household had no ceiling either (1 000 calls / 2 GB a day against 60 / 50 MB). R2
already had its seam (`uploadR2Media`); AI got one (`_lib/runModel.ts`, 13 raw call sites
converted), and `usageRule.test.ts` keeps both unavoidable. The counter is a single
atomic UPSERT — the naive read-then-write it replaced was planted and counted **1 of 20**
concurrent charges.

**Email verification (0138)** — gates the two doors that reach outside the household
(invite a co-operator, issue a guest link) and nothing else. Fails open where it must:
no mail wired → stamped verified at signup, and the gate no-ops. Existing accounts were
backfilled. Single use proven red; the redeem page survives StrictMode's double mount.

**The examples story is settled (2026-09-23, §3)** — which this box partly waited on: a
stranger now meets ONE story (try → keep, or sign up → an empty household).

- [x] **Open signup — OPEN 2026-09-24**: `SIGNUP_OPEN = "1"` (`_lib/signupGate.ts`), after
      the prep commit `f56bbb9e` split the invite from `LOGIN_PASSWORD`, which stays set.
- [x] **Retire the shared password — DONE 2026-09-25.** Production counted **zero** rows with
      `password_hash IS NULL`; the legacy branch is gone from `login.ts` + `_lib/sudo.ts` (a hash-less
      row is refused; « Mot de passe oublié » is its way in) and the invite code is `INVITE_CODE`.
- [x] **`LOGIN_PASSWORD` is gone from production** — confirmed absent from `wrangler secret
      list` on 2026-09-29; nothing had read that name since `3e16adba`.

**« L'autre parent » (F37) — KEPT, review ~2026-12-29 (Marc, 09-29).** Never used yet (one
operator per real household), kept for the first real couple now that signup is open. At
review, count `operators` per household; still one everywhere → retire it like the calendars.

**Capacity, for the record:** ~100 households on the free tier with realtime on, then
Workers AI neurons are the ceiling, then Workers Paid at $5/month buys hundreds. Not a
blocker at any wave above.

### M. Known limits after the 2026-09-24 pass — not boxes; each needs a device or evidence

- **Keyboard, needs Marc's phone.** Two suspects the code cannot settle: iOS still
  reporting a shrunken viewport after dismissal (the tab bar stays hidden — the
  diagnostic shows `open=true ae=BODY`), and a stranded pan after close (`open=false
  vvT>0`). Réglages ▸ Système ▸ Appareils & accès ▸ « diagnostic clavier », on the screen
  where it happens. Fixed blind and proven by the fake-vv e2e: dialogs and sheets fit the
  visible band, a tall textarea follows its caret line, date/time inputs are pinned,
  « above the band » is corrected too (`997306a5`, `2d9ab542`).
- **Photo read.** An eight-card corpus (`8b059a2c` → `7b20ee09`): the transcriber's
  misspellings (« Broccoli », « SOUPES ») are the model's and the verify screen's to
  catch; the second model still runs in ~3 reads of 16; a bare part label heads a
  section only with a layout signal (blank line, first after the heading, or a common
  part word). The transcript rides in `recipe-vision`'s response so a miss is read at
  the source, not guessed. Re-render the corpus when a new card style fails.

### F. Not a backlog — do not mine these for work

The `bmad/` idea pools are gone with the folder (21 never-built ideas + the lifestyle brainstorms — in git if ever
wanted). `PLAN-mots-and-lifecycle-followups.md` was walked 2026-09-25 and CLOSED (its table carries every verdict and commit). A new idea starts a new pool.

---

## 5. Process review — the lessons that keep earning their keep

Written 2026-08-27 as a long retrospective; its action items are done (the `useWrite`
test, one checkbox convention, the friction tier-1, the finished ledgers moved out). What
remains is the part later sessions keep needing, kept short — git has the full text.

**What works.** Invariants as tests (the build-gating greps in §1 — the pattern that
should absorb every prose rule). Comments that carry the *why*, rejected alternatives
included. Push-to-main behind a ~2m20s gate. Verdicts recorded (`[~]` with the reason)
so a question is not re-litigated.

**What to keep doing.**

0. **A guard that has never been red proves nothing.** `nested-interactive` reported
   green over the very defect it was written for (it walked JSX by indentation; prettier
   put `<div` alone on its line). Plant the violation, watch it fail, restore — **and
   check the plant landed**: on 2026-09-24 two of three `sed` plants were no-ops and
   "proved" a rule until the mutation was re-applied through an exact-match edit.
1. **Ledgers rot faster than they are ticked.** A third of the work picked up on
   2026-08-27 was already done. Before starting an item, grep the claim in code; before
   committing, grep the repo for the other docs naming it.
2. **A review pass after the work is not ceremony.** Three defects in fresh code were
   found by re-reading it cold, not by a red test (an undo painted under the scene that
   offered it, a mis-destructured payload, a frozen nested scroller).
3. **Sweep the rule, not the site.** Fixing « Réglages writes via `api()` » literally
   left `/share` losing data for weeks; a 30-second grep would have found it.
4. **Verify before offering, not just before building.** An option built from the
   documents (« the schema migration window ») had shipped two months earlier.
5. **Effort goes where the harm is, not where the documents point.** §4's ranking is
   the correction; audits are produced faster than they are acted on, so the constraint
   is decisions, not information.
6. **Prose rules drift; only tests hold.** For every cross-cutting rule in `CLAUDE.md`,
   ask whether a test could hold it. For `useWrite` the answer was yes, and it did.
