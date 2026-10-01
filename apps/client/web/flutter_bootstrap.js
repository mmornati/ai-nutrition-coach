{{flutter_js}}
{{flutter_build_config}}

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
