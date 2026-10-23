#!/usr/bin/env bash
# Build the public site into ./site, as GitHub Pages serves it at https://mmornati.github.io/ai-nutrition-coach/:
#   /            the landing page (website/)
#   /docs/       this documentation (MkDocs Material, strict)
#   /video/      the narrated tour, and /video/<slug>/ one episode per part of the app (website/video/)
#
#   pip install -r requirements-docs.txt && bash scripts/build-site.sh     # then: python3 -m http.server -d site 8000
#   (or: uv run --with-requirements requirements-docs.txt bash scripts/build-site.sh)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

rm -rf site
mkdocs build --strict -d site/docs
cp -R website/. site/

# The landing page must be there; the documentation must not have been overwritten by it.
test -f site/index.html || { echo "build-site: site/index.html is missing (website/index.html)" >&2; exit 1; }
test -f site/docs/index.html || { echo "build-site: site/docs/index.html is missing" >&2; exit 1; }
test -f site/docs/assets/fonts/schibsted-grotesk-latin.woff2 || { echo "build-site: the docs font is missing" >&2; exit 1; }

# The videos are published from website/video/. A missing one is a warning, not a failure: the docs link to them.
if [ -f site/video/index.html ]; then
  for slug in first-run log-a-plate day-and-week your-ai your-data self-host; do
    test -f "site/video/$slug/index.html" || echo "build-site: warning: site/video/$slug/index.html is missing" >&2
  done
else
  echo "build-site: warning: site/video/index.html is missing (website/video/): the video links will 404" >&2
fi

echo "site/ ready: $(du -sh site | cut -f1)"
