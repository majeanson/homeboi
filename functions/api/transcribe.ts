import { badRequest, ok, withAiError } from '../_lib/json'
import { authed } from '../_lib/route'
import { resolveLang } from '../_lib/ai'
import { cleanTranscript } from '../_lib/transcript'
import { pickItems, realText, type WhisperSegment } from '../_lib/whisperItems'

// Server STT for the ONE context where on-device Web Speech is dead: an iOS/iPadOS
// installed PWA. There webkitSpeechRecognition starts then aborts instantly with
// zero audio (the standalone-sandbox dictation restriction — confirmed via a
// minimal-ui test where voice revived), but getUserMedia/MediaRecorder still work.
// So the client records the WHOLE spoken list as one clip and we transcribe it here
// with Workers AI Whisper, feeding the items back into the same capture spine.
//
// Design (see whisperItems.ts): Whisper is a SENTENCE model, so we give it the whole
// utterance as one clip — NOT the per-word clips + initial_prompt the old path used,
// which starved it of context and made it hallucinate its own prompt back, loop
// ("pommes, pommes, pommes"), and clip isolated words. Instead we lean on Whisper's
// structured output: `vad_filter` trims silence server-side; per-segment confidence
// signals (no_speech_prob / compression_ratio) drop hallucinated segments at the
// source; per-word timestamps split the list into items on the PAUSES between words.
//
// Any actor — a parent-mode kiosk captures too (only member admin + pairing are
// operator-gated). `requiresAi` 503s when AI is off so the client keeps the manual
// type-picker (same graceful-degrade contract as /api/capture).

// Short household captures are tiny; this cap just stops an oversized upload reaching
// the model. A whole-list clip is longer than a single word, hence the generous bound.
const MAX_BYTES = 16 * 1024 * 1024

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

export const onRequestPost = authed(
  async (ctx) => {
    const type = ctx.request.headers.get('content-type') ?? ''
    // MediaRecorder sends e.g. "audio/mp4;codecs=..." (iOS) or "audio/webm" — the
    // prefix check accepts both while rejecting a stray JSON/blob upload.
    if (!type.startsWith('audio/')) return badRequest('Audio requis.')
    const buf = await ctx.request.arrayBuffer()
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return badRequest('Audio vide ou trop grand.')

    const lang = resolveLang(ctx.env, ctx.request)
    const report = { error: null as string | null }
    let text = ''
    let items: string[] = []
    try {
      // AI is guaranteed present here by authed({ requiresAi: true }); assert it so TS
      // narrows. `vad_filter` trims silence (fewer hallucinations); no `initial_prompt`
      // — the whole-utterance clip gives Whisper the context the primer used to fake,
      // and priming it was itself what got echoed onto the list. `condition_on_previous_
      // text: false` keeps a self-contained clip from drifting on imaginary prior text.
      const res = (await ctx.env.AI!.run('@cf/openai/whisper-large-v3-turbo', {
        audio: toBase64(new Uint8Array(buf)),
        task: 'transcribe',
        language: lang,
        vad_filter: true,
        condition_on_previous_text: false,
      })) as { text?: string; segments?: WhisperSegment[] }
      const segments = res?.segments
      // Always return the full (hallucination-filtered) transcript AND the per-word
      // split. The CLIENT decides which to use: a list surface takes `items` (split
      // on Whisper's word-gap timestamps — a pause = an item boundary); the general
      // capture bar takes `text` (the whole phrase, for the AI router). `items` is []
      // when this build returned no word timings — the client then splits `text`.
      items = pickItems(segments)
      text = cleanTranscript((realText(segments) || (res?.text ?? '')).trim())
    } catch (err) {
      // Same journal path as the capture router: tag the response so lib/api pops the
      // acknowledge-into-log notice and the prod ai_errors view records the cause.
      report.error = err instanceof Error ? err.message : 'whisper failed'
    }
    return withAiError(ok({ text, items }), report)
  },
  undefined,
  { requiresAi: true },
)
