#!/usr/bin/env bash
# Copy the PHP CLI (installed on PATH by setup-php or natively) into resources/php/.
# Usage: bash scripts/download-php.sh [macos|windows|linux]
set -eu

PLATFORM="${1:-detect}"
if [ "$PLATFORM" = "detect" ]; then
  case "$(uname -s)" in
    Linux*)  PLATFORM="linux" ;;
    Darwin*) PLATFORM="macos" ;;
    MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
    *) echo "Unknown OS: $(uname -s)"; exit 1 ;;
  esac
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/resources/php"

PHP_BIN="$(command -v php || true)"
if [ -z "$PHP_BIN" ]; then
  echo "[php] ERROR: no php on PATH (run setup-php first)"
  exit 1
fi

mkdir -p "$DEST/bin"
rm -rf "$DEST/ext" "$DEST/php.ini"

if [ "$PLATFORM" = "windows" ]; then
  # setup-php installs a full dir (php.exe + ext/ + ini)
  PHP_DIR="$(dirname "$PHP_BIN")"
  cp "$PHP_BIN" "$DEST/bin/php.exe"
  [ -d "$PHP_DIR/ext" ] && cp -r "$PHP_DIR/ext" "$DEST/ext"
  [ -f "$PHP_DIR/php.ini" ] && cp "$PHP_DIR/php.ini" "$DEST/php.ini"
  echo "[php] copied from $PHP_DIR"
else
  cp "$PHP_BIN" "$DEST/bin/php"
  chmod +x "$DEST/bin/php"
  # Copy shared extensions dir if present (ubuntu/macOS brew layout)
  EXT_DIR="$(php -r 'echo ini_get("extension_dir");' 2>/dev/null || true)"
  if [ -n "$EXT_DIR" ] && [ -d "$EXT_DIR" ]; then
    cp -r "$EXT_DIR" "$DEST/ext"
    echo "[php] copied extensions from $EXT_DIR"
  fi
  echo "[php] copied from $PHP_BIN"
fi

# Verify the copy runs
if [ "$PLATFORM" = "windows" ]; then
  "$DEST/bin/php.exe" --version | head -1
else
  "$DEST/bin/php" --version | head -1
fi
echo "[php] done"
