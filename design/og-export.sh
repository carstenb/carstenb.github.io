#!/usr/bin/env bash
# Re-export assets/og-image.png from design/og-card.html.
#
# Run it after any change to the card's copy or styling. It renders through
# headless Chrome so the real self-hosted webfonts are used — never re-typeset
# the card in an image editor.
#
#   ./design/og-export.sh
#
# The card is 1200x630 inside a body with 20px padding, so we shoot 1240x670
# and crop the padding away centred. macOS only (uses sips); on Linux swap the
# crop for ImageMagick.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-4173}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
OUT="$ROOT/assets/og-image.png"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[ -x "$CHROME" ] || { echo "Chrome not found at: $CHROME (override with CHROME=...)" >&2; exit 1; }

# The card loads /assets/fonts/... and /assets/carbo-logo.svg by absolute path,
# so it has to be served from the site root rather than opened as a file.
started=""
if ! curl -sf "http://localhost:$PORT/design/og-card.html" >/dev/null 2>&1; then
  node "$ROOT/design/serve.js" "$ROOT" "$PORT" >/dev/null 2>&1 &
  started=$!
  for _ in $(seq 1 20); do
    curl -sf "http://localhost:$PORT/design/og-card.html" >/dev/null 2>&1 && break
    sleep 0.5
  done
fi
trap '[ -n "$started" ] && kill "$started" 2>/dev/null; rm -rf "$TMP"' EXIT

"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --virtual-time-budget=8000 \
  --window-size=1240,670 --screenshot="$TMP/raw.png" \
  "http://localhost:$PORT/design/og-card.html" >/dev/null 2>&1

sips -c 630 1200 "$TMP/raw.png" --out "$OUT" >/dev/null

# awk must end the line: read returns non-zero on EOF without a newline, and
# set -e would abort here even though the export succeeded.
read -r w h < <(sips -g pixelWidth -g pixelHeight "$OUT" | awk '/pixel/ {printf "%s ", $2} END {print ""}')
[ "$w" = "1200" ] && [ "$h" = "630" ] || { echo "unexpected size ${w}x${h}" >&2; exit 1; }
echo "wrote $OUT (${w}x${h}, $(du -h "$OUT" | cut -f1))"
