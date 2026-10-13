Glyph-fallback fonts served from our own origin (N5).

The Flutter web engine downloads Noto fallback fonts for glyphs the bundled
Roboto lacks. flutter_bootstrap.js points fontFallbackBaseUrl here instead of
the engine's default third-party CDN, so no request leaves the origin.

notosanssymbols/v43/*.woff2 - Noto Sans Symbols, SIL Open Font License 1.1
(https://openfontlicense.org). Add further files at the same relative path if
the browser console shows another 404 from /fallback-fonts/.

Licence: OFL.txt (also registered in the app's licences page).
