// Runs before React mounts. Picks day/night from the saved choice, else the
// OS preference. Inline-fast so a wall tablet reload never flashes the wrong
// surface. Same trick as the portal.
;(function () {
  try {
    var saved = localStorage.getItem('babillard-theme')
    var theme =
      saved === 'day' || saved === 'night'
        ? saved
        : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'night'
          : 'day'
    document.documentElement.setAttribute('data-theme', theme)
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'day')
  }
  // Ambient day-part drift (feature #1). Compute + set the initial data-daypart
  // here so a kiosk reboot never flashes the wrong tint, mirroring the theme
  // trick above. Opt-out: 'babillard-daypart-auto' === '0' → leave it unset
  // (the base day/night palette shows). Inlined (no imports run yet); kept in
  // sync with computeDayPart() in src/lib/timeofday.ts.
  try {
    if (localStorage.getItem('babillard-daypart-auto') !== '0') {
      var now = new Date()
      var mins = now.getHours() * 60 + now.getMinutes()
      var part =
        mins >= 300 && mins < 420
          ? 'dawn' // 05:00–07:00
          : mins >= 420 && mins < 720
            ? 'morning' // 07:00–12:00
            : mins >= 720 && mins < 1020
              ? 'afternoon' // 12:00–17:00
              : mins >= 1020 && mins < 1230
                ? 'dusk' // 17:00–20:30
                : 'night' // else
      document.documentElement.setAttribute('data-daypart', part)
    }
  } catch (e) {
    /* no daypart — base palette shows */
  }
})()
