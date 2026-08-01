#!/usr/bin/env bash
# Download the latest krpanocode.phar from GitHub releases into resources/
set -eu

DEST="$(cd "$(dirname "$0")/.." && pwd)/resources"
mkdir -p "$DEST"

echo "[phar] resolving latest release..."
URL=$(curl -fsSL -o /dev/null -w '%{url_effective}' \
  -H "Authorization: Bearer ${GITHUB_TOKEN:-}" \
  "https://github.com/iceman1010/krpanocode-releases/releases/latest" || true)

TAG=$(basename "$URL" | sed 's/^v//')
echo "[phar] latest tag: $TAG"

PHAR_URL="https://github.com/iceman1010/krpanocode-releases/releases/download/v${TAG}/krpanocode.phar"
echo "[phar] downloading $PHAR_URL"
curl -fsSL -L \
  -H "Authorization: Bearer ${GITHUB_TOKEN:-}" \
  "$PHAR_URL" -o "$DEST/krpanocode.phar"

# Verify it's a valid PHAR (starts with PHP/Phar magic or is a PHP script)
if ! head -c 64 "$DEST/krpanocode.phar" | grep -q "<?php\|Phar"; then
  echo "[phar] ERROR: downloaded file does not look like a PHAR"
  file "$DEST/krpanocode.phar"
  exit 1
fi

ls -la "$DEST/krpanocode.phar"
echo "[phar] done"
