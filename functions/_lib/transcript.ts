// Post-process a Whisper transcript before it re-enters the capture spine.
//
// Whisper (the FR model especially) HALLUCINATES on near-silence or background
// noise: trained on piles of TV with burned-in subtitle credits, it fills an
// otherwise-empty clip with "Sous-titrage Société Radio-Canada", "Sous-titres
// réalisés par…", "Amara.org", "ST' 501", "Merci d'avoir regardé cette vidéo", and
// the English equivalents. None of that is ever a household capture, so we
// recognise and drop it — returning '' when the whole clip was junk so the client
// shows "didn't catch that" instead of writing a subtitle credit onto the grocery
// list.

// Subtitle-credit / sign-off phrases, in their accent- and punctuation-stripped
// token form (see `normalize`). Matched as whole token runs, so "amara" flags
// "Amara.org" but NOT the grain "amaranthe".
const MARKERS = [
  'sous titrage',
  'sous titres',
  'sous titre',
  'soustitrage',
  'sous titrage societe radio canada',
  'radio canada',
  'realises par', // "Sous-titres réalisés par…"
  'amara',
  'amara org',
  'st 501',
  'merci davoir regarde',
  'merci davoir ecoute',
  'merci de votre ecoute',
  'abonnez vous',
  'subtitles by',
  'subtitling',
  'captioning by',
  'thanks for watching',
  'thank you for watching',
  'please subscribe',
]

// Accent/punctuation-insensitive token form: "Sous-titrage Radio-Canada" →
// "sous titrage radio canada". Lets the marker list stay short and ASCII.
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Is this chunk a Whisper hallucination (a subtitle credit) or content-free noise
// (pure punctuation / ♪ / whitespace)? Markers match only as whole token runs.
export function isHallucination(text: string): boolean {
  const n = normalize(text)
  if (!n) return true
  const padded = ` ${n} `
  return MARKERS.some((m) => padded.includes(` ${m} `))
}

// Strip hallucinated subtitle credits from a transcript. Splits into sentences,
// drops the junk ones, and returns '' when nothing real is left (whole-clip junk,
// or an inline credit the sentence split couldn't isolate).
export function cleanTranscript(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+|[\n\r]+/)
  const kept = sentences.filter((s) => s.trim() && !isHallucination(s))
  const out = kept.join(' ').replace(/\s+/g, ' ').trim()
  return isHallucination(out) ? '' : out
}
