import type { Env } from './env'
import { cleanTranscript } from './transcript'
import { resolveLang } from './ai'

// A voice mot's words (PLAN-mots A5, migration 0123).
//
// « Laisse un mot » gained audio with #38 and shipped with no TEXT surface for it:
// a voice mot's row and peek title were the generic « Mémo vocal », which tells you
// nothing about a message whose whole job is to be glanceable — and told a screen
// reader only that an audio file exists.
//
// Three things this is deliberately NOT:
//
//   • not on the response path. Whisper on a clip takes seconds; leaving a mot must
//     stay instant. The POST returns, then this runs under waitUntil and PATCHes the
//     row. Same fire-and-forget stance as the realtime broadcast hook.
//   • not required. AI unset is the ordinary local/degraded path, not a bug — the
//     transcript stays NULL and every reader falls back to the media label.
//   • not the source of truth. It's a convenience label (NFR-KID-2: a picture or a
//     sound carries the meaning, text never becomes required reading). The audio is
//     always one tap away in the peek, and no confidence score is ever shown —
//     a number would invite trusting the words more than the recording.
//
// Bounded on purpose: a clip longer than the recorder can produce, or a transcript
// longer than a fridge note, is a sign something went wrong rather than a message.
const MAX_BYTES = 8 * 1024 * 1024
const MAX_CHARS = 500

/**
 * Transcribe a stored audio blob and write it onto its mot. Best-effort: every
 * failure path leaves `transcript` NULL, which readers already handle.
 *
 * Call under `waitUntil` — never awaited by a request handler.
 */
export async function transcribeMot(env: Env, householdId: string, motId: string, mediaKey: string, request: Request): Promise<void> {
  try {
    if (!env.AI || !env.PHOTOS) return
    const obj = await env.PHOTOS.get(mediaKey)
    if (!obj) return
    const buf = await obj.arrayBuffer()
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return

    const res = (await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
      audio: toBase64(new Uint8Array(buf)),
      task: 'transcribe',
      language: resolveLang(env, request),
      // Trims silence server-side, which is the cheapest hallucination guard there
      // is. No `initial_prompt` here, unlike /api/transcribe: that primer is a
      // GROCERY vocabulary, and biasing a family message toward « lait, œufs, pain »
      // is exactly the kind of wrong-domain nudge that makes a model invent words.
      vad_filter: true,
      condition_on_previous_text: false,
    })) as { text?: string }

    // The same hallucination filter the capture path uses — a clip of silence comes
    // back as a stock phrase ("Sous-titres réalisés par…") often enough that storing
    // it would put nonsense on the fridge.
    const text = cleanTranscript((res?.text ?? '').trim()).slice(0, MAX_CHARS)
    if (!text) return

    // Scoped to the household AND to a still-live row: the sender may have deleted
    // the mot in the seconds this took.
    await env.DB.prepare('UPDATE mots SET transcript = ? WHERE id = ? AND household_id = ? AND deleted_at IS NULL')
      .bind(text, motId, householdId)
      .run()
  } catch {
    // Never surface: the mot itself was written and delivered. A missing transcript
    // is a label that didn't appear, not a lost message.
  }
}

// ArrayBuffer → base64 for the model's `audio` field, chunked so a multi-KB clip
// can't blow String.fromCharCode's argument limit (same trick as api/transcribe).
function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}
