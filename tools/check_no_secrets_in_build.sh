#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# Fail if a secret-shaped string is present in a BUILD ARTIFACT (S1).
#
# Everything compiled into a web bundle or an APK is public: anyone who can
# download the app can read it. The security review found a real OpenRouter
# key inside `main.dart.js`. This guard makes that class of mistake a red CI
# run instead of an incident.
#
#   tools/check_no_secrets_in_build.sh                scan apps/web/dist
#   tools/check_no_secrets_in_build.sh --web-only     skip the APK lookup
#   tools/check_no_secrets_in_build.sh --apk-only     scan only the APK(s)
#   tools/check_no_secrets_in_build.sh --self-test    prove the scanner works
#   tools/check_no_secrets_in_build.sh <dir|file>...  scan these paths instead
#
# Scanned (default): apps/web/dist/** (the release bundle).
#
# Patterns (extended regex, matched on raw bytes, so JS and wasm are covered):
#   sk-or-v1-<10+ chars>        OpenRouter key
#   sk-<20+ key chars>          OpenAI-style key (word-boundary anchored, so
#                               "task-queue" / "desk-lamp" do not match)
#   AIza<35 chars>              Google API key
#   gsk_ / xai- / hf_ / ghp_ / github_pat_ + body   Groq, xAI, Hugging Face,
#                               GitHub tokens
#   the retired build-time key define's name (it must not reappear)
#   Bearer <20+ token chars>    an Authorization header with a real token
#                               (the bare literal "Bearer " is legitimate
#                               code: the BYOK client builds the header)
#
# The matched value is NEVER printed (a log is a leak too): only the file,
# the pattern name and a length.
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LC_ALL=C
export LC_ALL

PATTERN_NAMES=(
  "openrouter-key" "openai-style-key" "google-api-key" "bearer-token"
  "groq-key" "xai-key" "huggingface-token" "github-token" "github-fine-grained-pat"
  "removed-key-define-name"
)
PATTERNS=(
  'sk-or-v1-[A-Za-z0-9]{10,}'
  '(^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}'
  'AIza[0-9A-Za-z_-]{35}'
  'Bearer [A-Za-z0-9._~+/=-]{20,}'
  '(^|[^A-Za-z0-9])gsk_[A-Za-z0-9]{20,}'
  '(^|[^A-Za-z0-9])xai-[A-Za-z0-9]{20,}'
  '(^|[^A-Za-z0-9])hf_[A-Za-z0-9]{30,}'
  '(^|[^A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{30,}'
  'github_pat_[A-Za-z0-9_]{30,}'
  # The retired build-time key define: its mere presence means a key could
  # have been compiled in. ([A] keeps this very file from containing it.)
  'AI_NUTRITION_COACH_BYOK_[A]PI_KEY'
)
# Cloudflare API tokens have no fixed, documented prefix/shape, so there is no
# pattern for them here; gitleaks (CI) covers them with its own rules.

# scan_path <path>: prints "file<TAB>pattern-name" for each hit; returns the
# number of hits via the HITS global.
HITS=0
scan_path() {
  local target="$1" i file out rc
  for i in "${!PATTERNS[@]}"; do
    # -a: treat binaries (wasm, fonts) as text; -l: names only, never values.
    # grep exits 0 (match), 1 (none) or >=2 (error: unreadable file, bad
    # regex...). An error means we could NOT look, which must fail closed.
    set +e
    out="$(grep -rEal -e "${PATTERNS[$i]}" -- "$target" 2>/dev/null)"
    rc=$?
    set -e
    if [[ "$rc" -ge 2 ]]; then
      printf '  ✗ scan error (grep exit %s) in %s  [%s]\n' \
        "$rc" "$target" "${PATTERN_NAMES[$i]}" >&2
      HITS=$((HITS + 1))
    fi
    while IFS= read -r file; do
      [[ -z "$file" ]] && continue
      printf '  ✗ %s  [%s]\n' "$file" "${PATTERN_NAMES[$i]}" >&2
      HITS=$((HITS + 1))
    done <<<"$out"
  done
}

scan_apk() {
  local apk="$1" tmp
  if ! command -v unzip >/dev/null 2>&1; then
    echo "✗ found $apk but 'unzip' is not installed; cannot scan it." >&2
    HITS=$((HITS + 1))
    return
  fi
  tmp="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '$tmp'" RETURN
  unzip -q -o "$apk" -d "$tmp"
  echo "▶ scanning $apk"
  scan_path "$tmp"
}

self_test() {
  local tmp bad_ok=1
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  mkdir -p "$tmp/clean" "$tmp/dirty"
  # Clean: code that merely MENTIONS the shapes must pass.
  printf '%s\n' 'var h="Bearer "+k;var q="task-queue desk-lamp sk- gsk_ xai- hf_ ghp_";var a="AIza";' \
    >"$tmp/clean/main.dart.js"
  # Dirty: one planted value per pattern (assembled at runtime so this very
  # file never contains a literal key for gitleaks to flag).
  local planted=(
    "sk-or-v1-""abcdef0123456789abcdef"
    " sk-""abcdefghijklmnopqrstuvwxyz012345"
    "AIza""SyA1234567890abcdefghijklmnopqrstuvw"
    "Bearer ""abcdefghijklmnopqrstuvwxyz0123"
    " gsk_""abcdefghijklmnopqrstuvwxyz0123"
    " xai-""abcdefghijklmnopqrstuvwxyz0123"
    " hf_""abcdefghijklmnopqrstuvwxyz0123456789"
    " ghp_""abcdefghijklmnopqrstuvwxyz0123456789"
    "github_pat_""abcdefghijklmnopqrstuvwxyz0123456789"
    "AI_NUTRITION_COACH_BYOK_""API_KEY"
  )
  local v n=0
  for v in "${planted[@]}"; do
    n=$((n + 1))
    printf 'x%s="%s"\n' "$n" "$v" >>"$tmp/dirty/main.dart.js"
  done

  HITS=0
  scan_path "$tmp/clean" 2>/dev/null
  if [[ "$HITS" -ne 0 ]]; then
    echo "self-test FAILED: false positive on clean input ($HITS)" >&2
    bad_ok=0
  fi
  HITS=0
  scan_path "$tmp/dirty" 2>/dev/null
  if [[ "$HITS" -lt "${#planted[@]}" ]]; then
    echo "self-test FAILED: expected >=${#planted[@]} detections on planted keys, got $HITS" >&2
    bad_ok=0
  fi
  # An unreadable target must FAIL (grep exit 2), not pass.
  mkdir -p "$tmp/unreadable" && printf 'x' >"$tmp/unreadable/f" && chmod 000 "$tmp/unreadable/f"
  if [[ "$(id -u)" -ne 0 ]]; then
    HITS=0
    scan_path "$tmp/unreadable" 2>/dev/null
    chmod 644 "$tmp/unreadable/f"
    if [[ "$HITS" -eq 0 ]]; then
      echo "self-test FAILED: a grep error was treated as a clean scan" >&2
      bad_ok=0
    fi
  else
    chmod 644 "$tmp/unreadable/f"
  fi
  [[ "$bad_ok" -eq 1 ]] || return 1
  echo "✓ secrets scanner self-test passed"
}

WEB_ONLY=0
APK_ONLY=0
EXPLICIT=()
for arg in "$@"; do
  case "$arg" in
    --self-test) self_test; exit $? ;;
    --web-only) WEB_ONLY=1 ;;
    --apk-only) APK_ONLY=1 ;;
    -h|--help) sed -n '2,32p' "${BASH_SOURCE[0]}"; exit 0 ;;
    -*) echo "unknown option: $arg" >&2; exit 2 ;;
    *) EXPLICIT+=("$arg") ;;
  esac
done

if [[ ${#EXPLICIT[@]} -gt 0 ]]; then
  for path in "${EXPLICIT[@]}"; do
    [[ -e "$path" ]] || { echo "✗ no such path: $path" >&2; exit 2; }
    echo "▶ scanning $path"
    scan_path "$path"
  done
else
  if [[ "$APK_ONLY" -eq 0 ]]; then
    WEB_DIR="$ROOT/apps/web/dist"
    if [[ ! -d "$WEB_DIR" ]]; then
      echo "✗ $WEB_DIR does not exist — build the web bundle first" >&2
      echo "  (pnpm build), or pass the paths to scan." >&2
      exit 2
    fi
    echo "▶ scanning $WEB_DIR"
    scan_path "$WEB_DIR"
  fi

  if [[ "$WEB_ONLY" -eq 0 ]]; then
    APK_COUNT=0
    if [[ -d "$ROOT/apps/client/build/app/outputs" ]]; then
      while IFS= read -r apk; do
        [[ -n "$apk" ]] && { scan_apk "$apk"; APK_COUNT=$((APK_COUNT + 1)); }
      done < <(find "$ROOT/apps/client/build/app/outputs" -name '*.apk' -type f)
    fi
    if [[ "$APK_ONLY" -eq 1 && "$APK_COUNT" -eq 0 ]]; then
      echo "✗ no APK under apps/client/build/app/outputs — build it first" >&2
      echo "  (cd apps/client && flutter build apk --debug)." >&2
      exit 2
    fi
  fi
fi

if [[ "$HITS" -ne 0 ]]; then
  echo "✗ $HITS secret-shaped string(s) in build output. Anything compiled in" >&2
  echo "  is public: remove the --dart-define / constant, rotate the key, and" >&2
  echo "  rebuild. (Values are intentionally not printed.)" >&2
  exit 1
fi
echo "✓ no secret-shaped strings in build output"
