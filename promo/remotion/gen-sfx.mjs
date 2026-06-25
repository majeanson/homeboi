// Generative UI sound effects for the promo — soft, calm "haptic" cues composed in code
// (no external audio). A short whoosh for transitions and a gentle pop for the kid-view
// PiP. Tasteful + quiet so they punctuate without nagging (calm tenet). Writes 16-bit
// mono WAVs the Remotion <Audio> plays.
//   node gen-sfx.mjs
import { writeFileSync, mkdirSync } from 'node:fs'

const SR = 44100

function encodeWav(samples) {
  const n = samples.length
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(SR, 24)
  buf.writeUInt32LE(SR * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  let o = 44
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(v * 32767), o)
    o += 2
  }
  return buf
}

// A soft "whoosh": filtered noise (one-pole low-pass) under a quick swell→decay, with a
// gentle downward tilt. Calm, airy — for a slide/fade transition.
function whoosh(dur = 0.4) {
  const n = Math.floor(SR * dur)
  const out = new Float32Array(n)
  let lp = 0
  // pseudo-noise without Math.random (deterministic build): a hashed sine stack
  const noise = (i) => {
    const t = i / SR
    return (
      Math.sin(t * 9000 + Math.sin(t * 1300) * 6) * 0.5 +
      Math.sin(t * 15300 + Math.sin(t * 700) * 4) * 0.3 +
      Math.sin(t * 21111) * 0.2
    )
  }
  for (let i = 0; i < n; i++) {
    const t = i / n
    const env = Math.sin(Math.PI * Math.min(1, t * 1.15)) * Math.exp(-t * 2.2)
    // low-pass that opens then closes → airy "whoosh"
    const cut = 0.04 + 0.16 * Math.sin(Math.PI * t)
    lp += (noise(i) - lp) * cut
    out[i] = lp * env * 0.6
  }
  return out
}

// A gentle "pop": a soft sine blip with a fast attack + quick decay and a tiny upward
// pitch chirp — for the kid-view PiP springing in.
function pop(dur = 0.2) {
  const n = Math.floor(SR * dur)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const tt = i / n
    const f = 420 + 260 * Math.min(1, tt * 3) // quick chirp up
    const env = Math.exp(-tt * 9) * (1 - Math.exp(-tt * 120))
    out[i] = (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * f * 2 * t)) * env * 0.5
  }
  return out
}

mkdirSync('public/music', { recursive: true })
writeFileSync('public/music/sfx-whoosh.wav', encodeWav(whoosh()))
writeFileSync('public/music/sfx-pop.wav', encodeWav(pop()))
console.log('✓ wrote public/music/sfx-whoosh.wav + sfx-pop.wav')
