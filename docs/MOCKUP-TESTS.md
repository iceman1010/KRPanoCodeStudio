# Mock Environment Documentation

## Overview
The mock (`main/mock/krpanocode-mock`) is a Bash script that **emulates the full `--json` contract** of the real `krpanocode.phar`. It emits the same NDJSON events, simulates timing, and writes minimal files to test the UI watcher and restore functionality. Use it to develop and test the UI **without incurring API costs**.

## How the Mock is Enabled

The mock activates automatically in **dev mode** when the real PHP backend is not found:

```bash
npm run dev
```

Because dev runs from source (no bundled `resources/php/`), the app falls back to the built-in mock at `main/mock/krpanocode-mock`.

### Manual Control (Optional)

You can force specific behavior via environment variables:

| Env Var | Value | Effect |
|---------|-------|--------|
| `KRPANOCODE_DEV_MOCK` | Path to any script/executable | Uses that path as the backend (e.g., `KRPANOCODE_DEV_MOCK=/path/to/my-mock npm run dev`) |
| `KRPANOCODE_DEV=1` | `1` | Forces the built-in mock (`main/mock/krpanocode-mock`) even if system PHP exists |
| `KRPANOCODE_DEV_MOCK=""` | Empty string | Disables mock fallback, forces real backend (if PHP exists) |

### Priority Order (resolveBackend)

1. `KRPANOCODE_DEV_MOCK` → explicit path (highest priority)
2. `KRPANOCODE_DEV === "1"` → built-in mock
3. Real backend → bundled PHP → system PHP → mock fallback

## Supported Commands

The mock supports the same commands as the real PHAR:

### `--json --version`

```bash
krpanocode-mock --json --version
```

Emits:
```json
{"type":"version","version":"0.5.4-mock"}
```

---

### `--json --models`

```bash
krpanocode-mock --json --models
```

Emits:
```json
{"type":"models","models":["glm-5.2-coding","glm-5.2-nvidia","gpt-4o"]}
```

---

### `--json --setup --key <KEY> --model <MODEL>`

```bash
krpanocode-mock --json --setup --key "good-key-123" --model "glm-5.2-coding"
```

**Valid keys**: any string **not** starting with `bad*` or `BAD*`.

Emits:
```json
{"type":"setup","ok":true,"model":"glm-5.2-coding","models":["glm-5.2-coding","glm-5.2-nvidia","gpt-4o"]}
```

**Invalid keys** (`bad-key`, `BAD_SECRET`):
```json
{"type":"setup","ok":false,"error":"API key rejected (401)"}
```
Exits with code `1`.

---

### `--json --update`

```bash
krpanocode-mock --json --update
```

Outputs:
```
Checking for updates...
Already up to date (v0.5.4-mock).
```

The UI detects this and shows no update available.

---

### `--json -p "<prompt>" -f <folder>`

**Standard edit flow** (no clarify):

```bash
krpanocode-mock --json -p "Disable auto-rotate." -f "/path/to/tour"
```

**Emits (with realistic sleeps):**

```json
{"type":"start","tour":"tour-folder","backup":"/path/to/tour/.mock-backup/2026-08-01-123456-mock","editable":["tour-d.xml","skin/skin.xml","tour.xml"],"locked":["blend.xml"]}
{"type":"reasoning","text":"Looking at tour.xml for scene title attributes..."}
{"type":"tool","name":"read_file","file":"tour.xml","ms":412}
{"type":"tool","name":"docsearch","query":"scene title attribute","ms":2103}
{"type":"tool","name":"write_file","file":"tour.xml","bytes":8494}
{"type":"diff","file":"tour.xml","hunks":[{"line":123,"context":"<scene name=\"scene_poolsideday\"","old":"title=\"Main Pool\"","new":"title=\"Swimming Pool\""}]}
{"type":"done","ms":64300}
```

**Also writes a touch file** (`<folder>/.krpanocode-mock-touch`) to trigger the UI watcher for preview reload.

---

### `--json --clarify -p "<prompt>" -f <folder>`

**Clarify flow** (blocks on stdin for user answer):

```bash
echo "scene titles" | krpanocode-mock --json --clarify -p "Update the tour." -f "/path/to/tour"
```

**Emits:**

```json
{"type":"start","tour":"tour-folder",...}
{"type":"clarify","status":"clarify","question":"Which part of the tour do you want to change — scene titles, skin colors, or hotspot tooltips?"}
```

**Blocks** until a line is written to stdin (`echo "scene titles" | ...`). Then continues:

```json
{"type":"reasoning","text":"Got it — applying to: scene titles"}
{"type":"reasoning","text":"Looking at tour.xml for scene title attributes..."}
...
{"type":"done","ms":64300}
```

**To skip/abort clarification**, write `"skip"` to stdin:

```bash
echo "skip" | krpanocode-mock --json --clarify -p "..." -f "/path/to/tour"
```

The UI handles this via the "Skip & cancel" button in the ClarifyChat component.

---

### `--json --restore -f <folder>`

Restores files from the most recent backup (`<folder>/.mock-backup/<timestamp>-mock/`):

```bash
krpanocode-mock --json --restore -f "/path/to/tour"
```

**Emits:**

```json
{"type":"restored","files":["tour.xml",".krpanocode-mock-touch"],"backup":"/path/to/tour/.mock-backup/2026-08-01-123456-mock"}
{"type":"done"}
```

**If no backup exists:**

```json
{"type":"error","message":"No backup found for this tour."}
```

Exits with code `1`.

---

## Special Scenarios

### Rate-Limit Test

To test the UI's rate-limit banner and countdown, include **"ratelimit"**, **"429"**, or **"rate_limit"** in the prompt:

```bash
krpanocode-mock --json -p "This triggers ratelimit." -f "/path/to/tour"
```

**Emits:**

```json
{"type":"error","message":"Rate limit reached on glm-5.2-coding. Limit resets at 2026-08-01T02:45:00Z.","kind":"rate_limit","model":"glm-5.2-coding","reset_at":"2026-08-01T02:45:00Z","retry_after_seconds":600}
```

Exits with code `1`.

The UI's `RateLimitBanner` displays a countdown (10 minutes = 600 seconds) and a Retry button.

### Bad API Key Test

To test setup error handling:

```bash
krpanocode-mock --json --setup --key "bad-key-123" --model "glm-5.2-coding"
```

Emits:
```json
{"type":"setup","ok":false,"error":"API key rejected (401)"}
```
Exits with code `1`.

---

## Modifying the Mock

The mock is a Bash script at `main/mock/krpanocode-mock`. Make it executable (`chmod +x`) and edit directly.

### Common Modifications

#### Change Models List

Edit line 79:
```bash
emit '{"type":"models","models":["glm-5.2-coding","glm-5.2-nvidia","gpt-4o"]}'
```

Add/remove models as needed.

#### Change Rate-Limit Duration

Edit line 139 (currently 10 minutes = 600 seconds):
```bash
RESET_AT=$(date -u -d "+10 minutes" +%Y-%m-%dT%H:%M:%SZ ...)
```

Change `+10 minutes` to any duration. Also update `retry_after_seconds:600` on line 140 to match.

#### Add Custom Tool Events

After the start event (line 133), add more tool emissions:

```bash
emit '{"type":"tool","name":"grep","file":"skin/skin.xml","ms":150}'
sleep_ms 200
emit '{"type":"tool","name":"contextsearch","query":"hotspot style","ms":890}'
sleep_ms 400
```

#### Change Clarify Question

Edit line 146:
```bash
emit '{"type":"clarify","status":"clarify","question":"Your custom question here?"}'
```

#### Modify Diff Output

Edit line 177:
```bash
emit '{"type":"diff","file":"tour.xml","hunks":[{"line":123,"context":"<scene name=\"scene_poolsideday\"","old":"title=\"Main Pool\"","new":"title=\"Swimming Pool\""}]}'
```

Add more hunks or change the file.

#### Test Multiple Edits

To emit multiple diffs, add more `{"type":"diff",...}` lines before `{"type":"done"}`.

---

## Testing the UI with the Mock

### Step 1: Start Dev with Mock (Default)

```bash
npm run dev
```

The mock is active automatically (no bundled PHP in dev).

### Step 2: Open the App

The Electron window opens. Load a test tour (e.g., `KRPano_LLM_code/Example_KRpano_Tours/huahinsportcenter`).

### Step 3: Send a Prompt

Type a prompt and click **Send**. The mock will:

1. Emit `start` event → UI shows "Processing..."
2. Emit `reasoning` events → Right panel shows reasoning steps
3. Emit `tool` events → Right panel shows file reads, writes, searches
4. Emit `diff` event → Right panel shows the diff
5. Emit `done` event → UI shows "Done" (or error if rate-limit triggered)

**Watch the preview reload**: The mock writes `.krpanocode-mock-touch`, triggering the watcher.

### Step 4: Test Clarify

Use the Clarify toggle (right panel, "✓ Clarify") before sending. The UI blocks on stdin until you answer:

- Enter text → mock incorporates it and continues
- Click "Skip & cancel" → writes "skip" to stdin, mock aborts

### Step 5: Test Restore

After an edit, click **Restore** in the UI (or Settings → Restore). The mock restores files from `.mock-backup/`.

### Step 6: Test Rate-Limit

Send a prompt containing "ratelimit". The UI's `RateLimitBanner` appears with a 10-minute countdown. Click **Retry** to re-send the last prompt.

### Step 7: Test Setup Error

In the Settings modal, enter a bad API key (starts with `bad`) and click **Setup**. The mock returns an error, and the UI shows it.

---

## Mock Internals

### Event Emission Helper

```bash
emit() {
    printf '%s\n' "$1"
}
```

All events are newline-delimited JSON on stdout (NDJSON).

### Sleep Helper

```bash
sleep_ms() {
    sleep "$(awk -v ms="$1" 'BEGIN{printf "%.3f", ms/1000}')"
}
```

Sleeps for milliseconds to simulate realistic timing.

### Backup Directory

Created on every `-p` run: `<folder>/.mock-backup/<timestamp>-mock/`

Contains copies of all files touched (currently just `.krpanocode-mock-touch`).

### Touch File

The mock writes a minimal XML file to trigger the watcher:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!-- krpanocode mock write at 2026-08-01T12:34:56+00:00 -->
<!-- prompt: Disable auto-rotate. -->
<krpanocode_mock_marker/>
```

This ensures the file system watcher detects a change for preview reload.

---

## Debugging the Mock

### Run Mock Directly

```bash
./main/mock/krpanocode-mock --json -p "test" -f /tmp/test-tour
```

Watch stdout for emitted events.

### Check Which Backend is Active

In the UI log (`View log` in Settings), look for:

```
[backend] PHP not found at ..., falling back to mock
```

This confirms the mock is active.

### Force Real Backend in Dev

```bash
KRPANOCODE_DEV_MOCK="" npm run dev
```

Ensures system PHP is used (if available).

---

## Limitations

- The mock **does not actually edit tour files** (only writes a touch file).
- The diff is synthetic — not derived from real changes.
- Only one backup is kept per tour (mock doesn't prune old backups).
- Rate-limit timer is fixed at 10 minutes (modify if needed).

---

## Summary

| Use Case | Command / Setting |
|----------|-------------------|
| Normal dev test | `npm run dev` (mock auto-active) |
| Force mock override | `KRPANOCODE_DEV_MOCK=/path/to/mock npm run dev` |
| Test real backend in dev | `KRPANOCODE_DEV_MOCK="" npm run dev` |
| Test rate-limit | Prompt contains "ratelimit" |
| Test bad API key | Key starts with "bad" or "BAD" |
| Modify scenarios | Edit `main/mock/krpanocode-mock` |
| Debug mock output | Run directly from shell |

---

## Related Files

- `main/mock/krpanocode-mock` — the mock script
- `main/index.cjs` — `resolveBackend()` function (line 307)
- `src/components/right-panel/ClarifyChat.tsx` — clarify UI
- `src/components/right-panel/RateLimitBanner.tsx` — rate-limit UI
- `PLAN-JSON-MODE.md` — full contract spec (in backend folder)