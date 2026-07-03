// « Partager » — the pure core of the generic snapshot-share rail (migration 0102).
// Kept free of Env / CF types so it's unit-testable AND shareable in shape with the
// SPA: the per-kind payload types below are exactly what /api/share-public returns
// and what the public /partage page renders + a signed-in visitor imports.
//
// A snapshot is a one-time COPY: the server materializes it from the sender's own
// household-scoped DB row (recipe / event / routine) so the client never names an R2
// key — no anti-exfiltration surface. Family is the exception (a family isn't a row
// but a derived subgraph), so it keeps its client-materialized IntakeSubmission +
// ownership guard in the handler; here we only need its blob-key lister for cleanup.
//
// Media keys inside a stored payload are SHARE-OWNED R2 copies (prefix `sh`, or legacy
// `fs` on rows migrated from 0100): the copy is minted at create time so the snapshot
// survives the source row/photo being deleted, and freed on revoke/expire. `image` on a
// recipe may instead be a remote https URL (imported) — that's passed through untouched,
// never copied and never freed (we don't own it).

import { isValidR2Key } from './validate'
import { intakeMediaKeys, type IntakeSubmission } from './intake'

export type ShareKind = 'family' | 'recipe' | 'event' | 'routine'
export const SHARE_KINDS: readonly ShareKind[] = ['family', 'recipe', 'event', 'routine']
export function isShareKind(v: unknown): v is ShareKind {
  return typeof v === 'string' && (SHARE_KINDS as readonly string[]).includes(v)
}

// ---- Per-kind TTL window ---------------------------------------------------
// Mirrors clampShareTtl in _lib/shareModes.ts (the guest-link clamp). Content shares
// (a recipe you text a friend) live ~a year — long-lived but still expiring, never
// permanent; a family snapshot is third-party PII, so it stays the short 30 days 0100
// used. The v1 UI never requests a custom TTL (defaults only), but the clamp exists +
// is tested so a future "expires in…" picker can't be talked past the ceiling.
const DAY = 24 * 60 * 60
const MIN_TTL = 30 * 60 // 30 min floor, matching the guest-link clamp
const TTL_BY_KIND: Record<ShareKind, { max: number; def: number }> = {
  family: { max: 30 * DAY, def: 30 * DAY },
  recipe: { max: 365 * DAY, def: 365 * DAY },
  event: { max: 365 * DAY, def: 365 * DAY },
  routine: { max: 365 * DAY, def: 365 * DAY },
}

// Clamp a requested TTL (seconds) into the kind's window, or the kind default when the
// request is absent/non-finite. Same shape as clampShareTtl so the two read alike.
export function clampSnapshotTtl(kind: ShareKind, requested: unknown): number {
  const { max, def } = TTL_BY_KIND[kind]
  if (requested == null) return def // absent → default (Number(null) is 0, so guard first)
  const raw = Number(requested)
  return Number.isFinite(raw) ? Math.min(max, Math.max(MIN_TTL, Math.floor(raw))) : def
}

// ---- Payload shapes (the wire + render contract) ---------------------------

export interface RecipeSharePayload {
  title: string
  ingredients: string[] // flat lines; inline '## Section' headings ride along (renderers skip them)
  steps: string[]
  servings: number | null
  servingsUnit: string | null
  prepMin: number | null
  cookMin: number | null
  totalMin: number | null
  notes: string | null
  source: string | null
  image: string | null // share-owned R2 key OR a remote https URL (pass-through)
  stepImages: string[] // parallel to steps; '' = none; share-owned R2 keys
  tags: string[]
  lang: string | null
}

export interface EventSharePayload {
  title: string
  startAt: number
  allDay: boolean
  // A display string only (the contact/business/member name already joined at read
  // time) — never an id. Sharing an event must not leak who in the household it's tied
  // to, only "BBQ chez les Tremblay — samedi".
  whoLabel: string | null
}

export interface RoutineShareCard {
  icon: string
  label: string
  seconds?: number
  photoKey: string // share-owned R2 key, or '' when the card has no photo (uses its emoji)
}
export interface RoutineSharePayload {
  name: string
  timeOfDay: string | null // 'morning' | 'afternoon' | 'evening' | null
  cards: RoutineShareCard[]
  // Note: parent-voice narration clips are deliberately NOT shared (a parent's recorded
  // voice is personal). A future opt-in could add them here; the renderer degrades to TTS.
}

// ---- Blob-key helpers (creation copy + revoke/expire free) -----------------

const HTTPS = /^https?:\/\//i
const isR2 = (v: unknown): v is string => typeof v === 'string' && !HTTPS.test(v) && isValidR2Key(v)

// Every SHARE-OWNED R2 key a stored payload references — freed on revoke/expire, and
// (before the copy) the source keys to duplicate at create time. Never returns an https
// image (we don't own it). Total; tolerates a malformed payload by returning [].
export function snapshotBlobKeys(kind: ShareKind, payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return []
  if (kind === 'recipe') {
    const p = payload as Partial<RecipeSharePayload>
    const keys: string[] = []
    if (isR2(p.image)) keys.push(p.image)
    if (Array.isArray(p.stepImages)) for (const k of p.stepImages) if (isR2(k)) keys.push(k)
    return keys
  }
  if (kind === 'routine') {
    const p = payload as Partial<RoutineSharePayload>
    const keys: string[] = []
    if (Array.isArray(p.cards)) for (const c of p.cards) if (isR2(c?.photoKey)) keys.push(c.photoKey)
    return keys
  }
  if (kind === 'family') {
    return intakeMediaKeys(payload as IntakeSubmission)
  }
  return [] // event carries no media
}

// Rewrite every share-owned R2 key in a recipe/routine payload through `map` (the
// original→copy lookup built after copyR2Blob). A key `map` resolves to null is dropped
// (image → null, a step/card photo → '') so a failed copy degrades to text, matching the
// optional-R2 contract. An https image is left untouched. Family is NOT handled here —
// its create path keeps snapshotPhotos (it also filters unowned keys via a DB lookup).
// PURE: returns a new payload, never mutates the input.
export function remapSnapshotBlobKeys<T>(kind: ShareKind, payload: T, map: (key: string) => string | null): T {
  if (kind === 'recipe') {
    const p = payload as RecipeSharePayload
    return {
      ...p,
      image: isR2(p.image) ? map(p.image) : p.image,
      stepImages: (p.stepImages ?? []).map((k) => (isR2(k) ? map(k) ?? '' : k)),
    } as T
  }
  if (kind === 'routine') {
    const p = payload as RoutineSharePayload
    return {
      ...p,
      cards: (p.cards ?? []).map((c) => ({ ...c, photoKey: isR2(c.photoKey) ? map(c.photoKey) ?? '' : c.photoKey })),
    } as T
  }
  return payload
}

// ---- Snapshot builders (shape a household-scoped DB row → a clean payload) --
// These run AFTER the row is fetched WHERE household_id = actor, so every value is
// already ours + already sanitized on write; we only re-shape + defensively cap total
// size (a snapshot may be public forever). Media keys are the ORIGINAL owned keys here;
// the handler copies them to `sh` blobs via remapSnapshotBlobKeys.

const s = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')
const sOrNull = (v: unknown, max: number): string | null => {
  const t = typeof v === 'string' ? v.trim().slice(0, max) : ''
  return t || null
}
const intOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null
const strList = (v: unknown, max = 60, maxLen = 500): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, maxLen)).slice(0, max) : []

export interface RecipeSnapshotSource {
  title: string
  ingredients: unknown
  steps: unknown
  servings: number | null
  servingsUnit: string | null
  prepMin: number | null
  cookMin: number | null
  totalMin: number | null
  notes: string | null
  source: string | null
  image: string | null
  stepImages: unknown
  tags: unknown
  lang: string | null
}

export function buildRecipeSnapshot(src: RecipeSnapshotSource): RecipeSharePayload {
  const steps = strList(src.steps, 60, 500)
  // stepImages kept parallel to steps: pad/trim to the step count, validate each entry.
  const rawStepImages = Array.isArray(src.stepImages) ? src.stepImages : []
  const stepImages = steps.map((_, i) => (isR2(rawStepImages[i]) ? (rawStepImages[i] as string) : ''))
  const image = typeof src.image === 'string' && (HTTPS.test(src.image) || isR2(src.image)) ? src.image : null
  return {
    title: s(src.title, 200).trim() || 'Recette',
    ingredients: strList(src.ingredients, 60, 200),
    steps,
    servings: src.servings != null && src.servings > 0 ? Math.floor(src.servings) : null,
    servingsUnit: sOrNull(src.servingsUnit, 24),
    prepMin: intOrNull(src.prepMin),
    cookMin: intOrNull(src.cookMin),
    totalMin: intOrNull(src.totalMin),
    notes: sOrNull(src.notes, 2000),
    source: sOrNull(src.source, 200),
    image,
    stepImages,
    tags: strList(src.tags, 8, 24),
    lang: src.lang === 'fr' || src.lang === 'en' ? src.lang : null,
  }
}

export interface EventSnapshotSource {
  title: string
  startAt: number
  allDay: boolean | number | null
  whoLabel: string | null
}

export function buildEventSnapshot(src: EventSnapshotSource): EventSharePayload {
  return {
    title: s(src.title, 200).trim() || 'Rendez-vous',
    startAt: Math.floor(Number(src.startAt) || 0),
    allDay: !!src.allDay,
    whoLabel: sOrNull(src.whoLabel, 80),
  }
}

export interface RoutineSnapshotSource {
  name: string
  timeOfDay: string | null
  cards: unknown // [{ icon, label, seconds?, ... }]
  cardsPhoto: unknown // parallel R2-key array (or '')
}

export function buildRoutineSnapshot(src: RoutineSnapshotSource): RoutineSharePayload {
  const rawCards = Array.isArray(src.cards) ? src.cards : []
  const rawPhotos = Array.isArray(src.cardsPhoto) ? src.cardsPhoto : []
  const cards: RoutineShareCard[] = rawCards.slice(0, 12).map((c, i) => {
    const o = (c ?? {}) as Record<string, unknown>
    const secs = typeof o.seconds === 'number' && Number.isFinite(o.seconds) && o.seconds > 0
      ? Math.min(Math.round(o.seconds), 3600)
      : undefined
    const card: RoutineShareCard = {
      icon: s(o.icon, 40),
      label: s(o.label, 80),
      photoKey: isR2(rawPhotos[i]) ? (rawPhotos[i] as string) : '',
    }
    if (secs) card.seconds = secs
    return card
  })
  return {
    name: s(src.name, 80).trim() || 'Routine',
    timeOfDay:
      src.timeOfDay === 'morning' || src.timeOfDay === 'afternoon' || src.timeOfDay === 'evening'
        ? src.timeOfDay
        : null,
    cards,
  }
}
