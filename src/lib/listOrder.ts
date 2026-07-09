// Where a « pas pressé » line sits in la liste.
//
// A « pas pressé » line is only worth buying if an aubaine happens to be on, so it
// must never sit between two real errands in an order nobody chose: every
// AUTOMATIC order settles it at the BOTTOM — where a new line lands, the "Par
// allée" sort, and the "Trier par allée" seed.
//
// The one order that does NOT is "Mon ordre": a row a shopper deliberately dragged
// up stays exactly where they put it. That's why the rules below only ever look at
// the TRAILING run of flagged rows — a flagged row sitting mid-list is a choice,
// not a slot to reclaim.
export interface NoRushRow {
  non_urgent?: number | null // 1 = « pas pressé »
}

// The primary key of every automatic sort: errands (0) before « pas pressé » (1).
export function rushRank(row: NoRushRow): number {
  return row.non_urgent ? 1 : 0
}

// The index where the trailing run of « pas pressé » rows begins — i.e. the slot a
// new line takes so that block stays at the bottom. Equals `rows.length` when the
// last row is an ordinary errand (nothing to step over).
export function noRushStart(rows: NoRushRow[]): number {
  let i = rows.length
  while (i > 0 && rows[i - 1].non_urgent) i--
  return i
}
