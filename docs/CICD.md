# CI/CD Documentation — KRpanoCode Studio

## Overview
This document describes the complete continuous integration and release pipeline for KRpanoCode Studio. It is written for an LLM (or human) to understand, maintain, and extend the workflow.

## Repository
- **Source repo**: `https://github.com/iceman1010/KRPanoCodeStudio` (PRIVATE)
- **PHAR releases repo**: `https://github.com/iceman1010/krpanocode-releases` (where `krpanocode.phar` is published)
- **Branch**: `main` — all CI runs on pushes to `main`

## Trigger
The workflow **only runs when `package.json` version changes** on push to `main`.

Mechanism:
1. `version-check` job compares `HEAD~1:package.json` vs `HEAD:package.json` using `jq`
2. Outputs `changed=true/false` and `version=<new>`
3. All downstream jobs have `if: needs.version-check.outputs.changed == 'true'`
4. If version unchanged → all build jobs SKIPPED (not failed) → no release created

This means:
- Fix commits, feature commits, doc updates → **no CI run**
- Only version bumps (`npm version patch|minor|major` or manual edit + commit) → **full pipeline runs**

## Workflow File
**Path**: `.github/workflows/release.yml`

### Jobs
| Job | Runner | Purpose |
|-----|--------|---------|
| `version-check` | ubuntu-latest | Detect version change, output version string |
| `linux` | ubuntu-latest | Build AppImage + .deb |
| `macos-build` | macos-latest | Build .dmg (x64 + arm64) |
| `windows-build` | windows-latest | Build NSIS .exe |
| `create-release` | ubuntu-latest | Download artifacts, create GitHub Release with all assets |

### Concurrency
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: false
```
Only one run per ref at a time; do NOT cancel in-progress (releases must complete).

### Permissions
```yaml
permissions:
  contents: write
```
Needed for `softprops/action-gh-release@v2` to create releases and upload assets.

## Build Matrix Details

### Linux (ubuntu-latest)
- Targets: `AppImage` + `deb`
- Command: `npm run package:linux` → `electron-builder --linux --publish never`
- PHP: `shivammathur/setup-php@v2` with extensions: `mbstring, curl, openssl, posix, pcntl, zip, fileinfo`
- Artifact: `linux-release` (contains `*.AppImage`, `*.deb`)

### macOS (macos-latest)
- Targets: `dmg` for both `x64` and `arm64` (universal build)
- Command: `npm run package:mac -- --x64 --arm64` → `electron-builder --mac --publish never --x64 --arm64`
- Runner is arm64 (Apple Silicon); x64 built via Rosetta
- Artifact: `macos-release` (contains `*.dmg` × 2)

### Windows (windows-latest)
- Target: `NSIS` installer (.exe)
- Command: `npm run package:win` → `electron-builder --win --publish never`
- Shell: `bash` for download scripts (Git Bash on Windows)
- Artifact: `windows-release` (contains `*.exe`)

## Dependency Installation
All platform jobs:
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npm ci
```
Lockfile (`package-lock.json`) must be committed for reproducible installs.

## Bundled Runtime (PHP + PHAR)
The Electron app bundles PHP and the `krpanocode.phar` backend. Both are downloaded at CI time to avoid committing binaries.

### PHAR Download (`scripts/download-phar.sh`)
- Fetches latest release from `iceman1010/krpanocode-releases` via GitHub API
- Requires `GITHUB_TOKEN` (provided by Actions)
- Saves to `resources/krpanocode.phar`
- Verifies it's a valid PHAR (checks for `<?php` or `Phar` magic bytes)

### PHP Download (`scripts/download-php.sh <os>`)
- Uses PHP already installed by `shivammathur/setup-php`
- Copies to `resources/php/` preserving layout:
  - Linux/macOS: `resources/php/bin/php` + `lib/` + `php.ini`
  - Windows: `resources/php/bin/php.exe` + `ext/` + `php.ini`
- Verifies `php --version`

### Why Not Commit Binaries?
- Repo stays small (~1MB vs ~7MB)
- CI always gets latest PHAR
- Local dev uses system PHP + seeded PHAR fallback

## Electron Builder Config (package.json)
```json
{
  "build": {
    "files": ["dist/**", "main/**"],
    "extraResources": [
      { "from": "resources/php", "to": "php" },
      { "from": "resources/krpanocode.phar", "to": "krpanocode.phar" }
    ],
    "linux": { "target": ["AppImage", "deb"] },
    "mac": { "target": ["dmg"] },
    "win": { "target": ["nsis"] }
  }
}
```

### Critical: `extraResources` not `files`
- `files` → packed into `app.asar` (read-only, cannot spawn binaries)
- `extraResources` → copied **outside** ASAR to `process.resourcesPath/`
- App expects:
  - `process.resourcesPath/krpanocode.phar`
  - `process.resourcesPath/php/bin/php`

### Publish Disabled
All package scripts include `--publish never`:
```json
"package:linux": "electron-builder --linux --publish never",
"package:mac": "electron-builder --mac --publish never",
"package:win": "electron-builder --win --publish never"
```
Otherwise electron-builder detects CI + GH_TOKEN and tries to publish per-platform, creating partial releases and conflicting with the unified `create-release` job.

## Artifact Upload
Uses `actions/upload-artifact@v4` with **multiline paths** (brace expansion NOT supported):
```yaml
path: |
  release/*.AppImage
  release/*.deb
```
Same pattern for macOS (`release/*.dmg`) and Windows (`release/*.exe`).

## Release Creation
`create-release` job:
1. `actions/download-artifact@v4` — downloads all three artifacts
2. `softprops/action-gh-release@v2` — creates release `v${version}` with all assets
3. `draft: false`, `prerelease: false`

Release name/tag: `v0.2.2`, `v0.2.3`, etc.

## Local Development vs CI
| Aspect | Local Dev | CI |
|--------|-----------|-----|
| PHP | System PHP (`/usr/bin/php`) via fallback | Bundled from `shivammathur/setup-php` |
| PHAR | Seeded from `../KRPano_LLM_code/krpanocode.phar` | Downloaded fresh from releases repo |
| Packaging | `npm run package:linux` works if resources/ exist | Resources created by download scripts |

## Version Bump Procedure
```bash
# Option 1: npm (updates package.json, creates git tag)
npm version patch   # 0.2.2 → 0.2.3
npm version minor   # 0.2.2 → 0.3.0
npm version major   # 0.2.2 → 1.0.0

# Option 2: manual edit + commit
# Edit package.json version, then:
git add package.json
git commit -m "Bump version to X.Y.Z"
git push origin main
```
**Both trigger the pipeline.** `npm version` also creates a git tag locally; the workflow creates the GitHub Release (not the tag). Tags and releases are separate.

## Common Issues & Fixes

### "No files were found with the provided path"
Upload-artifact glob doesn't support `*.{ext1,ext2}`. Use multiline:
```yaml
path: |
  release/*.AppImage
  release/*.deb
```

### deb build fails: "Please specify author 'email'"
Add to `package.json`:
```json
"author": { "name": "Your Name", "email": "you@users.noreply.github.com" }
```

### Implicit publishing creates partial releases
Ensure all package scripts have `--publish never`. The release job owns publishing.

### macOS only builds arm64
macos-latest runners are Apple Silicon. Add `--x64 --arm64` to build both:
```bash
npm run package:mac -- --x64 --arm64
```

### Version unchanged → pipeline skipped (expected)
If you pushed without version bump, `version-check` outputs `changed=false` and all jobs skip. This is the designed gate.

## Extending the Pipeline

### Add a new platform (e.g., linux arm64)
1. Add job in workflow with `runs-on: ubuntu-latest` + Docker or self-hosted arm64 runner
2. Add `npm run package:linux-arm64` script: `electron-builder --linux --arm64 --publish never`
3. Add artifact upload + include in `create-release` needs/files

### Change PHP version
Update `shivammathur/setup-php@v2` `php-version` in all three build jobs.

### Change PHAR source
Edit `scripts/download-phar.sh` `RELEASES_LATEST_URL` and `REPO` variables.

### Add code signing (macOS/Windows)
1. Add secrets: `CSC_LINK`, `CSC_KEY_PASSWORD`, `WIN_CSC_LINK`, etc.
2. Add `electron-builder` config for `mac.identity`, `win.certificateFile`
3. Set `--publish never` still (signing happens at build time)

## Troubleshooting Checklist
- [ ] Version actually changed in `package.json`?
- [ ] `package-lock.json` committed?
- [ ] `author` field present with email?
- [ ] All package scripts have `--publish never`?
- [ ] Artifact upload uses multiline paths?
- [ ] `extraResources` includes both php/ and krpanocode.phar?
- [ ] `GH_TOKEN` permissions: contents write?
- [ ] PHAR releases repo accessible (same org/user, token has access)?

## Useful Commands
```bash
# Watch a run
gh run watch <run-id> --repo iceman1010/KRPanoCodeStudio

# View release assets
gh release view v0.2.2 --repo iceman1010/KRPanoCodeStudio --json assets

# List recent runs
gh run list --repo iceman1010/KRPanoCodeStudio --limit 5

# Delete a broken release (careful!)
gh release delete vX.Y.Z --repo iceman1010/KRPanoCodeStudio --yes

# Local packaging test (Linux)
npm run package:linux
ls release/
```