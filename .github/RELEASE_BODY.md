# KRpanoCode Studio v${VERSION}

KRpanoCode Studio is a desktop GUI for editing KRPano virtual-tour XML files
using an LLM. It wraps the `krpanocode.phar` CLI with a React-based UI:
prompt-driven edits, NDJSON streaming, live diff review with click-to-edit,
and a conversation log with token-usage breakdown.

> ⚠️ **These binaries are not code-signed.** All three OS vendors will warn
> you on first launch. Follow the platform-specific steps below to run the app.

---

## Downloads

| File | Platform | Arch | ~Size |
|------|----------|------|-------|
| `KRpanoCode.Studio-${VERSION}.AppImage`         | Linux   | x64   | ~149 MB |
| `krpanocode-studio_${VERSION}_amd64.deb`        | Linux   | x64   | ~115 MB |
| `KRpanoCode.Studio-${VERSION}.dmg`              | macOS   | x64   | ~128 MB |
| `KRpanoCode.Studio-${VERSION}-arm64.dmg`        | macOS   | arm64 | ~127 MB |
| `KRpanoCode.Studio.Setup.${VERSION}.exe`        | Windows | x64   | ~117 MB |

For macOS, pick the `.dmg` matching your CPU (Apple Silicon = arm64, Intel = x64).

---

## Linux

### AppImage (recommended, works on any distro)

```bash
chmod +x KRpanoCode.Studio-${VERSION}.AppImage
./KRpanoCode.Studio-${VERSION}.AppImage
```

If your system complains about FUSE, install `libfuse2`:

```bash
# Debian / Ubuntu
sudo apt install libfuse2

# Fedora
sudo dnf install fuse
```

If sandboxing still blocks the AppImage, extract and run directly:

```bash
./KRpanoCode.Studio-${VERSION}.AppImage --appimage-extract
./squashfs-root/AppRun
```

### .deb (Debian / Ubuntu)

```bash
sudo apt install ./krpanocode-studio_${VERSION}_amd64.deb
# Or with dpkg + dependency fix-up:
sudo dpkg -i krpanocode-studio_${VERSION}_amd64.deb
sudo apt -f install
```

Then launch from your app menu or run `krpanocode-studio`.

---

## macOS

> ⚠️ **Not signed and not notarized.** Gatekeeper will block the app on first
> run. You must bypass it once. After bypassing, macOS remembers your
> approval and double-clicking works normally from then on.

### Step 1 — Download the right file

- Apple Silicon (M1/M2/M3/M4): `KRpanoCode.Studio-${VERSION}-arm64.dmg`
- Intel Macs: `KRpanoCode.Studio-${VERSION}.dmg`

### Step 2 — Install

Open the `.dmg`, drag **KRpanoCode Studio** to your **Applications** folder,
then eject the disk image.

The app must live in `/Applications/` for the next step to take effect on the
right path (the command below targets `/Applications/KRpanoCode Studio.app`).
If you install it elsewhere, adjust the path in the command.

### Step 3 — Bypass Gatekeeper

**Option A — Terminal method (recommended, one line):**

Open **Terminal** (Cmd+Space → type "Terminal" → Enter) and paste:

```bash
xattr -cr "/Applications/KRpanoCode Studio.app"
```

This recursively removes the `com.apple.quarantine` extended attribute from
the entire bundle — including nested helpers (the bundled PHP binary and
`krpanocode.phar`). After this, double-clicking works normally.

> ⚠️ Using `xattr -d` on only the top-level executable leaves quarantine
> flags on nested binaries. Always use `-cr` (recursive clear) on the whole
> `.app` bundle.

**Option B — Right-click method (GUI only, no Terminal):**

1. Open **Finder** → **Applications**.
2. **Right-click** (or Control-click) on **KRpanoCode Studio** — do NOT
   double-click.
3. Choose **Open** from the context menu.
4. A dialog appears: *"KRpanoCode Studio cannot be opened because Apple
   cannot check it for malicious software."* — click **Show Details → Open
   Anyway** (or just **Open** on macOS Sonoma and earlier).
5. The app launches. macOS remembers your approval — next time, a normal
   double-click works.

**Option C — System Settings method (macOS Sequoia 15+):**

On newer macOS where the right-click option may not appear:

1. Try to launch the app once — it gets blocked.
2. Open **System Settings → Privacy & Security**.
3. Scroll down — you'll see a message: *"KRpanoCode Studio was blocked to
   protect your Mac."* — click **Open Anyway**.
4. Confirm in the dialog that appears.

### macOS post-install note

The first launch may take 10–20 extra seconds while macOS validates the
bundle. The bundled PHP binary and `krpanocode.phar` live inside
`KRpanoCode Studio.app/Contents/Resources/` — keep them in place; the app
spawns them at runtime.

### If the app won't launch at all after the xattr command

This is rare, but if Gatekeeper is enforced by your organization's MDM
policy or if you're running a managed Mac, the `xattr` bypass may not work.
In that case:

```bash
# Check what attributes are still on the bundle
xattr "/Applications/KRpanoCode Studio.app"

# If you see anything other than (nothing), remove those too:
xattr -c "/Applications/KRpanoCode Studio.app"
# Then retry -r recursively:
xattr -cr "/Applications/KRpanoCode Studio.app"
```

If the app still won't launch, your Mac is enrolled in an MDM profile that
enforces notarization. You'll need to talk to your IT administrator or use
a different Mac.

---

## Windows

> ⚠️ **Not signed.** Windows will warn ("Windows protected your PC") and
> Microsoft Defender may silently quarantine the installer. Follow the steps
> below in order — step 1 prevents the file from vanishing before you can
> run it.

### Install

**Step 1 — Unblock the downloaded file first (prevents Defender quarantine):**

The `.exe` arrives flagged as downloaded from the internet (Mark-of-the-Web).
Remove that flag before doing anything else, or Defender may quarantine it
silently and leave you wondering where the file went.

In **PowerShell** (right-click → Run as Administrator is not required, but
works too):

```powershell
Unblock-File .\KRpanoCode.Studio.Setup.${VERSION}.exe
```

If you downloaded to `Downloads`:

```powershell
Unblock-File "$env:USERPROFILE\Downloads\KRpanoCode.Studio.Setup.${VERSION}.exe"
```

**Step 2 — Optional but recommended: add a temporary Defender exclusion:**

Unsigned installers commonly trigger Defender's PUA (Potentially Unwanted
Application) protection, which will quarantine the file even after unblocking.
To prevent that:

1. Open **Windows Security** (Start menu → "Windows Security").
2. Go to **Virus & threat protection → Manage settings**.
3. Scroll to **Exclusions** → **Add or remove exclusions → Add an exclusion**.
4. Choose **Folder**, select the folder containing the downloaded `.exe`.
5. Close the window.

> ⚠️ Remove the exclusion after the install completes — don't leave it
> in place permanently. **Settings → Windows Security → Virus & threat
> protection → Manage settings → Exclusions → Remove**.

**Step 3 — Double-click the installer:**

1. **Double-click** `KRpanoCode.Studio.Setup.${VERSION}.exe`.
2. If SmartScreen appears with *"Windows protected your PC"* — click
   **More info** → **Run anyway**.
3. If UAC prompts for elevation, approve it (NSIS installer writes to
   `%LOCALAPPDATA%\Programs\` by default).
4. The installer places a shortcut in the Start Menu and on the Desktop.

### If Windows Defender still quarantines the file

If the installer disappears between Step 1 and Step 3 (Defender acted
silently), restore it:

1. Open **Windows Security** → **Virus & threat protection** →
   **Protection history**.
2. Find the quarantined item (it should reference the `.exe` file name).
3. Click it → **Actions → Restore** (or "Allow on device" if Restore is
   not shown).
4. The file reappears in its original location. Re-run Step 3.

### If the installer is blocked entirely ("This app can't run on your PC")

This is the stricter Windows Defender Application Control block. Run from
PowerShell **as Administrator**:

```powershell
# Unblock the file first (skip if you already did)
Unblock-File .\KRpanoCode.Studio.Setup.${VERSION}.exe

# Run the installer explicitly, bypassing the Explorer-level block
Start-Process .\KRpanoCode.Studio.Setup.${VERSION}.exe
```

This bypasses Explorer's second-chance prompt by invoking the install
directly from the process API.

### If SmartScreen still blocks the Start-Process launch

Temporarily disable SmartScreen for downloaded files, run the installer,
then turn it back on:

1. **Windows Security** → **App & browser control → Reputation-based
   protection settings**.
2. Turn off **"Check apps and files"**.
3. Run the installer (double-click).
4. Turn **"Check apps and files"** back on immediately after the install
   completes.

> ⚠️ Do not leave SmartScreen disabled. It exists to protect you from
> genuine malware in other downloads.

### Uninstall

**Settings → Apps → Installed apps → KRpanoCode Studio → Uninstall**, or run
the uninstaller in `C:\Users\<you>\AppData\Local\Programs\KRpanoCode Studio\`.

---

## First Run Setup

On first launch you'll be asked for a **LiteLLM-compatible API key** with `sk-`
prefix (the app uses `https://ai.panomatics.com/v1/` by default). Get a key
from Panomatics, paste it into the Setup screen, click **Verify**, and you're
ready to open a tour folder.

---

## What's Bundled

Every package ships with:

- The Electron app
- A portable PHP runtime
- The `krpanocode.phar` backend CLI

No system PHP or Composer install is needed on the user's machine.

---

## Auto-Update

The app uses `electron-updater`. After install, it will check GitHub Releases
on startup and offer updates when new versions are published. The same
bypass-warning flow applies to updated builds until the project starts
code-signing.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| macOS: "cannot be opened, Apple cannot check it" | Use Option A, B, or C in the macOS section. |
| macOS: nested helper (PHP/PHAR) won't launch | Re-run `xattr -cr "/Applications/KRpanoCode Studio.app"` (recursive, not `-d`). |
| macOS: MDM-enforced notarization block | Talk to your IT admin — bypass won't work on managed Macs. |
| Windows: installer disappears silently | `Unblock-File` first + restore from Protection History (see Windows Step 1). |
| Windows: "This app can't run on your PC" | PowerShell: `Unblock-File` + `Start-Process` (see Windows section). |
| Windows: "Windows protected your PC"     | More info → Run anyway. |
| Windows: SmartScreen keeps blocking      | Temporarily disable reputation-based protection (see Windows section). |
| AppImage: "dlopen(): error loading libfuse.so.2" | `sudo apt install libfuse2` |
| .deb install: missing dependencies | `sudo apt -f install` |
| First launch is slow | OS is validating the unsigned bundle — wait 10–20s. |
| "No API key" badge in TopBar | Use the in-app Setup screen to add your key. |

---

## Source & Development

- **Source**: <https://github.com/iceman1010/KRPanoCodeStudio>
- **Developer docs**: `docs/` in the repo (CI/CD, logging, mock, self-update)
- **User manual**: shipped in-app (Help menu) and on the project wiki
- **Backend CLI source**: <https://github.com/iceman1010/KRPano_LLM_code>

---

## License

See the `LICENSE` file in the source repository.
