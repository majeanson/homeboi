import { CHILD_TABLES, EXEMPT_TABLES, scopeColumn } from './demoHousehold'
import { dealEnded } from '../../src/lib/deals'

// « Est-ce que la maison tient encore debout ? » — the laws this repo writes down,
// checked against the REAL database instead of against the source.
//
// ─────────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS. This codebase's best feature is its build-gating guards —
// calm-tenets, write-rule, intl-rule, field-fit, layer-order, chip-rule, devkitParity,
// docCounts, nested-interactive, glossary, undoTier, tour-rule, link-button-rule.
// Thirteen of them, and CLAUDE.md is right that they are the best thing here.
//
// EVERY ONE OF THEM READS SOURCE CODE. Not one reads a row.
//
// So laws stated as laws — « media_key is set iff media_kind is set », « JSON columns
// default to '[]'/'{}' and are NOT NULL, never a bare NULL a reader has to guard »,
// « every *_by / *_id-without-FK is a soft ref » — are enforced at the moment a
// migration is written and never again. A handler that writes one half of the media
// pair, a restore that remaps a member id wrong, a deal that outlived its flyer: all
// of those are green forever under the existing suite.
//
// This is the other tier. It is READ-ONLY, per-household, and it reports — it never
// repairs. A repair is a verdict, and a verdict about a family's own data belongs to
// the family, not to a scan.
//
// ─────────────────────────────────────────────────────────────────────────────────
// IT DISCOVERS THE SCHEMA, IT DOES NOT RESTATE IT.
//
// The first draft carried a hand-written list of the eight tables that hold the
// media pair. That list is a VERDICT FROM A MOMENT — the exact failure mode STATE.md
// warns about, and it would have been wrong within one migration. Worse, a stale list
// does not fail: it quietly checks seven tables and reports green.
//
// So the media, scene-key, timestamp and unscoped-table checks READ sqlite_master and
// pragma_table_info at run time. A table that grows the pair joins the check by
// existing. That is also why this file needed no edit when « Les remarques » added
// remark_events — the check found it.
//
// The two checks that cannot be discovered honestly say so: the JSON-column scan
// discovers candidates by parsing the stored DDL (and REPORTS how many it found, so a
// sudden drop is visible rather than silent), and the soft-ref scan matches the column
// NAMES this schema uses for a member reference. Both are documented as partial where
// they are partial. A guard that overstates its own coverage is worse than no guard.
// ─────────────────────────────────────────────────────────────────────────────────

/** One row that breaks a law. `id` is the row's primary key, for grepping. */
export interface Violation {
  table: string
  id: string
  detail: string
}

export type InvariantOutcome =
  /** Checked, nothing wrong. */
  | { status: 'ok'; checked: string }
  /** Checked, and these rows break it. `total` may exceed `violations.length` (capped). */
  | { status: 'violated'; violations: Violation[]; total: number }
  /** NOT checked, and why — a missing table, a runtime without JSON1, a query that threw.
   *  Never folded into 'ok': « I could not look » and « I looked and it is fine » are
   *  different answers, and collapsing them is how a scan starts lying. */
  | { status: 'skipped'; reason: string }

export interface InvariantReport {
  key: string
  title: string
  /** One sentence a reader can act on — what breaks in the app when this is violated. */
  why: string
  outcome: InvariantOutcome
}

/** Per invariant. A household with a systemic break should produce a readable report,
 *  not a megabyte: the count is exact, the examples are capped. */
const MAX_EXAMPLES = 20

// ---- the live schema, read once per call -----------------------------------------

interface TableInfo {
  name: string
  columns: Set<string>
  /** The stored CREATE TABLE text. SQLite rewrites it on ALTER TABLE ADD COLUMN, so
   *  it stays current — but it is only ever used to FIND candidates, never to decide
   *  that a column exists (pragma_table_info decides that). */
  sql: string
}

export type Schema = Map<string, TableInfo>

export async function loadSchema(db: D1Database): Promise<Schema> {
  const { results } = await db
    .prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf%' ESCAPE '\\' ORDER BY name",
    )
    .all<{ name: string; sql: string | null }>()
  const names = results.map((r) => r.name)
  // One batch rather than N awaits: ~80 tables, and a round trip each would dominate
  // the whole check.
  const infos = await db.batch<{ name: string }>(
    names.map((n) => db.prepare('SELECT name FROM pragma_table_info(?1)').bind(n)),
  )
  const schema: Schema = new Map()
  names.forEach((name, i) => {
    schema.set(name, {
      name,
      columns: new Set((infos[i]?.results ?? []).map((c) => c.name)),
      sql: results[i]?.sql ?? '',
    })
  })
  return schema
}

/** Does this table carry every one of these columns? */
const has = (t: TableInfo | undefined, ...cols: string[]): boolean =>
  !!t && cols.every((c) => t.columns.has(c))

/**
 * How to narrow a table to ONE household, as a SQL fragment binding `?1`.
 *
 * Three shapes, and the mapping is not invented here: `scopeColumn()` and
 * `CHILD_TABLES` are the sweep's own data (functions/_lib/demoHousehold.ts), which a
 * build-gating test already forces to stay complete. Reusing them means this scan and
 * the demo sweep can never disagree about what belongs to a household.
 */
function scopeSql(schema: Schema, table: string): { sql: string } | { skip: string } {
  const info = schema.get(table)
  if (!info) return { skip: `table « ${table} » absente du schéma` }

  const own = scopeColumn(table)
  if (info.columns.has(own)) return { sql: `"${table}"."${own}" = ?1` }

  const child = CHILD_TABLES.find(([t]) => t === table)
  if (child) {
    const [, fk, parent] = child
    const p = schema.get(parent)
    const pScope = scopeColumn(parent)
    if (p?.columns.has(pScope) && info.columns.has(fk)) {
      return { sql: `"${table}"."${fk}" IN (SELECT "id" FROM "${parent}" WHERE "${pScope}" = ?1)` }
    }
  }
  return { skip: `« ${table} » n'a aucune colonne de portée et n'est pas un enfant connu` }
}

/** A column is "set" when it is neither NULL nor the empty string — '' is what an
 *  over-eager form posts, and it is not the same thing as absent. */
const isSet = (t: string, c: string) => `("${t}"."${c}" IS NOT NULL AND "${t}"."${c}" <> '')`
const notSet = (t: string, c: string) => `("${t}"."${c}" IS NULL OR "${t}"."${c}" = '')`

/** Run one scoped SELECT that yields `{ id, detail }` rows, capped. */
async function collect(
  db: D1Database,
  sql: string,
  householdId: string,
  table: string,
  describe: (row: Record<string, unknown>) => string,
): Promise<Violation[]> {
  const { results } = await db.prepare(sql).bind(householdId).all<Record<string, unknown>>()
  return results.map((r) => ({ table, id: String(r.id ?? '?'), detail: describe(r) }))
}

const capped = (all: Violation[], checked: string): InvariantOutcome =>
  all.length === 0
    ? { status: 'ok', checked }
    : { status: 'violated', violations: all.slice(0, MAX_EXAMPLES), total: all.length }

// ---- the invariants ---------------------------------------------------------------

export interface Invariant {
  key: string
  title: string
  why: string
  run: (db: D1Database, schema: Schema, householdId: string, now: number) => Promise<InvariantOutcome>
}

/** Tables carrying BOTH halves of the media trio — discovered, never listed. */
const mediaPairTables = (schema: Schema): string[] =>
  [...schema.values()].filter((t) => has(t, 'media_kind', 'media_key', 'id')).map((t) => t.name)

export const INVARIANTS: readonly Invariant[] = [
  {
    key: 'media-pair',
    title: 'media_key est mis ssi media_kind est mis',
    why: "Une clé sans genre est un blob R2 que rien ne sait afficher et que la sweep ne libère pas ; un genre sans clé rend une pièce jointe vide. CLAUDE.md l'écrit comme un invariant — personne ne le vérifiait.",
    run: async (db, schema, hh) => {
      const tables = mediaPairTables(schema)
      if (tables.length === 0) return { status: 'skipped', reason: 'aucune table ne porte la paire' }
      const out: Violation[] = []
      for (const table of tables) {
        const scope = scopeSql(schema, table)
        if ('skip' in scope) continue
        out.push(
          ...(await collect(
            db,
            `SELECT "id", "media_kind", "media_key" FROM "${table}" WHERE ${scope.sql}
               AND ((${isSet(table, 'media_key')} AND ${notSet(table, 'media_kind')})
                 OR (${isSet(table, 'media_kind')} AND ${notSet(table, 'media_key')}))`,
            hh,
            table,
            (r) => (r.media_key ? `clé « ${String(r.media_key)} » sans genre` : `genre « ${String(r.media_kind)} » sans clé`),
          )),
        )
      }
      return capped(out, `${tables.length} table(s) portant la paire`)
    },
  },

  {
    key: 'scene-key-drawing',
    title: "scene_key n'existe que sur un dessin",
    why: "scene_key porte la scène ré-éditable d'un DrawPad. Sur un média qui n'est pas un dessin, il ouvre un éditeur sur du vide.",
    run: async (db, schema, hh) => {
      // Only tables that ALSO have media_kind: `drawings` carries a scene_key with no
      // kind column because the whole table IS drawings — checking it would be a
      // guaranteed false positive, which is how a guard teaches people to ignore it.
      const tables = mediaPairTables(schema).filter((t) => has(schema.get(t), 'scene_key'))
      if (tables.length === 0) return { status: 'skipped', reason: 'aucune table ne porte scene_key + media_kind' }
      const out: Violation[] = []
      for (const table of tables) {
        const scope = scopeSql(schema, table)
        if ('skip' in scope) continue
        out.push(
          ...(await collect(
            db,
            `SELECT "id", "media_kind" FROM "${table}" WHERE ${scope.sql}
               AND ${isSet(table, 'scene_key')} AND ("${table}"."media_kind" IS NULL OR "${table}"."media_kind" <> 'drawing')`,
            hh,
            table,
            (r) => `scene_key posé mais media_kind = ${r.media_kind == null ? 'NULL' : `« ${String(r.media_kind)} »`}`,
          )),
        )
      }
      return capped(out, `${tables.length} table(s)`)
    },
  },

  {
    key: 'json-columns',
    title: 'Une colonne JSON contient du JSON du bon type',
    why: "CLAUDE.md : « default arrays to '[]', objects to '{}', always NOT NULL — never a bare NULL a reader has to guard ». Un '' ou un JSON cassé fait planter le lecteur, ou le fait taire — demoHousehold.ts en avale deux en silence.",
    run: async (db, schema, hh) => {
      // DISCOVERY IS PARTIAL AND SAYS SO. The candidates come from the stored DDL, so a
      // column declared in a shape this regex misses is simply not checked. `checked`
      // reports the count for exactly that reason: a sudden drop is the tell.
      const re = /["`[]?(\w+)["`\]]?\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'(\[\]|\{\})'/gi
      const candidates: { table: string; column: string; kind: 'array' | 'object' }[] = []
      for (const t of schema.values()) {
        for (const m of t.sql.matchAll(re)) {
          if (t.columns.has(m[1])) {
            candidates.push({ table: t.name, column: m[1], kind: m[2] === '[]' ? 'array' : 'object' })
          }
        }
      }
      if (candidates.length === 0) return { status: 'skipped', reason: 'aucune colonne JSON repérée dans le DDL' }

      const out: Violation[] = []
      for (const { table, column, kind } of candidates) {
        const scope = scopeSql(schema, table)
        if ('skip' in scope) continue
        try {
          out.push(
            ...(await collect(
              db,
              `SELECT "id", "${column}" AS v FROM "${table}" WHERE ${scope.sql}
                 AND ("${table}"."${column}" IS NULL OR "${table}"."${column}" = ''
                   OR json_valid("${table}"."${column}") = 0
                   OR json_type("${table}"."${column}") <> '${kind}')`,
              hh,
              table,
              (r) => `${column} : ${r.v == null ? 'NULL' : r.v === '' ? 'vide' : `pas un ${kind} JSON — « ${String(r.v).slice(0, 60)} »`}`,
            )),
          )
        } catch (err) {
          // json_valid/json_type are SQLite's JSON1. If this runtime lacks them, say so
          // once and stop — a scan that silently degrades to "nothing found" is the
          // failure this whole file exists to prevent.
          return { status: 'skipped', reason: `JSON1 indisponible (${String(err).slice(0, 120)})` }
        }
      }
      return capped(out, `${candidates.length} colonne(s) JSON`)
    },
  },

  {
    key: 'member-refs',
    title: 'Une réf membre pointe vers un membre DE CETTE maisonnée',
    why: "Une FK ne connaît pas les maisonnées : `REFERENCES members(id)` accepte parfaitement le membre de quelqu'un d'autre. C'est la moitié que seule une vérification comme celle-ci peut voir — et c'est une frontière de locataire déguisée en clé étrangère valide.",
    run: async (db, schema, hh) => {
      // TWO DIFFERENT BUGS, AND ONLY ONE OF THEM IS A DANGLING REF.
      //
      // Writing the test for this one turned up something worth knowing: most columns
      // this repo DOCUMENTS as soft refs are not. « soft ref: kept if the member goes »
      // sits in the migration one space away from `REFERENCES members(id)` — on
      // habits.member_id, mots.member_id, trip_notes.member_id and a dozen more. D1
      // enforces those, so a dangling ref is impossible there and this half of the
      // check simply never fires. (Whether the comment or the constraint is the mistake
      // is a real question, and not this file's to answer.)
      //
      // The genuinely FK-less ones are the columns added by ALTER TABLE, which cannot
      // carry a constraint — `list_items.added_by` (0011) is the model.
      //
      // The CROSS-HOUSEHOLD case, though, is invisible to every one of those FKs,
      // because a foreign key checks that the id exists, not whose it is. That is the
      // reason this invariant earns its place.
      //
      // Matched by NAME. These are the spellings this schema uses for « a member »
      // (DB-5 patterns 1 and 2 in CLAUDE.md). A new spelling is not checked until it
      // is added here — that is the honest limit of a name-based scan.
      const REF_COLUMNS = ['member_id', 'author_member_id', 'cook_member_id', 'added_by', 'suggested_by', 'reported_by']
      if (!has(schema.get('members'), 'id', 'household_id')) {
        return { status: 'skipped', reason: 'table members introuvable' }
      }
      const out: Violation[] = []
      let pairs = 0
      for (const t of schema.values()) {
        if (t.name === 'members' || !t.columns.has('id')) continue
        const scope = scopeSql(schema, t.name)
        if ('skip' in scope) continue
        for (const col of REF_COLUMNS) {
          if (!t.columns.has(col)) continue
          pairs++
          out.push(
            ...(await collect(
              db,
              `SELECT "id", "${col}" AS ref FROM "${t.name}" WHERE ${scope.sql}
                 AND ${isSet(t.name, col)}
                 AND NOT EXISTS (SELECT 1 FROM "members" m WHERE m."id" = "${t.name}"."${col}" AND m."household_id" = ?1)`,
              hh,
              t.name,
              (r) => `${col} → « ${String(r.ref)} », qui n'est pas un membre de cette maisonnée`,
            )),
          )
        }
      }
      return capped(out, `${pairs} colonne(s) de réf membre`)
    },
  },

  {
    key: 'expired-deals',
    title: 'Une aubaine encore sur la liste est encore valide',
    why: "Une aubaine périmée qui reste à cocher envoie quelqu'un à l'épicerie avec un prix qui n'existe plus — la caisse est le pire endroit pour l'apprendre.",
    run: async (db, schema, hh, now) => {
      if (!has(schema.get('list_items'), 'id', 'deal_json', 'checked_at', 'household_id')) {
        return { status: 'skipped', reason: 'list_items sans deal_json/checked_at' }
      }
      // Parsed in JS rather than in SQL on purpose: `dealEnded` (src/lib/deals.ts) reads
      // validTo as a LITERAL LOCAL calendar date, because new Date('2026-09-01') is UTC
      // midnight — the evening of Aug 31 in Québec, off by a day. That rule is imported,
      // never re-implemented: a second copy is the next bug. An unchecked list is small,
      // so there is nothing to optimise away here.
      const { results } = await db
        .prepare(
          'SELECT id, text, deal_json FROM list_items WHERE household_id = ?1 AND deal_json IS NOT NULL AND deal_json <> \'\' AND checked_at IS NULL',
        )
        .bind(hh)
        .all<{ id: string; text: string; deal_json: string }>()
      const out: Violation[] = []
      for (const row of results) {
        let validTo: string | null = null
        try {
          validTo = (JSON.parse(row.deal_json) as { validTo?: string | null }).validTo ?? null
        } catch {
          continue // a malformed deal_json is the json-columns check's business, not this one
        }
        if (dealEnded(validTo, now)) {
          out.push({ table: 'list_items', id: row.id, detail: `« ${row.text} » — aubaine finie le ${validTo}` })
        }
      }
      return capped(out, `${results.length} ligne(s) avec une aubaine`)
    },
  },

  {
    key: 'list-positions',
    title: 'Deux lignes de la liste ne partagent pas une position',
    why: "Sur la liste, `position` EST l'ordre à la main (mig 0078). Deux lignes à la même position rendent l'ordre dépendant du tri de secours — donc l'épicerie se réordonne toute seule entre deux chargements.",
    run: async (db, schema, hh) => {
      if (!has(schema.get('list_items'), 'position', 'household_id')) {
        return { status: 'skipped', reason: 'list_items sans position' }
      }
      // ONLY list_items, deliberately. The other `position` columns are group-scoped (a
      // trip's notes, a member's family notes), so a household-wide duplicate check on
      // them reports noise — and a noisy guard is one people learn to skip. list_items
      // is the one place position is household-wide AND documented as authoritative:
      // NULL means « never hand-placed » and is not a violation (mig 0078).
      const { results } = await db
        .prepare(
          'SELECT position AS p, COUNT(*) AS c FROM list_items WHERE household_id = ?1 AND position IS NOT NULL GROUP BY position HAVING c > 1',
        )
        .bind(hh)
        .all<{ p: number; c: number }>()
      const out = results.map((r) => ({
        table: 'list_items',
        id: `position=${r.p}`,
        detail: `${r.c} lignes partagent la position ${r.p}`,
      }))
      return capped(out, 'list_items.position')
    },
  },

  {
    key: 'timestamps',
    title: "updated_at n'est jamais avant created_at",
    why: "Une ligne modifiée « avant » sa création est une horloge ou une écriture qui a menti. C'est bénin à l'écran et corrosif partout où on trie par fraîcheur.",
    run: async (db, schema, hh) => {
      const tables = [...schema.values()].filter((t) => has(t, 'id', 'created_at', 'updated_at')).map((t) => t.name)
      if (tables.length === 0) return { status: 'skipped', reason: 'aucune table datée des deux côtés' }
      const out: Violation[] = []
      let checked = 0
      for (const table of tables) {
        const scope = scopeSql(schema, table)
        if ('skip' in scope) continue
        checked++
        out.push(
          ...(await collect(
            db,
            `SELECT "id", "created_at" AS c, "updated_at" AS u FROM "${table}" WHERE ${scope.sql}
               AND "${table}"."updated_at" IS NOT NULL AND "${table}"."created_at" IS NOT NULL
               AND "${table}"."updated_at" < "${table}"."created_at"`,
            hh,
            table,
            (r) => `updated_at ${String(r.u)} < created_at ${String(r.c)}`,
          )),
        )
      }
      return capped(out, `${checked} table(s) datée(s)`)
    },
  },

  {
    key: 'table-scope',
    title: 'Toute table vivante appartient à une maisonnée ou dit pourquoi non',
    why: "Une table sans portée n'est ni balayée par le bac à sable, ni exportée par la sauvegarde, ni isolée entre locataires. C'est la seule vérification ici qui regarde le SCHÉMA plutôt que les lignes — et elle double le garde de build, contre la vraie base.",
    run: async (_db, schema) => {
      const out: Violation[] = []
      for (const t of schema.values()) {
        if (t.name === 'd1_migrations') continue
        if (EXEMPT_TABLES[t.name]) continue
        if (CHILD_TABLES.some(([c]) => c === t.name)) continue
        if (t.columns.has(scopeColumn(t.name))) continue
        out.push({ table: t.name, id: '—', detail: 'aucune colonne de portée, aucun parent, aucune exemption déclarée' })
      }
      return capped(out, `${schema.size} table(s) vivante(s)`)
    },
  },
]

/**
 * Run the lot for one household. Never throws: an invariant that explodes reports
 * itself as `skipped` with the error, because a diagnostic that takes the whole
 * request down with it is worse than the drift it was looking for.
 */
export async function checkInvariants(
  db: D1Database,
  householdId: string,
  now = Date.now(),
): Promise<{ at: number; reports: InvariantReport[] }> {
  let schema: Schema
  try {
    schema = await loadSchema(db)
  } catch (err) {
    return {
      at: Math.floor(now / 1000),
      reports: INVARIANTS.map((i) => ({
        key: i.key,
        title: i.title,
        why: i.why,
        outcome: { status: 'skipped', reason: `schéma illisible (${String(err).slice(0, 120)})` } as const,
      })),
    }
  }

  const reports: InvariantReport[] = []
  for (const inv of INVARIANTS) {
    let outcome: InvariantOutcome
    try {
      outcome = await inv.run(db, schema, householdId, now)
    } catch (err) {
      outcome = { status: 'skipped', reason: `la vérification a levé (${String(err).slice(0, 160)})` }
    }
    reports.push({ key: inv.key, title: inv.title, why: inv.why, outcome })
  }
  return { at: Math.floor(now / 1000), reports }
}

/** The one-screen summary, for the MCP tool's text block. */
export function summarize(report: { at: number; reports: InvariantReport[] }): string {
  const lines: string[] = []
  const bad = report.reports.filter((r) => r.outcome.status === 'violated')
  const skipped = report.reports.filter((r) => r.outcome.status === 'skipped')
  lines.push(
    bad.length === 0
      ? `Rien à signaler sur ${report.reports.length} invariants.`
      : `${bad.length} invariant(s) brisé(s) sur ${report.reports.length}.`,
  )
  for (const r of report.reports) {
    if (r.outcome.status === 'ok') lines.push(`✓ ${r.title} — ${r.outcome.checked}`)
    else if (r.outcome.status === 'skipped') lines.push(`· ${r.title} — NON VÉRIFIÉ : ${r.outcome.reason}`)
    else {
      lines.push(`✗ ${r.title} — ${r.outcome.total} ligne(s)`)
      lines.push(`    pourquoi : ${r.why}`)
      for (const v of r.outcome.violations) lines.push(`    ${v.table} ${v.id} : ${v.detail}`)
      if (r.outcome.total > r.outcome.violations.length) {
        lines.push(`    … et ${r.outcome.total - r.outcome.violations.length} autre(s)`)
      }
    }
  }
  if (skipped.length > 0) {
    lines.push('')
    lines.push(`NON VÉRIFIÉ ≠ CORRECT : ${skipped.length} vérification(s) n'ont pas pu regarder.`)
  }
  return lines.join('\n')
}
