// D-19 (bmad/10) — « La carte de la gardienne se complète ». The sitter card
// (HandoffPage.tsx) is the strongest guest surface in the app, and it fails exactly
// once: when minted over missing data, the sitter's only screen is a terminal empty
// state. This is the pure gap-detector: given the SAME payload the operator's own
// preview reads (GET /api/guest/window?kind=sitter — the exact JSON HandoffPage
// renders), return which sections are empty so the mint UI (operator/guest.tsx) can
// nudge the operator to complete them BEFORE the link goes out. Advisory only — it
// never blocks minting.

export type HandoffGap = 'emergency' | 'toKnow' | 'bedtimeRoutines' | 'wifiSsid' | 'pins'

// A structural subset of guest/window's sitter payload — just the fields gap
// detection reads. (The real shape carries `today`/`householdName`/etc. too; those
// never gate a gap.)
export interface SitterWindowLike {
  wifi?: { ssid?: string | null } | null
  emergency?: { name: string; phone: string | null }[] | null
  toKnow?: { name: string; isChild: boolean; notes: string | null }[] | null
  bedtimeRoutines?: { id: string; name: string }[] | null
  pins?: { kind: string; label: string }[] | null
}

// Canonical order — the same order the plan names them in, so the mint UI's list
// reads the same every time regardless of object key order in the response.
export const HANDOFF_GAP_ORDER: readonly HandoffGap[] = ['emergency', 'toKnow', 'bedtimeRoutines', 'wifiSsid', 'pins']

export function handoffGaps(data: SitterWindowLike | null | undefined): HandoffGap[] {
  if (!data) return [...HANDOFF_GAP_ORDER]
  const gaps: HandoffGap[] = []
  if (!data.emergency || data.emergency.length === 0) gaps.push('emergency')
  if (!data.toKnow || data.toKnow.length === 0) gaps.push('toKnow')
  if (!data.bedtimeRoutines || data.bedtimeRoutines.length === 0) gaps.push('bedtimeRoutines')
  if (!data.wifi?.ssid) gaps.push('wifiSsid')
  if (!data.pins || data.pins.length === 0) gaps.push('pins')
  return gaps
}
