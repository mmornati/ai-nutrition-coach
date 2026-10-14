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
 */
(function () {
  'use strict';
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
