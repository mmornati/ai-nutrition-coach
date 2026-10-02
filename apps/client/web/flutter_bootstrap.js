{{flutter_js}}
{{flutter_build_config}}

// Locale hardening. The engine parses navigator.languages with Intl.Locale
// before any app code runs, and a malformed tag (a POSIX-style
// "en-US@posix", "en_US.UTF-8" from some Linux/WebView set-ups) makes that
// throw ("RangeError: Incorrect locale information provided") and the app
// never starts. Repair what can be repaired (drop "@..." / ".charset", "_" ->
// "-"), drop what cannot, fall back to "en". The app itself only ships "en"
// (apps/client/lib/main.dart resolves any locale to it).
(function () {
  try {
    var langs = Array.prototype.slice.call(navigator.languages || [navigator.language || 'en']);
    var valid = function (tag) {
      try { new Intl.Locale(tag); return true; } catch (e) { return false; }
    };
    if (langs.length && langs.every(valid)) return;
    var fixed = langs
      .map(function (l) { return String(l).split('@')[0].split('.')[0].replace(/_/g, '-'); })
      .filter(valid);
    if (!fixed.length) fixed = ['en'];
    Object.defineProperty(navigator, 'languages', { get: function () { return fixed; }, configurable: true });
    Object.defineProperty(navigator, 'language', { get: function () { return fixed[0]; }, configurable: true });
  } catch (e) {
    // Leave the browser's values alone.
  }
})();

// N5 / zero third-party hosts: the engine downloads glyph-fallback fonts for
// characters the bundled Roboto lacks, by default from a third-party CDN.
// Point it at our own origin (fallback-fonts/): we ship the one Noto Sans
// Symbols file the app needs there. A glyph outside Roboto + that file (emoji,
// CJK, ...) renders as a missing-glyph box rather than leaking a request.
// CanvasKit itself is local because the build uses --no-web-resources-cdn.
_flutter.loader.load({
  config: {
    fontFallbackBaseUrl: "fallback-fonts/",
  },
});

// Escape hatch for a build that crashes at start-up (docs/pwa.md "Updating").
// This file is served by the service worker like the rest, so a broken version
// can keep serving itself and never reach the Dart code that shows the "new
// version is ready" line. If the engine has not painted anything 20 s after
// this script ran, look for a waiting (newer) service worker and activate it
// ONCE (sessionStorage guard: never a reload loop); the page reloads when the
// browser says the new worker is in control. If no newer worker is waiting
// there is nothing to switch to: use the kill switch (tools/pwa/sw.kill.js).
(function () {
  if (!('serviceWorker' in navigator)) return;
  setTimeout(async function () {
    try {
      if (document.querySelector('flt-glass-pane')) return; // booted fine
      if (sessionStorage.getItem('openplate.recovery')) return;
      var reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;
      if (!reg.waiting) {
        await reg.update(); // the browser checks sw.js on load anyway; be sure
        await new Promise(function (resolve) { setTimeout(resolve, 8000); });
      }
      if (!reg.waiting) return;
      sessionStorage.setItem('openplate.recovery', '1');
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        location.reload();
      });
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    } catch (e) {
      // Nothing more can be done from here.
    }
  }, 20000);
})();
