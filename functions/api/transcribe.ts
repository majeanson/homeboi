import { badRequest, ok, withAiError } from '../_lib/json'
import { authed } from '../_lib/route'
import { resolveLang } from '../_lib/ai'
import { cleanTranscript } from '../_lib/transcript'

// Server STT for the ONE context where on-device Web Speech is dead: an iOS/iPadOS
// installed PWA. There webkitSpeechRecognition starts then aborts instantly with
// zero audio (the standalone-sandbox dictation restriction — confirmed via a
// minimal-ui test where voice revived), but getUserMedia/MediaRecorder still work.
// So the client records a short clip and we transcribe it here with Workers AI
// Whisper, feeding the text back into the SAME capture spine as typed input.
//
// Any actor — a parent-mode kiosk captures too (only member admin + pairing are
// operator-gated). `requiresAi` 503s when AI is off (binding unset OR household
// switched it off) so the client keeps the manual type-picker (same graceful-degrade
// contract as /api/capture). The "turbo" model takes a `language` hint, which
// materially helps short FR-CA grocery clips that the base model mis-detects as EN.

// Short household captures are tiny (a few seconds); this cap just stops an
// oversized upload reaching the model. Mirrors recipe-vision's byte guard.
const MAX_BYTES = 8 * 1024 * 1024

// Whisper's `language` hint locks the engine to French/English, but on a ~1.5s clip
// of two or three ISOLATED nouns ("lait, œufs, pain") that isn't enough — with no
// sentence context the model spells the SOUNDS rather than the words, so "œufs"
// came back "Euf" and "pain" "Pin". An `initial_prompt` is Whisper's documented
// lever for exactly this: it primes the decoder with in-domain vocabulary AND a
// comma-separated style, which both fixes the spelling and nudges the output toward
// the commas splitItems() needs to break a rattled-off list into separate items.
// Québécois register on the FR side (œufs/épicerie), to match the rest of the app.
const PRIMER: Record<'fr' | 'en', string> = {
  fr: "Liste d'épicerie en français québécois : lait, œufs, pain, beurre, fromage, pommes, café, poulet.",
  en: 'Grocery list in English: milk, eggs, bread, butter, cheese, apples, coffee, chicken.',
}

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
    // AI is guaranteed present here by authed({ requiresAi: true }); assert it so
    // TS narrows (the inline `if (!ctx.env.AI)` that used to narrow now lives in the gate).
    const res = (await ctx.env.AI!.run('@cf/openai/whisper-large-v3-turbo', {
      audio: toBase64(new Uint8Array(buf)),
      task: 'transcribe',
      language: lang,
      // Prime the decoder with in-domain French/English vocabulary so short
      // isolated-word clips spell real words instead of phonetic mush (see PRIMER).
      initial_prompt: PRIMER[lang],
      // The clip is one self-contained utterance, not a stream — don't let the model
      // condition on (nonexistent) prior text and drift.
      condition_on_previous_text: false,
    })) as { text?: string; transcription_info?: { text?: string } }
    // Strip Whisper's subtitle-credit hallucinations (it invents "Sous-titrage
    // Radio-Canada" & co. on near-silent clips). '' here → client shows "didn't
    // catch that" rather than writing the credit into the capture.
    text = cleanTranscript((res?.text ?? res?.transcription_info?.text ?? '').trim())
  } catch (err) {
    // Same journal path as the capture router: tag the response so lib/api pops the
    // acknowledge-into-log notice and the prod ai_errors view records the cause.
    report.error = err instanceof Error ? err.message : 'whisper failed'
  }
  return withAiError(ok({ text }), report)
}, undefined, { requiresAi: true })
