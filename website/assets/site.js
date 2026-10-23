// Weave each towel in from the left when it comes into view. Content is visible without this script.
(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var towels = document.querySelectorAll('[data-weave]');
  if (reduce || !('IntersectionObserver' in window)) return;
  root.classList.add('js');
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('woven'); io.unobserve(e.target); }
    });
  }, { threshold: 0.2 });
  towels.forEach(function (t) { io.observe(t); });

  // Mark the section in view in the top rail.
  var links = Array.prototype.slice.call(document.querySelectorAll('.rail a[href^="#"]'));
  var sections = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });
  var spy = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      links.forEach(function (a, i) { a.setAttribute('aria-current', sections[i] === e.target ? 'true' : 'false'); });
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach(function (s) { if (s) spy.observe(s); });
})();
