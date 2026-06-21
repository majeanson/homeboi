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
        mins >= 270 && mins < 315
          ? 'deep-twilight' // 04:30–05:15
          : mins >= 315 && mins < 360
            ? 'twilight' // 05:15–06:00
            : mins >= 360 && mins < 420
              ? 'dawn' // 06:00–07:00
              : mins >= 420 && mins < 660
                ? 'morning' // 07:00–11:00
                : mins >= 660 && mins < 840
                  ? 'noon' // 11:00–14:00
                  : mins >= 840 && mins < 1020
                    ? 'afternoon' // 14:00–17:00
                    : mins >= 1020 && mins < 1125
                      ? 'dusk' // 17:00–18:45
                      : mins >= 1125 && mins < 1170
                        ? 'twilight' // 18:45–19:30
                        : mins >= 1170 && mins < 1215
                          ? 'deep-twilight' // 19:30–20:15
                          : 'night' // else
      document.documentElement.setAttribute('data-daypart', part)
      // Auto day/night: while the drift is on, the theme tier follows the part too
      // — night actually goes dark, and the dawn/dusk ramps step through the dim
      // twilight tiers (smoother than a single cream→black cut). Overrides the
      // manual theme set above (restored when ambient is switched off). Kept in
      // sync with themeForPart() in src/lib/theme.ts.
      var themeAttr =
        part === 'night'
          ? 'night'
          : part === 'deep-twilight'
            ? 'deep-twilight'
            : part === 'twilight'
              ? 'twilight'
              : 'day'
      document.documentElement.setAttribute('data-theme', themeAttr)
    }
  } catch (e) {
    /* no daypart — base palette shows */
  }
  // Accessibility profile (#36): high-contrast palette + larger text. Apply both
  // before first paint so a low-vision kiosk reboots into its profile without a
  // flash, mirroring the theme/daypart tricks above. Absence = default (kept in
  // sync with src/lib/accessibility.ts).
  try {
    if (localStorage.getItem('babillard-contrast') === 'high') {
      document.documentElement.setAttribute('data-contrast', 'high')
    }
    if (localStorage.getItem('babillard-text-scale') === 'large') {
      document.documentElement.setAttribute('data-text-scale', 'large')
    }
  } catch (e) {
    /* no a11y profile — base presentation shows */
  }
})()
