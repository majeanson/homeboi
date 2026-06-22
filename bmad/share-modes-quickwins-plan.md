# Share-modes — four quick wins (executable plan)

> Pick-up plan for a fresh session. Builds on the typed share-modes feature already
> shipped (commits `4ec3495`/`0661796`, on `main`). Background: see memory
> `babillard-share-modes.md`. Everything here is **reuse-first**; none need a migration.
>
> The feature: a guest token carries a `kind` (`showcase`/`sitter`/`welcome`/`family`).
> Curated kinds share ONE endpoint `functions/api/guest/window.ts` (branches on kind);
> the privacy boundary is the per-kind allowlist `functions/_lib/guestScope.ts` enforced
> in `worker/index.ts`. Issuance UI + the wifi/rules editor live in
> `src/components/operator/guest.tsx` (Réglages ▸ `guest` tab, `pages/Operator.tsx:291`).
> Scenes: `pages/{HandoffPage,WelcomePage,FamilyWindowPage}.tsx`. i18n: `t.guest.*`
> (issuance) + `t.shareMode.*` (scenes) — NOTE `share` is taken by #13, use `shareMode`.

Build in this order (each is independently shippable). Run typecheck+test+build after each.

---

## 1. Document it in the Guide + FeatureMap  (S, ~30 min — closes the standing-rule gap)

The standing rule: a user-facing feature must land in `lib/guideContent.ts` + the ONE
taxonomy. **Gotcha:** the existing `id: 'share'` entry (guideContent.ts ~1285) is the PWA
**share-target (#13)** ("Partager VERS Babillard") — do NOT overload it. Add a NEW concept.

- **`src/lib/guideContent.ts`**:
  - Add a new `GUIDE` entry `id: 'share-access'`, `group: 'concepts'`, icon `'key-bold'`,
    title `{ fr: 'Partager un accès', en: 'Share access' }`. Cover, as `points[]`
    (each with `label`/`detail`/`why`, `Bi {fr,en}`):
    1. The four kinds — **Démo** (full hub read-only, real data, "check my app"),
       **Gardienne** (today + routines + à-savoir + urgences + wifi), **Accueil**
       (wifi + poubelles + règles), **Famille** (grands-parents: dates des enfants +
       anniversaires + photos).
    2. Read-only + **time-boxed** (auto-expires; no revoke-before-TTL — keep short).
    3. The **« Infos à partager »** editor (wifi / règles / jour des poubelles) feeds
       the Gardienne + Accueil links.
    4. Privacy: a curated link can ONLY see its own view — never the whole house.
  - Add `'share-access'` to a `CONCEPT_THEMES` bucket so FeatureMap surfaces it. Best fit:
    the **`devices`** theme `ids` (next to `'pairing'`, `'share'`) — or create a small
    new theme if it reads better. (FEATURE_MAP_TILES derives from CONCEPT_THEMES — no
    separate edit.)
  - Check for a `group:'settings'` card with `tab: 'guest'`; if present, refresh its
    `what`/points to mention the 4 kinds + the editor. If absent, optionally add one.
- **Gotcha:** `typeof FR` parity — every EN key must mirror FR or `tsc` fails. `[[icon:name]]`
  tokens must be real `IconName`s.
- **Verify:** open Réglages ▸ Guide → the new card renders FR+EN; the FeatureMap jump-grid
  (Board WelcomeCard / DevKit `/dev/kit`) shows it.

---

## 2. QR code on every share link  (S — #35 "a QR by the door")

- **Dependency:** none exists. Add `qrcode` + `@types/qrcode` (`npm i qrcode @types/qrcode`),
  ~20 KB, client-side, fine for the offline PWA (bundled). *(Zero-dep alt: vendor a tiny
  encoder — more code; only if avoiding deps matters.)*
- **New shared component** `src/components/QrCode.tsx`: props `{ value: string; size?: number }`.
  In an effect call `QRCode.toDataURL(value, { margin: 1, width: size })` → render `<img>`
  (alt = the URL). Keep it dumb/presentational.
- **`src/components/operator/guest.tsx`**: when `link` is set, render `<QrCode value={link} />`
  centered under the link input (especially for welcome/family — stick on the fridge/door).
- **Standing rule:** register `QrCode` in `src/pages/DevKit.tsx` + `COMPONENTS.md`.
- **Mobile/calm:** ~180 px, centered, on a white tile so it scans; works offline.
- **Verify:** mint a link → QR appears → scans to the right URL on a phone.

---

## 3. Operator "Aperçu" (preview) button  (S — plumbing already exists)

`guest/window.ts` ALREADY accepts `?kind=<sitter|welcome|family>` for a non-guest
(operator) actor, and the allowlist in `worker/index.ts` only restricts real guests
(`currentGuest` is null for an operator) — so an operator can fetch the curated view.

- **Scenes** `HandoffPage.tsx` / `WelcomePage.tsx` / `FamilyWindowPage.tsx`:
  - Read `?preview=<kind>` via `useSearchParams()`; fetch
    `api('guest/window' + (preview ? '?kind=' + preview : ''))`.
  - Make the query key preview-aware so caches don't collide:
    `queryKey: ['guest-window', preview ?? 'self']`.
  - When `preview` is set, show a close affordance (guests normally have none): a
    `SceneHead`-style ✕ or a "Fermer l'aperçu" bar → `navigate('/settings?tab=guest')`.
- **`operator/guest.tsx`**: add an **"Aperçu"** button per curated kind that
  `navigate()`s to `/handoff?preview=sitter`, `/welcome?preview=welcome`,
  `/family?preview=family`. (showcase = the real hub; skip or open `/board`.) Add
  `useNavigate`.
- **i18n:** `t.shareMode.preview` ("Aperçu"/"Preview"), `t.shareMode.closePreview`
  ("Fermer l'aperçu"/"Close preview") — both FR+EN.
- **Gotcha:** `window.ts` preview branch validates `kind ∈ {sitter,welcome,family}` already
  (incl. `family`). Confirm an operator preview returns the curated payload, not 403.
- **Verify:** as operator, click Aperçu on each kind → see exactly what that guest sees,
  then close back to settings.

---

## 4. Printable `/welcome` (and bonus `/handoff`)  (S)

There are **no `@media print` styles** in `src/styles/` yet — this introduces the first.

- **`src/styles/handoff.css`** (uniquely-named, late in the cascade — safe): add an
  `@media print { … }` block: white bg / black ink, hide buttons (copy/print/close),
  enlarge wifi + rules so the taped-up card is legible; page-break-safe.
- **`src/pages/WelcomePage.tsx`**: add an **"Imprimer"** button (header actions) →
  `window.print()`. Fine to always show (a visitor or the operator can print). Add
  `t.shareMode.print` ("Imprimer"/"Print") FR+EN.
- **Bonus (recommended):** generalize the print block + button to `HandoffPage.tsx` — a
  printed babysitter handoff on the fridge is genuinely useful. `/family` (photos) skip.
- **Verify:** open `/welcome` (or its Aperçu) → Imprimer → print preview shows a clean
  card, no app chrome/buttons.

---

## Settings organization (Marc's "Maisonnée" note)

Marc asked these live "in some kinds of settings like Maisonnée." They already sit in the
Réglages **`guest`** tab (`pages/Operator.tsx:291`, `GuestSection` + `ShareInfoEditor`).
Low-risk polish options (pick one, don't over-engineer):
- **Keep in `guest` tab**, retitle it "Partage" — it now covers all 4 kinds + the editor.
- **OR** move `ShareInfoEditor` (wifi/règles/poubelles = household identity) into the
  `household`/Maisonnée tab next to the household-name editor, leaving link-minting in
  `guest`. Cohesive either way.

## Cross-cutting / done-criteria
- `npm i` (if QR dep) → `npm run typecheck` → `npm test` → `npm run build` all green.
- New shared component (`QrCode`) registered in DevKit + `COMPONENTS.md`; `share-access`
  documented in the Guide (closes the standing-rule gap from the original share-modes ship).
- No migration needed. Push straight to `main` (CI gate = typecheck/test/build), per convention.
- Mobile + tablet/Toddler friendliness on any UI touched (standing rules).
