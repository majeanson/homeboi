// Turn ONE Whisper transcription of a spoken grocery list into clean, separate
// items — the enterprise-grade-but-free path for the ONE context where on-device
// Web Speech is dead (an installed iOS PWA). See functions/api/transcribe.ts.
//
// Why this exists instead of scrubbing bad output: Whisper is a SENTENCE model.
// The old approach fed it tiny per-word clips + an initial_prompt, so with no
// context it hallucinated its own prompt back, spun repetition loops, and clipped
// isolated words. We now send the whole utterance as one clip and use Whisper's
// OWN structured output to do the work honestly:
//   • confidence signals per segment (no_speech_prob / compression_ratio) tell us
//     which segments are silence-hallucinations or repetition loops — we DROP them
//     at the source rather than pattern-matching known-bad strings after the fact.
//   • per-word timestamps let us split "pommes … tomates … pain" into three items
//     on the PAUSES between words, so an isolated-word cadence still separates
//     without ever chopping a multi-word item ("beurre d'arachide", "blé d'inde").
//
// Everything here is pure so it unit-tests without the model (Workers AI is
// unavailable locally). Thresholds are OpenAI Whisper's documented defaults.

import { isHallucination } from './transcript'

interface WhisperWord {
  word: string
  start: number
  end: number
}
export interface WhisperSegment {
  text?: string
  no_speech_prob?: number
  compression_ratio?: number
  avg_logprob?: number
  words?: WhisperWord[]
}

// A segment whose no-speech probability is above this is silence Whisper filled
// with a hallucination; above the compression-ratio bound it's a repetition loop
// ("pommes, pommes, pommes"). Both are Whisper's canonical hallucination tells.
const NO_SPEECH_MAX = 0.6
const COMPRESSION_MAX = 2.4
// A silence between two spoken words longer than this ends the current item. Long
// enough to sit through the micro-gap inside "beurre d'arachide" (~0.1–0.2s), short
// enough that a deliberate pause between two groceries separates them.
const WORD_GAP_S = 0.6

// Is this segment real speech, or a Whisper hallucination we should drop whole?
export function isRealSegment(seg: WhisperSegment): boolean {
  if ((seg.no_speech_prob ?? 0) > NO_SPEECH_MAX) return false
  if ((seg.compression_ratio ?? 0) > COMPRESSION_MAX) return false
  if (seg.text && isHallucination(seg.text)) return false
  return true
}

// Whisper attaches list punctuation to the word token ("pommes,"). A trailing
// comma/semicolon/period ends the current item just like a pause does.
function endsItem(word: string): boolean {
  return /[,;.!?]$/.test(word.trim())
}

// Split the surviving words into item strings on pauses AND trailing punctuation.
// Returns the raw item phrases (still with any "des"/"du" lead-in) — the client's
// cleanSpokenItem/splitItems finish the job, exactly as for on-device capture.
function wordsToItems(words: WhisperWord[]): string[] {
  const items: string[] = []
  let cur: string[] = []
  let prevEnd: number | null = null
  const flush = () => {
    const phrase = cur.join(' ').replace(/\s+/g, ' ').trim()
    if (phrase) items.push(phrase)
    cur = []
  }
  for (const w of words) {
    const token = w.word?.trim()
    if (!token) continue
    if (prevEnd != null && w.start - prevEnd >= WORD_GAP_S) flush()
    cur.push(token)
    prevEnd = w.end
    if (endsItem(token)) {
      prevEnd = null // a pause after punctuation shouldn't double-count
      flush()
    }
  }
  flush()
  // Strip trailing item punctuation the tokens carried in.
  return items.map((s) => s.replace(/[\s,;.!?]+$/, '').trim()).filter(Boolean)
}

// The joined text of the segments Whisper judged to be real speech — the caller's
// fallback when this build returned no per-word timestamps to split on. Already
// hallucination-filtered, so the client can splitItems() it on commas/connectors.
export function realText(segments: WhisperSegment[] | undefined): string {
  if (!Array.isArray(segments)) return ''
  return segments
    .filter(isRealSegment)
    .map((s) => s.text?.trim() ?? '')
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// The one entry point: real Whisper segments → clean, separate item phrases, split
// on the pauses between words. Returns [] when the build gave no word timings — the
// caller then falls back to realText() + client-side splitItems.
export function pickItems(segments: WhisperSegment[] | undefined): string[] {
  if (!Array.isArray(segments)) return []
  const words: WhisperWord[] = []
  for (const seg of segments) {
    if (isRealSegment(seg) && Array.isArray(seg.words)) words.push(...seg.words)
  }
  return wordsToItems(words)
}
