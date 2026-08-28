import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// THE WRITE RULE, made structural. CLAUDE.md has said it in prose since the outbox
// shipped — "Any /api/* write → useWrite(); …don't call api() directly for writes
// (skips the offline outbox)" — and prose drifted, exactly as every unenforced rule
// in this repo has.
//
// What that cost, found 2026-08-27: `pages/SharePage` posted the PWA share-target
// capture through raw `api()`. No outbox meant that sharing a link to Babillard
// with no signal threw the capture away in SILENCE — you tapped « Ajouter », the
// page said nothing, and the line never existed. It is bmad/11's tier-1 seam #2 and
// it survived six weeks of the rule being written down in three separate files.
//
// Sibling of styles/field-fit.test.ts and styles/keyboard-fit.test.ts: the same
// class of bug — the surface still works, so nothing looks wrong until data is gone.
//
// FAIL-CLOSED. A write is a violation unless its site is listed below with a
// reason. A brand-new endpoint written through `api()` therefore fails the build by
// default, which is the whole point: the last one to slip through was a data-loss
// bug. Adding an entry is a DECISION — say why the outbox would be actively WRONG
// here, never "we didn't get to it".
//
// Comment lines are blanked before scanning (so the justification written beside an
// exception can't satisfy its own guard), and `*.test.ts(x)` files are skipped, so
// this file never matches itself.

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return sources(p)
    if (/\.test\.tsx?$/.test(name)) return []
    return /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

// Blank comment-only lines rather than dropping them, so a reported line number
// still matches the real file.
const blankComments = (s: string): string =>
  s
    .split('\n')
    .map((l) => (l.trim().startsWith('//') ? '' : l))
    .join('\n')

// The call whose options object a `method:` sits in.
const CALLER = /\b(api|write|writeWith)\s*(?:<[^>]*>)?\s*\(/g

interface Site {
  file: string
  line: number
  path: string
}

// Every raw-`api()` write in src/, identified as `<file> → <endpoint>`.
function rawApiWrites(): Site[] {
  const out: Site[] = []
  for (const f of sources(srcDir)) {
    // lib/write.ts IS the wrapper — the one place allowed to reach api() for a write.
    if (f.endsWith(join('lib', 'write.ts'))) continue
    const src = blankComments(readFileSync(f, 'utf8'))
    for (const m of src.matchAll(/method:\s*['"](POST|PATCH|PUT|DELETE)['"]/g)) {
      const before = src.slice(Math.max(0, m.index - 400), m.index)
      const calls = [...before.matchAll(CALLER)]
      const last = calls[calls.length - 1]
      if (last && last[1] !== 'api') continue // already through the wrapper
      const after = before.slice(last ? last.index + last[0].length : 0)
      const path = (after.match(/^\s*['"`]([^'"`]+)/) ?? [])[1] ?? '?'
      out.push({
        file: relative(srcDir, f).split(sep).join('/'),
        line: src.slice(0, m.index).split('\n').length,
        path,
      })
    }
  }
  return out
}

// ── The exceptions ────────────────────────────────────────────────────────────
// Keyed `<file> → <endpoint>`, grouped by WHY — because the reason IS the entry.
const ALLOWED = new Set<string>([
  // 1. Session and device identity. There is no household to write to yet, or the
  //    credential itself is what's changing — a queued login is a contradiction.
  'pages/Login.tsx → auth/login',
  'pages/Signup.tsx → auth/signup',
  'lib/auth.tsx → auth/logout',
  'pages/Pair.tsx → pair/start',
  'components/operator/devices.tsx → pair/claim',
  'components/operator/devices.tsx → pair/devices',
  'components/operator/guest.tsx → pair/devices',

  // 2. Demo sandbox and sample data. Both mint or wipe a WHOLE household; replaying
  //    one later would seed or erase a household nobody is looking at any more.
  'pages/Home.tsx → demo',
  'pages/ClaimPage.tsx → demo/claim',
  'components/operator/sampleData.tsx → seed',
  'components/SampleBanner.tsx → seed',

  // 3. Links and inbound submissions. Each MINTS a token or posts into someone
  //    else's household; the caller needs the answer in hand (a URL, an ack), and a
  //    link minted hours late is a link nobody is waiting for any more.
  'components/operator/guest.tsx → guest/start',
  'components/operator/guest.tsx → guest-links',
  'lib/share.ts → share',
  'components/cercle/FamilyShareModal.tsx → family-share',
  'components/voyage/VoyageShareModal.tsx → shared-trip-invite',
  'pages/SharedVoyageJoinPage.tsx → shared-trip-join',
  // The two guest forms have no outbox by construction (a guest session is not
  // an operator's device and useWrite refuses a guest write outright), but they
  // DO carry an Idempotency-Key of their own now — one per composed submission,
  // reused by every retry — so a double-tap or a resend after a lost response
  // can't land a second quarantine row. Guard: e2e/postbox.spec.ts.
  'pages/IntakeForm.tsx → guest/intake-submit',
  'pages/Postbox.tsx → guest/postbox-submit',

  // 4. AI and network round trips. These are QUESTIONS, not writes: the point is
  //    the answer that comes back, and each already has a documented degraded path
  //    offline (NFR-DEGRADE-1) rather than a queue.
  'components/AskSheet.tsx → ask',
  'pages/SearchPage.tsx → ask',
  'components/kitchen/useMealSuggest.ts → suggest-meal',
  'components/kitchen/EmptyFridgeSheet.tsx → empty-fridge',
  'components/kitchen/useMealPlanning.ts → meal-staples',
  'components/RecipeForm.tsx → recipe-ocr',
  'components/RecipeForm.tsx → recipe-import',
  'components/RecipeForm.tsx → recipe-vision',
  'components/RecipeForm.tsx → ?',
  'components/cercle/BusinessForm.tsx → place-import',
  'lib/useVoiceInput.ts → transcribe',

  // 5. Diagnostics. A queued probe is meaningless, and a queued log-clear would wipe
  //    failures logged AFTER it, hours later, on reconnect. (Long-form note at the
  //    aiErrors.tsx call site.)
  'components/operator/aiErrors.tsx → ai-test',
  'components/operator/aiErrors.tsx → ai-errors',
  'lib/aiErrorToast.tsx → ai-errors',

  // 6. R2 blob uploads. The caller needs the storage key back SYNCHRONOUSLY to write
  //    it into the row; there is nothing to queue until the bytes land. The house
  //    treatment is to disable the control offline, not to pretend (OFFLINE.md).
  'lib/uploadMedia.ts → ?',
  'components/DocUploadButton.tsx → ?',
  'components/board/Notes.tsx → note-media',
  'components/cercle/NoteEditor.tsx → note-media',
  'lib/drawingGallery.ts → note-media',
  'pages/SharePage.tsx → note-media',
  'lib/drawingToRoutine.ts → routine-card-photo',
  'lib/recipeToRoutine.ts → routine-card-photo',
  'components/cercle/PetForm.tsx → pets',
  'components/cercle/CareLogForm.tsx → care-log',
  'components/cercle/HomePinForm.tsx → home-pins',
  'components/cercle/ContactPhotos.tsx → cercle-photos',
  // The shared single-photo field (2026-08-28). It replaced the byte-identical upload
  // handlers CarnetForm and BusinessForm each carried — whose entries were HERE, and
  // which this file's "every exception still exists" check flagged the moment they
  // stopped writing, exactly as intended. Same reason as the rest of this block: it
  // POSTs the blob and hands the caller the key back; the row write that STORES that
  // key still goes through useWrite in the host form. The endpoint is a prop, so the
  // scanner reads it as '?'.
  'components/PhotoField.tsx → ?',

  // 7. The row write ATOMICALLY COUPLED to one of those uploads. Queueing only the
  //    trailing POST/PATCH would split a two-step operation across online and
  //    offline, landing a row that points at blobs which were never stored. (Both
  //    files carry the long-form reasoning at the call site.)
  'components/board/Notes.tsx → notes',
  'lib/drawingGallery.ts → drawings',
  'lib/drawingGallery.ts → notes',

  // 8. Multi-step operator transactions. A merge reads ids back BETWEEN steps
  //    (create the person → link them → mark the submission merged), so a queue
  //    would half-apply it — worse than failing and being retried deliberately.
  'components/operator/IntakeReview.tsx → cercle',
  'components/operator/IntakeReview.tsx → cercle-links',
  'components/operator/IntakeReview.tsx → pets',
  'components/operator/IntakeReview.tsx → intake',
  'components/operator/PostboxReview.tsx → postbox',
  'pages/FamilyImportPage.tsx → cercle',
  'pages/FamilyImportPage.tsx → cercle-links',
  'pages/FamilyImportPage.tsx → cercle-groups',
  'pages/FamilyImportPage.tsx → pets',

  // 9. Import-on-arrival. These run in the same breath as fetching a shared snapshot
  //    that is itself online-only; queueing the write without the fetch it came from
  //    would import nothing at all.
  'lib/shareImport.ts → events',
  'lib/shareImport.ts → recipes',
  'lib/shareImport.ts → routines',
  'components/kitchen/EmptyFridgeSheet.tsx → recipes',

  // 10. Needs the new id synchronously to attach it to the row being saved.
  //     EventForm's « Créer la liste » must SELECT the list it just created, and a
  //     queued create returns null. The call site says so and disables offline.
  'components/forms/EventForm.tsx → todo-templates',

  // 11. The undo half of an online-only flow. « Garder dans les photos » fetches the
  //     bytes back from R2 to make an independent copy, so it only ever runs online;
  //     its undo-delete inherits that and never outlives the session.
  'lib/photoGallery.ts → photos',
])

describe('the write rule (every /api/* write goes through useWrite)', () => {
  const files = sources(srcDir)
  const writes = rawApiWrites()

  it('found the sources', () => {
    expect(files.length).toBeGreaterThan(300)
  })

  it('found raw api() writes to classify (the scanner still works)', () => {
    // If this ever reads zero the regex broke and every assertion below is trivially
    // green — the same canary field-fit.test.ts keeps on its walker.
    expect(writes.length).toBeGreaterThan(20)
  })

  it('no api() write outside the documented exceptions', () => {
    const offenders = writes
      .filter((w) => !ALLOWED.has(`${w.file} → ${w.path}`))
      .map((w) => `${w.file}:${w.line} → ${w.path}`)
    expect(
      offenders,
      'route it through useWrite()/writeWith() so it survives being made offline — or, if the outbox would be actively WRONG here, add it to ALLOWED in this file WITH the reason',
    ).toEqual([])
  })

  it('every exception still exists (a stale entry exempts the next arrival by accident)', () => {
    const live = new Set(writes.map((w) => `${w.file} → ${w.path}`))
    const dead = [...ALLOWED].filter((e) => !live.has(e))
    expect(
      dead,
      'these sites no longer make a raw api() write — drop them from ALLOWED, or a future write to the same file+endpoint is exempted without anyone deciding that',
    ).toEqual([])
  })
})
