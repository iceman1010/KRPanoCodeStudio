# Self-Update Mechanism

## Overview

KRpanoCode Studio uses `electron-updater` (part of the electron-builder ecosystem) to provide automatic background updates via GitHub Releases. The app checks for updates on startup and notifies the user when a new version is available.

## Architecture

### Version Detection
- Compares `package.json` version vs GitHub Releases `latest` tag
- Version format: semver in `package.json` (e.g., `0.2.3`) → tag with `v` prefix on GitHub (e.g., `v0.2.3`)
- Electron-builder generates metadata files (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`) during packaging
- Metadata files are uploaded to GitHub Releases alongside the binaries

### Update Flow (notification-only)

1. **App startup** → `checkUpdatesOnStartup()` runs (see main process below)
2. **Check app update** → `autoUpdater.checkForUpdates()` (with `autoDownload = false`, so nothing is downloaded automatically)
3. **Check CLI update** → compares the installed PHAR version vs the latest `krpanocode-releases` tag (via GitHub API); **never** runs `--update` on its own
4. **Notify user** → if *either* the app or the CLI is stale, a single `update-check-notification` event is sent to the renderer
5. **`UpdateNotificationModal`** → a modal with a single **OK** button tells the user what is outdated and directs them to Preferences (Settings), where the actual update buttons live
6. **Install** → the user installs from Preferences: app update via "Update to X", CLI update via the version picker

## Platform-Specific Behavior

| Platform | Target | Install Method | Elevation Required? |
|----------|--------|----------------|---------------------|
| macOS | DMG | Squirrel.Mac (atomic bundle swap) | No |
| Windows | NSIS | Silent installer | No (per-user), Yes (per-machine) |
| Linux | AppImage | In-place file replace | No (if writable) |
| Linux | deb/rpm/pacman | Package manager install | Yes (pkexec/sudo) |

### Linux Notes
- **AppImage**: Updates in-place if the AppImage file is writable (user-installed). Automatic install on next launch.
- **deb/rpm/pacman**: Requires system package manager privileges. Automatic install on next launch is **skipped** to avoid showing auth prompts at startup. User must explicitly click "Update Now" to trigger authentication dialog.

## Implementation

### Main Process (`main/index.cjs`)

**Imports and setup:**
```javascript
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = "info";
autoUpdater.autoDownload = false; // never download during a check
```

**Startup check (`checkUpdatesOnStartup`):**
- Runs once after the window is created (`checkUpdatesOnStartup()` in the `app.whenReady()` block)
- Skipped in dev mode / when a mock backend is active
- CLI check: `getPharVersion()` vs `getLatestReleaseTag()` — comparison only, no `--update`
- App check: `autoUpdater.checkForUpdates()` (packaged app only)
- Coalesces both results and, if anything is stale, sends one `update-check-notification` event: `{ app: { currentVersion, newVersion } | null, cli: { currentVersion, newVersion } | null }`

**Event handlers:**
- `update-available` → Sends to renderer via `webContents.send("update-available", info)`
- `update-not-available` → Logs current version
- `download-progress` → Sends progress to renderer
- `update-downloaded` → Notifies renderer, prompts user to restart
- `error` → Logs error, sends to renderer

**IPC handlers:**
- `check_for_updates()` → Manual check for updates
- `download_update()` → Trigger download (user-initiated from Preferences)
- `install_update()` → Install and restart
- `get_current_version()` → Return current app version

### Renderer (`src/components/UpdateNotificationModal.tsx`)

Modal component that:
- Listens for the `update-check-notification` event from the main process
- Appears only when a new app and/or CLI version is available
- Lists what is outdated (with current vs new versions) and instructs the user to open Preferences
- Shows a single **OK** button (`showCloseButton={false}`, no close X) to dismiss

### CI/CD (`.github/workflows/release.yml`)

**Critical change:** All `package:*` scripts now include `--publish always` flag:

```yaml
- name: Package (AppImage + deb)
  run: npm run package:linux -- --publish always
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

This ensures:
- `latest.yml` / `latest-mac.yml` / `latest-linux.yml` are generated
- Metadata files are uploaded to GitHub Releases
- Apps can query the update feed

## PHAR Downgrade (Version Picker)

### Overview

The PHAR engine (the `krpanocode.phar` CLI) can be pinned to any previously
released version, not just the newest one. This is useful when a newer engine
release misbehaves — the user can step back to a known-good version and keep
working while the issue is investigated.

### CLI side

The PHAR's `--update` accepts an optional `--to-version <ver>` argument:

```bash
krpanocode --update               # latest (up-to-date guard applies)
krpanocode --update --to-version 0.5.8   # install a specific version (downgrade allowed)
```

- When `--to-version` is omitted, behavior is unchanged: `/releases/latest` +
  a `version_compare('>=')` guard that short-circuits when already current.
- When given, the CLI fetches `GET /repos/iceman1010/krpanocode-releases/releases/tags/v<ver>`
  instead of `/latest`, and the `>=` guard is **skipped**, so downgrades work.
- Unknown tag → `Version vX.Y.Z not found in releases.` (non-zero exit).
- Still human-mode only (`--json --update` remains explicitly out of contract).

### UI side

Settings → "KRpanoCode CLI (the engine)" now has a version picker:

- A **Select dropdown** lists `latest` plus every released version (fetched via
  the `list_release_versions` IPC from
  `https://api.github.com/repos/iceman1010/krpanocode-releases/releases?per_page=100`).
- **"Update to latest" / "Install vX.Y.Z"** runs `self_update` (optionally with
  the selected version), which spawns `--update --to-version X.Y.Z` and streams
  progress back to the UI.
- After the run the UI re-queries `phar_version` and refreshes the active
  backend info.

### Notes

- Every release ships a `krpanocode.phar` asset, so all tagged versions are
  downgrade-eligible.
- Downgrades replace the PHAR in place at `<userData>/krpanocode.phar` (or the
  CLI's own `argv[0]`), exactly like upgrades.

## Configuration Files

### `package.json`

**Repository field** (required for auto-update to work):
```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/iceman1010/KRPanoCodeStudio"
  }
}
```

**Dependencies** (runtime):
```json
{
  "electron-updater": "^6.8.9",
  "electron-log": "^5.2.4"
}
```

### Metadata Files Generated by Build

| File | Platform | Location | Purpose |
|------|----------|----------|---------|
| `latest.yml` | Windows | GitHub Release | Update metadata for NSIS |
| `latest-mac.yml` | macOS | GitHub Release | Update metadata for DMG |
| `latest-linux.yml` | Linux | GitHub Release | Update metadata for AppImage/deb/rpm |

These are YAML files containing:
- Version number
- Release notes
- Release date
- File URLs and checksums
- File sizes

## Session-End Protection (electron-updater ≥ 7.0)

To prevent OS shutdown from killing the installer mid-install:

- **Default mode (`autoInstallEvent = "onQuit"`)**: Spawns installer while app quits
- **Session-end guard**: Detects OS shutdown (Windows: `session-end` event, macOS/Linux: `powerMonitor.shutdown`) and skips install if detected
- **Opt-in mode (`autoInstallEvent = "onNextLaunch"`)**: Defers install to next app startup (planned default in v28)

**Limitation:** If user launches app during OS shutdown window, installer can still be killed. This is a residual race condition. macOS is immune (Squirrel.Mac atomic swap).

## Testing

### Development Mode

Auto-update is **disabled in dev mode** (`app.isPackaged === false`). To test:

1. Build a release: `npm run package:linux`
2. Run the built AppImage directly
3. Manually bump version in `package.json`, build again, publish to GitHub
4. Launch the older AppImage — should detect update

### Test Checklist

- [ ] Windows NSIS (per-user) — silent update
- [ ] Windows NSIS (per-machine) — UAC prompt
- [ ] macOS DMG — atomic swap on quit
- [ ] Linux AppImage — in-place replace
- [ ] Linux deb/rpm/pacman — authentication prompt
- [ ] Download progress bar displays correctly
- [ ] "Update Now" button triggers download
- [ ] "restart to apply" message appears after download
- [ ] Startup modal appears only when an update is available (app and/or CLI)
- [ ] Startup modal can be dismissed via its single OK button
- [ ] Manual check via IPC works
- [ ] Error handling (network failure, corrupted download)

## Troubleshooting

### Update not detected

1. Verify `repository` field exists in `package.json`
2. Verify GitHub Release tag format: `v0.2.3` (with `v` prefix)
3. Check `latest*.yml` files exist in GitHub Release assets
4. Verify `GH_TOKEN` is set in CI workflow
5. Check app logs: `electron-log` writes to `~/.config/krpanocode-studio/studio.log`

### Update fails to download

1. Check network connectivity
2. Verify GitHub Release assets are publicly accessible (or auth is configured)
3. Check error logs in main process (`log.error("Update error:", err)`)

### Update fails to install (Linux)

1. Verify package manager is available (`dpkg`, `rpm`, `pacman`)
2. Check if user has sudo privileges
3. For AppImage: verify file is writable (not in read-only system dir)
4. Logs show detailed error message

### Session-end corruption (Windows/Linux)

If app breaks after OS shutdown/reboot:

1. This is mitigated by session-end guard in v27+, but not fully eliminated
2. User can re-run the installer manually from the cached download location
3. Next launch detects and clears broken pending state

## References

- [electron-builder Auto Update docs](https://www.electron.build/docs/features/auto-update)
- [electron-updater API](https://www.electron.build/docs/api/electron-updater)
- [GitHub Provider options](https://www.electron.build/docs/publish#github)
- [Session-end guard issue](https://github.com/electron-userland/electron-builder/issues/7807)

## Security Considerations

- Code signing is **required on macOS** for auto-update to work properly
- Update metadata includes SHA512 checksums for integrity verification
- Code signature verification on Windows (NSIS) ensures authenticity
- Public GitHub repository — no additional auth needed for update checks

## Future Enhancements

- Add code signing configuration for macOS
- Implement staged rollouts via `stagingPercentage` in `latest*.yml`
- Add "Download manually" fallback button that opens GitHub Releases page
- Support for private GitHub repositories via `GH_TOKEN` environment variable