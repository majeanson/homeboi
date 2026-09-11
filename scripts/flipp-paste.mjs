// Writes public/flipp-paste.js from the bookmarklet body in src/lib/flippList.ts.
//
// The bookmark a household saves is a tiny LOADER (lib/flippList `flippBookmarklet`):
// it adds a <script src="<their Babillard>/flipp-paste.js"> to flipp.com's page.
// The body itself lives in ONE place — between the BOOKMARKLET markers in the TS
// source, where the unit test runs it — and this script copies it into the static
// file the Worker serves. `src/lib/flippPaste.test.ts` fails the build when the
// two drift, so the fix is always: `node scripts/flipp-paste.mjs`, commit both.
//
// Why a loader (2026-09-10): the full body pasted as a bookmark's address stopped
// running on Marc's iPhone once it grew past ~3 KB — Safari showed the Favorites
// page instead, which is what a javascript: URL it cannot run looks like. A
// 200-character loader has no such edge, and the body can change without anyone
// re-copying a bookmark.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/lib/flippList.ts'), 'utf8')
const start = src.indexOf('/*BOOKMARKLET-START*/')
const end = src.indexOf('/*BOOKMARKLET-END*/')
if (start < 0 || end < 0) throw new Error('BOOKMARKLET markers not found in src/lib/flippList.ts')
const seg = src.slice(start, end)
const q1 = seg.indexOf("'")
const q2 = seg.lastIndexOf("'")
if (q1 < 0 || q2 <= q1) throw new Error('bookmarklet body literal not found between the markers')
// The TS source holds a single-quoted string literal; its escapes (\\s, \\n) are
// the string's, so evaluate the literal the way TS does to get the runtime text.
const body = new Function('return ' + seg.slice(q1, q2 + 1))()
const out = [
  '// « Coller de Babillard » — the Flipp bookmark\'s body. GENERATED from',
  '// src/lib/flippList.ts by scripts/flipp-paste.mjs — do not edit here.',
  body,
  '',
].join('\n')
fs.writeFileSync(path.join(root, 'public/flipp-paste.js'), out)
console.log(`public/flipp-paste.js written (${body.length} chars of body)`)
