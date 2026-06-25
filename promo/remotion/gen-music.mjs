// Generative music bed for the promo — a calm, warm ambient track composed in code
// (no external audio, no licensing). Soft pad chords + a sparse bell arpeggio + a
// gentle sub, a feedback delay for space, slow fades. Matches the app's calm tenet:
// no driving beat, nothing busy. Writes a 16-bit stereo WAV the Remotion <Audio>
// plays (promo/remotion/public/music/tour-bed.wav — gitignored, regenerable).
//
//   node gen-music.mjs            # default ~50s, warm I–V–vi–IV in C
//   node gen-music.mjs 60         # custom length (s)
import { writeFileSync, mkdirSync } from 'node:fs'

const SR = 44100
const DUR = Math.max(8, Number(process.argv[2]) || 50) // seconds
const N = Math.floor(SR * DUR)
const OUT = 'public/music/tour-bed.wav'

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12)
// Warm, resolved calm progression: C – G – Am – F (I–V–vi–IV), looped. Each voicing
// is a low-mid 4-note chord; the bells later pick these tones an octave up.
const CHORDS = [
  [48, 55, 60, 64], // C:  C3 G3 C4 E4
  [43, 50, 59, 62], // G:  G2 D3 B3 D4
  [45, 52, 57, 60], // Am: A2 E3 A3 C4
  [41, 48, 53, 57], // F:  F2 C3 F3 A3
]
const CHORD_SEC = 6.25 // 8 chords over 50s (two loops)

const L = new Float32Array(N)
const R = new Float32Array(N)
const add = (i, l, r) => {
  if (i >= 0 && i < N) {
    L[i] += l
    R[i] += r
  }
}

// A soft pad voice: a few low partials with a slow attack/release envelope so chords
// swell in and out. Slight L/R detune gives a calm width.
function pad(midiNote, t0, dur, gain, panSpread) {
  const f = midi(midiNote)
  const a = 1.3 // attack s
  const rel = 1.8 // release s
  const start = Math.floor(t0 * SR)
  const len = Math.floor(dur * SR)
  const partials = [
    { m: 1, g: 1 },
    { m: 2, g: 0.32 },
    { m: 3, g: 0.12 },
  ]
  for (let s = 0; s < len; s++) {
    const t = s / SR
    // Trapezoid-ish envelope: ease in over `a`, hold, ease out over `rel`.
    let env
    if (t < a) env = t / a
    else if (t > dur - rel) env = Math.max(0, (dur - t) / rel)
    else env = 1
    env = env * env * (3 - 2 * env) // smoothstep
    let lSig = 0
    let rSig = 0
    for (const p of partials) {
      const det = 1 + p.m * 0.0009 * panSpread
      lSig += Math.sin(2 * Math.PI * f * p.m * det * t) * p.g
      rSig += Math.sin(2 * Math.PI * f * p.m * (2 - det) * t) * p.g
    }
    const e = env * gain
    add(start + s, lSig * e, rSig * e)
  }
}

// A gentle bell pluck (triangle-ish via summed odd harmonics) with a fast attack and
// medium exponential decay. Panned by `pan` (-1..1).
function bell(midiNote, t0, gain, pan) {
  const f = midi(midiNote)
  const dur = 2.4
  const start = Math.floor(t0 * SR)
  const len = Math.floor(dur * SR)
  const lG = Math.min(1, 1 - pan) * 0.5 + 0.5
  const rG = Math.min(1, 1 + pan) * 0.5 + 0.5
  for (let s = 0; s < len; s++) {
    const t = s / SR
    const env = Math.exp(-t * 2.6) * (1 - Math.exp(-t * 80))
    const sig =
      (Math.sin(2 * Math.PI * f * t) +
        0.18 * Math.sin(2 * Math.PI * f * 3 * t) +
        0.08 * Math.sin(2 * Math.PI * f * 5 * t)) *
      env *
      gain
    add(start + s, sig * lG, sig * rG)
  }
}

// Soft sub sine on the chord root, an octave below the pad's lowest note.
function sub(midiNote, t0, dur, gain) {
  const f = midi(midiNote - 12)
  const start = Math.floor(t0 * SR)
  const len = Math.floor(dur * SR)
  for (let s = 0; s < len; s++) {
    const t = s / SR
    let env
    if (t < 1.0) env = t / 1.0
    else if (t > dur - 1.4) env = Math.max(0, (dur - t) / 1.4)
    else env = 1
    const sig = Math.sin(2 * Math.PI * f * t) * env * gain
    add(start + s, sig, sig)
  }
}

// ── Compose ────────────────────────────────────────────────────────────────
const nChords = Math.ceil(DUR / CHORD_SEC)
for (let c = 0; c < nChords; c++) {
  const chord = CHORDS[c % CHORDS.length]
  const t0 = c * CHORD_SEC
  const dur = CHORD_SEC + 0.4 // slight overlap so chords blend, not click
  for (const n of chord) pad(n, t0, dur, 0.13, n - chord[0] + 1)
  sub(chord[0], t0, dur, 0.16)
  // Sparse bells: pick chord tones an octave up on a calm, syncopated pattern.
  const tones = chord.map((n) => n + 12)
  const pat = [0.0, 1.6, 2.9, 4.4, 5.4]
  pat.forEach((off, i) => {
    const note = tones[(i + c) % tones.length]
    const pan = i % 2 === 0 ? -0.4 : 0.4
    bell(note, t0 + off, 0.09, pan)
  })
}

// ── Feedback delay (space) ───────────────────────────────────────────────────
const dlT = Math.floor(0.38 * SR)
const fb = 0.34
const wet = 0.28
for (let i = dlT; i < N; i++) {
  L[i] += L[i - dlT] * fb * wet
  R[i] += R[i - dlT] * fb * wet
}

// ── Master: fades + soft normalize ───────────────────────────────────────────
const fadeIn = Math.floor(1.6 * SR)
const fadeOut = Math.floor(2.4 * SR)
let peak = 0
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
const norm = peak > 0 ? 0.82 / peak : 1
for (let i = 0; i < N; i++) {
  let g = norm
  if (i < fadeIn) g *= i / fadeIn
  if (i > N - fadeOut) g *= Math.max(0, (N - i) / fadeOut)
  L[i] = Math.tanh(L[i] * g) // gentle soft-clip safety
  R[i] = Math.tanh(R[i] * g)
}

// ── Encode 16-bit PCM stereo WAV ─────────────────────────────────────────────
const bytesPerSample = 2
const dataLen = N * 2 * bytesPerSample
const buf = Buffer.alloc(44 + dataLen)
buf.write('RIFF', 0)
buf.writeUInt32LE(36 + dataLen, 4)
buf.write('WAVE', 8)
buf.write('fmt ', 12)
buf.writeUInt32LE(16, 16)
buf.writeUInt16LE(1, 20) // PCM
buf.writeUInt16LE(2, 22) // stereo
buf.writeUInt32LE(SR, 24)
buf.writeUInt32LE(SR * 2 * bytesPerSample, 28)
buf.writeUInt16LE(2 * bytesPerSample, 32)
buf.writeUInt16LE(16, 34)
buf.write('data', 36)
buf.writeUInt32LE(dataLen, 40)
let o = 44
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), o)
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), o + 2)
  o += 4
}
mkdirSync('public/music', { recursive: true })
writeFileSync(OUT, buf)
console.log(`✓ wrote ${OUT} — ${DUR}s, ${N} frames, peak ${(peak * norm).toFixed(2)}`)
