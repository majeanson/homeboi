import { badRequest, ok, serviceUnavailable, withAiError } from '../_lib/json'
import { authed } from '../_lib/route'
import { resolveLang } from '../_lib/ai'

// Server STT for the ONE context where on-device Web Speech is dead: an iOS/iPadOS
// installed PWA. There webkitSpeechRecognition starts then aborts instantly with
// zero audio (the standalone-sandbox dictation restriction — confirmed via a
// minimal-ui test where voice revived), but getUserMedia/MediaRecorder still work.
// So the client records a short clip and we transcribe it here with Workers AI
// Whisper, feeding the text back into the SAME capture spine as typed input.
//
// Any actor — a parent-mode kiosk captures too (only member admin + pairing are
// operator-gated). AI unset → 503 so the client keeps the manual type-picker
// (same graceful-degrade contract as /api/capture). The "turbo" model takes a
// `language` hint, which materially helps short FR-CA grocery clips that the base
// model otherwise mis-detects as English.

// Short household captures are tiny (a few seconds); this cap just stops an
// oversized upload reaching the model. Mirrors recipe-vision's byte guard.
const MAX_BYTES = 8 * 1024 * 1024

// ArrayBuffer → base64 for the turbo model's `audio` field. Chunked so a multi-KB
// clip never blows String.fromCharCode's argument limit (same trick as auth.ts's
// base64url, minus the url-safe swap — the model wants standard base64).
function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

export const onRequestPost = authed(async (ctx) => {
  if (!ctx.env.AI) return serviceUnavailable('Transcription vocale indisponible ici.')
  const type = ctx.request.headers.get('content-type') ?? ''
  // MediaRecorder sends e.g. "audio/mp4;codecs=..." (iOS) or "audio/webm" — the
  // prefix check accepts both while rejecting a stray JSON/blob upload.
  if (!type.startsWith('audio/')) return badRequest('Audio requis.')
  const buf = await ctx.request.arrayBuffer()
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return badRequest('Audio vide ou trop grand.')

  const lang = resolveLang(ctx.env, ctx.request)
  const report = { error: null as string | null }
  let text = ''
  try {
    // The turbo model returns the transcript at top-level `text`; some builds nest
    // it under `transcription_info.text` — accept either so a shape change doesn't
    // silently yield "". (See the 70B `response`-shape gotcha in _lib/ai.ts.)
    const res = (await ctx.env.AI.run('@cf/openai/whisper-large-v3-turbo', {
      audio: toBase64(new Uint8Array(buf)),
      task: 'transcribe',
      language: lang,
    })) as { text?: string; transcription_info?: { text?: string } }
    text = (res?.text ?? res?.transcription_info?.text ?? '').trim()
  } catch (err) {
    // Same journal path as the capture router: tag the response so lib/api pops the
    // acknowledge-into-log notice and the prod ai_errors view records the cause.
    report.error = err instanceof Error ? err.message : 'whisper failed'
  }
  return withAiError(ok({ text }), report)
})
