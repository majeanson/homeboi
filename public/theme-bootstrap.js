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
})()
