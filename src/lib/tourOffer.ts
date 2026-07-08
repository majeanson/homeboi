import { useQueryClient } from '@tanstack/react-query'
import { createDeviceStore } from './createDeviceStore'
import { useAudience } from './audience'
import { isGuest, isPaired } from './device'
import { DISCOVERY_PROBES } from './discovery'

// A-5 auto-offer (bmad/08, design settled with Marc 2026-07-08): the discovery
// tour already exists behind a manual « Faire le tour » button in Découvrir —
// this is the QUIET nudge that a power user gets toward it, at most once a
// month. Decisions: signal = a LOCAL device proxy (never a server audit),
// surface = a whisper-dot on the Réglages nav tab (no count, no red, no push —
// calm), audience = the operator/full-parent only (never guest / kiosk /
// locked lens, per OQ-5).
//
// The power-user signal is a per-device WRITE COUNTER bumped by writeWith():
// someone who has edited ≥ WRITES_MIN times on this device uses the app for
// real, so "corners you haven't visited" is a fair, non-nagging offer. The
// number is a heuristic, never displayed — nothing here scores anyone.
//
// The dot also requires the discovery probes to already KNOW (from the query
// CACHE alone — no fetch is ever fired for a dot) that ≥ MIN_SLEEPING features
// sleep. Cold caches → no dot this session; it's a whisper, not a campaign.
// Opening Découvrir stamps the offer date, so the dot rests ≥ COOLDOWN_DAYS
// no matter what the user did there.

const WRITES_MIN = 30
const MIN_SLEEPING = 2
const COOLDOWN_DAYS = 30

const writes = createDeviceStore<number>('babillard-write-count', 0, {
  read: (raw) => {
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  },
  write: (v) => String(v),
})

// Called by writeWith() on every real (non-guest) write attempt.
export function bumpWriteCount(): void {
  writes.set(writes.get() + 1)
}

const offeredAt = createDeviceStore<number>('babillard-tour-offer-at', 0, {
  read: (raw) => {
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : 0
  },
  write: (v) => String(v),
})

// Stamp when Découvrir is actually seen — the offer rests for COOLDOWN_DAYS
// whether or not the tour was taken (a declined whisper must not repeat).
export function markTourOffered(): void {
  offeredAt.set(Date.now())
}

// Whether the quiet Réglages-tab dot should show right now.
export function useTourOfferDot(): boolean {
  const qc = useQueryClient()
  const { audience, locked } = useAudience()
  const writeCount = writes.use()
  const lastOffer = offeredAt.use()
  if (audience !== 'parent' || locked || isGuest() || isPaired()) return false
  if (writeCount < WRITES_MIN) return false
  if (lastOffer && Date.now() - lastOffer < COOLDOWN_DAYS * 86_400_000) return false
  // Cache-only peek at the discovery probes: count features PROVABLY sleeping
  // from data another page already fetched. Never fetch for a dot.
  let sleeping = 0
  for (const p of DISCOVERY_PROBES) {
    const data = qc.getQueryData(p.key as unknown as readonly unknown[])
    if (data !== undefined && p.unused(data)) sleeping++
  }
  return sleeping >= MIN_SLEEPING
}
