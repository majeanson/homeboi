import { createDeviceStore } from './createDeviceStore'

// « Le son » — one device-local switch for everything this app plays out loud.
//
// Why it has to exist: a phone's silent switch does NOT mute a web page. On iOS the
// ring/silent switch never touched Web Speech or `<audio>` playback started by a
// script, and Android is inconsistent about it. So a parent on a quiet bus, in a
// waiting room, beside a sleeping baby, opened the app and it read a routine card
// aloud anyway — with no way to stop it short of leaving the app. The OS switch that
// every other app on the phone obeys is simply not available to us; this is our copy
// of it.
//
// DEVICE-LOCAL on purpose, and therefore NOT gated on isGuest (CLAUDE.md: a
// localStorage presentation preference is not a household write). Muting the wall
// tablet must not mute the phone in your pocket, and vice versa — silence is about
// where YOU are standing, not about the household.
//
// The line it draws — worth stating once, because every future sound has to land on
// one side of it:
//
//   MUTED — the app's own VOICE and its alerts. Synthesized read-aloud
//   (`useSpeak`, so routines, recipes, the toddler board and every tap-to-hear at
//   once), a recorded narration the app starts BY ITSELF (`playNarration` on a
//   routine step), the cook timer's chime, and vibration. Vibration is in
//   deliberately: a buzz on a table at 3 a.m. is the same intrusion as a chime, and
//   « silencieux » has to mean it.
//
//   NOT MUTED — a ▶ you pressed a second ago on one named recording: a voice mot, a
//   memo in review, an attachment preview. You cannot be surprised by a sound you
//   just asked for, and the complaint this fixes is entirely about sound the app
//   starts on its own. A dead play button would be a worse app, not a quieter one.
//
// Kept out of Query and out of the server for the same reason as the theme: it must
// apply on the very next frame, offline, before anything is fetched.
const store = createDeviceStore<boolean>('babillard-sound', true, {
  // Unset (a device that has never touched this) = ON, matching every other app's
  // default. Only an explicit '0' means muted.
  read: (raw) => raw !== '0',
  write: (v) => (v ? '1' : '0'),
})

/** Live: does this device make sound? */
export const useSoundOn = store.use
/** Read once, outside React — for module-level players (the cook chime). */
export const soundOn = store.get
export const setSoundOn = store.set
