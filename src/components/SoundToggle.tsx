import { useT } from '../i18n'
import { Icon } from './Icon'
import { setSoundOn, useSoundOn } from '../lib/sound'
import { stopSpeaking } from '../lib/speak'

// « Le son » — the app's own silent switch (lib/sound).
//
// It exists because a phone's ring/silent switch does NOT mute a web page: on iOS
// it never touched Web Speech or script-started `<audio>`, and Android is
// inconsistent. So the app read a routine card aloud on a quiet bus with no way to
// stop it short of leaving.
//
// It has to be reachable WHERE the sound is, not only in Réglages — by the time you
// want it, something is already talking, and « go to settings, find the right tab »
// is not a thing you do with a room looking at you. So it rides the bar of the two
// surfaces that narrate on their own (the routine player and cook mode), and
// Réglages ▸ Système ▸ Voix mirrors it for the calm path. Everywhere else, sound
// only happens because someone pressed ▶ — see the line drawn in lib/sound.ts.
//
// Muting STOPS what is already talking. Silencing future sound while the current
// sentence finishes would read as a broken switch — the whole point is the sound in
// the room right now.
export function SoundToggle({ className, size = 20 }: { className?: string; size?: number }) {
  const t = useT()
  const on = useSoundOn()
  const label = on ? t.sound.mute : t.sound.unmute
  return (
    <button
      type="button"
      className={'sound-toggle' + (on ? '' : ' is-muted') + (className ? ' ' + className : '')}
      onClick={() => {
        if (on) stopSpeaking()
        setSoundOn(!on)
      }}
      aria-pressed={!on}
      aria-label={label}
      title={label}
    >
      <Icon name={on ? 'speaker-high-bold' : 'speaker-slash-bold'} size={size} />
    </button>
  )
}
