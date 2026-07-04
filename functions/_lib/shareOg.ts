// « Partager » — Open Graph / Twitter-card copy for a shared /partage/<id> link, so it
// unfurls with a title + blurb (+ photo where there is one) in Messages / Messenger /
// WhatsApp instead of a generic « Babillard ». PURE + total (no Env/CF types), so it's
// unit-testable; worker/index.ts calls it and rewrites the SPA shell's <head> via
// HTMLRewriter. Returns RAW (unescaped) strings — the caller escapes when it appends the
// tags as HTML (and HTMLRewriter escapes setInnerContent/setAttribute itself).

import { isShareKind, type ShareKind } from './shareSnapshots'

export interface OgMeta {
  title: string
  description: string
  image?: string // absolute URL (a remote https image, or origin + /api/img/<key>)
}

const HTTPS = /^https?:\/\//i

// The best image for a share, as an ABSOLUTE url — a recipe's photo, or a routine's
// first card photo. Event/family have none (the crawler falls back to the app icon).
function imageFor(kind: ShareKind, payload: Record<string, unknown>, origin: string): string | undefined {
  if (kind === 'recipe') {
    const img = payload.image
    if (typeof img === 'string' && img) return HTTPS.test(img) ? img : `${origin}/api/img/${img}`
  }
  if (kind === 'routine' && Array.isArray(payload.cards)) {
    const card = (payload.cards as { photoKey?: string }[]).find((c) => c?.photoKey)
    if (card?.photoKey) return `${origin}/api/img/${card.photoKey}`
  }
  return undefined
}

// Build the meta for a live share, or null when the kind is unknown (→ leave the shell's
// generic tags). `label`/`payloadJson` come straight from the shares row.
export function shareOgMeta(
  kind: string,
  label: string,
  payloadJson: string,
  origin: string,
  id: string,
): OgMeta | null {
  if (!isShareKind(kind)) return null
  let payload: Record<string, unknown> = {}
  try {
    const p = JSON.parse(payloadJson)
    if (p && typeof p === 'object') payload = p as Record<string, unknown>
  } catch {
    /* a corrupt payload still gets a bare title from the label */
  }
  const name =
    (label || (typeof payload.title === 'string' ? payload.title : '') || (typeof payload.name === 'string' ? payload.name : '')).trim() ||
    'Babillard'

  let title: string
  let description: string
  if (kind === 'recipe') {
    title = `${name} — une recette partagée sur Babillard`
    description = 'Ouvre la recette (photo, ingrédients, étapes) — ou ajoute-la à ton livre avec Babillard.'
  } else if (kind === 'event') {
    title = `${name} — un rendez-vous partagé`
    description = 'Un rendez-vous partagé sur Babillard — ajoute-le à ton agenda.'
  } else if (kind === 'routine') {
    title = `${name} — une routine illustrée`
    description = 'Une routine en images, partagée sur Babillard.'
  } else {
    title = `${name} — partagé sur Babillard`
    description = 'Partagé avec Babillard, le babillard familial calme pour la maison.'
  }
  const image = imageFor(kind, payload, origin)
  // id kept in the signature for the caller's og:url, not needed in the copy itself.
  void id
  return image ? { title, description, image } : { title, description }
}
