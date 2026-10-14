/* Stuck-boot escape hatch (docs/pwa.md "If an update goes wrong").
 *
 * A classic script served from this origin (no inline script: the CSP forbids it), loaded by
 * index.html BEFORE and independently of the app bundle: a broken build that the service worker
 * keeps serving from its cache can never reach the code that shows the "new version is ready"
 * line, but it still runs this file.
 *
 * If the app has painted nothing 20 s after load, look for a waiting (newer) service worker and
 * activate it ONCE (a sessionStorage guard: never a reload loop); the page reloads when the
 * browser reports the new worker in control. If nothing newer is waiting there is nothing to
 * switch to: use the kill switch (tools/pwa/sw.kill.js).
 *
 * It also sets <html lang> before the app bundle runs (the CSP forbids an inline script), so
 * screen readers pick the right voice before the app renders anything. This mirrors resolveLocale's
 * pre-unlock behaviour in src/i18n/locale.ts: the plaintext hint (localStorage 'anc.pwa.locale'),
 * else the first supported entry of navigator.languages, else navigator.language, else 'en'.
 * The key and the language list are kept in sync with the TypeScript by boot-guard.test.ts.
 * The guard has no user-facing text of its own, so nothing here needs translating.
 */
(function () {
  'use strict';
  var LOCALE_HINT_KEY = 'anc.pwa.locale';
  var SUPPORTED = ['en', 'fr'];
  var DEFAULT = 'en';
  function fromTag(tag) {
    if (typeof tag !== 'string') return null;
    var primary = tag.trim().toLowerCase().split(/[-_]/, 1)[0];
    // The default ('en') is the fallback, never a match: an 'en' entry must not outrank a later 'fr'.
    return primary !== DEFAULT && SUPPORTED.indexOf(primary) !== -1 ? primary : null;
  }
  function prePaintLang() {
    var lang = DEFAULT;
    try {
      var hint = null;
      try {
        hint = localStorage.getItem(LOCALE_HINT_KEY);
      } catch {
        hint = null;
      }
      if (SUPPORTED.indexOf(hint) !== -1) {
        lang = hint;
      } else {
        var list = Array.isArray(navigator.languages) ? navigator.languages : [];
        if (list.length === 0) list = [navigator.language];
        for (var i = 0; i < list.length; i++) {
          var found = fromTag(list[i]);
          if (found) {
            lang = found;
            break;
          }
        }
      }
      document.documentElement.lang = lang;
    } catch {
      // Keep the static default from index.html.
    }
  }
  prePaintLang();
  if (!('serviceWorker' in navigator)) return;
  var GUARD_KEY = 'anc.recovery';
  setTimeout(async function () {
    try {
      var root = document.getElementById('root');
      if (root && root.childElementCount > 0) return; // painted: booted fine
      if (sessionStorage.getItem(GUARD_KEY)) return;
      var reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;
      if (!reg.waiting) {
        await reg.update(); // the browser checks sw.js on load anyway; be sure
        await new Promise(function (resolve) {
          setTimeout(resolve, 8000);
        });
      }
      if (!reg.waiting) return;
      sessionStorage.setItem(GUARD_KEY, '1');
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        location.reload();
      });
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    } catch {
      // Nothing more can be done from here.
    }
  }, 20000);
})();
