#!/usr/bin/env bash
# Bundle the PHP CLI into resources/php/.
# Usage: bash scripts/download-php.sh [macos|windows|linux]
#
# linux/macos: copy the PHP installed on PATH (setup-php in CI, system PHP locally).
# windows:    download a pinned, statically-linked, self-contained php.exe built
#             with static-php-cli and published by the NativePHP project.
#
# Why static on Windows (see docs/CICD.md "Bundled Runtime"): the official
# windows.php.net php.exe is a small stub that imports php8.dll,
# VCRUNTIME140.dll and ~20 support DLLs from its own directory. Copying only
# the exe shipped a PHP that could not start on end-user machines (missing
# php8.dll -> exit 0xC0000135, or a foreign php8.dll resolved from PATH ->
# exit 0xC0000005 access violation). The static build imports only Windows
# system DLLs, so none of these failure modes exist. It also removes the
# Visual C++ Redistributable requirement entirely.
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

# --- windows: pinned static PHP from NativePHP/php-bin ------------------------
# The pin is a NativePHP/php-bin git commit (raw.githubusercontent URLs are
# byte-immutable) plus the sha256 of the zip. To upgrade PHP on Windows: pick a
# newer commit there, update both values, and let CI verify. PHP 8.3 is used
# because the PHAR (built for 8.2) runs fine on 8.3 - verified with
# `php krpanocode.phar --json --version`. Env overrides exist for local testing.
NATIVEPHP_COMMIT="e0c212d36422e5aa1f7357ec0524d99de8ee79bf"
NATIVEPHP_ZIP_SHA256="5b760f635c949e5d4f8b472dd9f0e87ca149f74afac70507fc2770f728c4e897"
NATIVEPHP_ZIP_URL="https://raw.githubusercontent.com/NativePHP/php-bin/${NATIVEPHP_COMMIT}/bin/win/x64/php-8.3.zip"
# Extensions the PHAR backend requires at runtime (build fails if missing).
REQUIRED_EXTENSIONS="curl mbstring openssl zip fileinfo phar"

if [ "$PLATFORM" = "windows" ]; then
  mkdir -p "$DEST/bin"
  # The static build needs neither ext/ nor php.ini (everything is compiled in).
  rm -rf "$DEST/ext" "$DEST/php.ini"

  TMPDIR_PHP="$(mktemp -d)"
  ZIP="$TMPDIR_PHP/php-static.zip"
  echo "[php] downloading $NATIVEPHP_ZIP_URL"
  curl -sfL "${NATIVEPHP_PHP_URL:-$NATIVEPHP_ZIP_URL}" -o "$ZIP"

  echo "[php] verifying sha256"
  ACTUAL_SHA="$(sha256sum "$ZIP" | awk '{print $1}')"
  EXPECTED_SHA="${NATIVEPHP_PHP_SHA256:-$NATIVEPHP_ZIP_SHA256}"
  if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
    echo "[php] ERROR: sha256 mismatch"
    echo "  expected: $EXPECTED_SHA"
    echo "  actual:   $ACTUAL_SHA"
    echo "  If the pin was updated, review the new zip, then update the"
    echo "  NATIVEPHP_* variables in scripts/download-php.sh."
    exit 1
  fi

  echo "[php] extracting php.exe"
  # Git Bash on Windows runners has no unzip; try unzip, 7z, then PowerShell.
  if command -v unzip >/dev/null 2>&1; then
    unzip -oq "$ZIP" -d "$DEST/bin"
  elif command -v 7z >/dev/null 2>&1; then
    7z x -y -o"$DEST/bin" "$ZIP" >/dev/null
  else
    powershell -NoProfile -Command "Expand-Archive -Force -LiteralPath '$ZIP' -DestinationPath '$DEST/bin'"
  fi
  [ -f "$DEST/bin/php.exe" ] || { echo "[php] ERROR: php.exe not found after extraction"; exit 1; }
  rm -rf "$TMPDIR_PHP"

  # Runtime checks: only meaningful where a PE executable can run.
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*|Windows*)
      echo "[php] verifying runtime"
      "$DEST/bin/php.exe" -v | head -1
      "$DEST/bin/php.exe" -v | head -1 | grep -q "PHP 8.3" || {
        echo "[php] ERROR: expected PHP 8.3, refusing to bundle"; exit 1;
      }

      MODULES="$("$DEST/bin/php.exe" -n -m | tr '[:upper:]' '[:lower:]')"
      for ext in $REQUIRED_EXTENSIONS; do
        echo "$MODULES" | grep -qx "$ext" || {
          echo "[php] ERROR: required extension missing from static build: $ext"; exit 1;
        }
      done

      if [ -f "$ROOT/resources/krpanocode.phar" ]; then
        echo "[php] PHAR smoke test (--json --version)"
        "$DEST/bin/php.exe" -n "$ROOT/resources/krpanocode.phar" --json --version || {
          echo "[php] ERROR: PHAR smoke test failed under bundled PHP"; exit 1;
        }
      fi
      ;;
    *)
      echo "[php] skipping exe verification (not running on Windows)"
      ;;
  esac

  echo "[php] done (static win-x64 build, single self-contained php.exe)"
  exit 0
fi

# --- linux/macos: copy the PHP from PATH (setup-php in CI) --------------------
PHP_BIN="$(command -v php || true)"
if [ -z "$PHP_BIN" ]; then
  echo "[php] ERROR: no php on PATH (run setup-php first)"
  exit 1
fi

mkdir -p "$DEST/bin"
rm -rf "$DEST/ext" "$DEST/php.ini"

cp "$PHP_BIN" "$DEST/bin/php"
chmod +x "$DEST/bin/php"
# Copy shared extensions dir if present (ubuntu/macOS brew layout)
EXT_DIR="$(php -r 'echo ini_get("extension_dir");' 2>/dev/null || true)"
if [ -n "$EXT_DIR" ] && [ -d "$EXT_DIR" ]; then
  cp -r "$EXT_DIR" "$DEST/ext"
  echo "[php] copied extensions from $EXT_DIR"
fi
echo "[php] copied from $PHP_BIN"

# Verify the copy runs
"$DEST/bin/php" --version | head -1
echo "[php] done"
