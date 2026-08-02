---
description: Project-specific agent configuration for KRpanoCode Studio development
mode: primary
permission:
  edit: ask
  bash:
    "*": ask
    "git status *": allow
    "git log *": allow
    "git diff *": allow
    "git branch": allow
    "git show": allow
    "npm run dev": allow
    "npm run dev:vite": allow
    "npm run dev:electron": allow
    "npm run build": allow
    "npm run package:linux": allow
    "ls *": allow
    "cat *": allow
    "wc *": allow
    "grep *": allow
    "rg *": allow
    "head *": allow
    "tail *": allow
  read: allow
  glob: allow
  grep: allow
  list: allow
  webfetch: ask
  websearch: ask
  task: ask
  question: allow
---

# KRpanoCode Studio Development Agent Rules

## Primary Objective
You are working on KRpanoCode Studio — an Electron desktop app (TypeScript + React + Vite) that provides a GUI front-end to the `krpanocode.phar` CLI. It edits KRPano virtual tour XML files via an LLM using NDJSON streaming.

## Tech Stack
- **Electron 42** — main process (`main/index.cjs`, CJS), renderer (React 19 + Vite)
- **React 19 + TypeScript 7** — renderer with strict mode
- **Zustand** — state (`src/stores/appStore.ts`)
- **Radix UI + Tailwind CSS 4** — UI primitives (`src/components/ui/`)
- **shiki** — syntax highlighting, **sonner** — toasts
- **Bash mock** — `main/mock/krpanocode-mock` emulates the PHAR NDJSON contract for dev
- **No test framework** — verification is manual + mock-backed (see `docs/MOCKUP-TESTS.md`)

## Project Structure
- **Entry**: `package.json` → `main/index.cjs` (main process) / `src/main.tsx` (renderer)
- **Main process**: `main/index.cjs` (750 lines — single file: IPC handlers, PHAR spawning, logging, preferences, watcher, embedded HTTP server for preview)
- **Preload bridge**: `main/preload.cjs` — exposes `window.electronAPI.invoke/on` via contextBridge
- **Renderer**: `src/App.tsx` → `src/components/TopBar.tsx` + `src/components/Preview.tsx` + `src/components/right-panel/*`
- **State**: `src/stores/appStore.ts` (Zustand), `src/lib/electron.ts` (IPC wrapper)
- **Docs**: `docs/` — see reference section below

## Critical Development Rules

### NEVER Auto-Commit or Release
- Do NOT run `git commit` / `git push` without explicit permission
- Do NOT bump `package.json` version automatically — CI releases are gated on version change
- Do NOT create git tags — the GitHub Release workflow owns tagging
- The CI/CD pipeline runs **only when `package.json` version changes** on `main` (see `docs/CICD.md`)

### ALWAYS Discuss Before Implementation
The user requires discussion before code changes to avoid wasted tokens:
1. Explain what you plan to do and why
2. Show specific files and the nature of the change
3. Wait for user approval
4. Then implement

### Read-Only Operations Are Safe
These do NOT require permission:
- Reading files, searching with grep/glob
- Running `git status`, `git log`, `git diff`
- Providing analysis and explanations

### NEVER Claim Code is "Perfect" Without Runtime Verification
After making changes:
1. **Always run `npm run dev` and watch browser console** for runtime errors
2. **Never declare anything "done"** from compilation alone (`npm run build` is insufficient)
3. **Read error messages word-for-word** — don't assume, parse exactly what they say
4. For React components using `on()`, remember it returns a Promise, not a function directly

## Architecture: Electron Main ↔ Renderer Bridge

All cross-process communication goes through one pattern:

```
Renderer (React) --invoke("cmd", ...args)--> preload.cjs --ipcRenderer.invoke--> main/index.cjs --ipcMain.handle--> Node logic
Main (Node)      --webContents.send("event")--> preload.cjs --ipcRenderer.on--> Renderer (React)
```

- **Renderer → Main**: `await invoke("open_tour", folder)` (see `src/lib/electron.ts`)
- **Main → Renderer**: `mainWindow.webContents.send("phar_event", payload)` then `on<PharEvent>("phar_event", cb)` in renderer
- **Never** use `remote` or expose Node APIs directly to the renderer. Always go through `preload.cjs`.

### IPC Handler Catalog (main/index.cjs)
| Handler | Line | Purpose |
|---------|------|---------|
| `open_tour` | 464 | Open tour folder, start watcher, seed preview server |
| `send_prompt` | 480 | Spawn PHAR with `--json` + prompt, stream NDJSON events |
| `clarify_answer` | 500 | Pipe `--clarify` answer stdin into running PHAR |
| `undo` | 510 | Run `--restore` (single last backup) |
| `list_models` | 522 | Fetch model list from LiteLLM proxy (stored in store) |
| `setup` | 554 | Verify API key + write `.env` for PHAR backend |
| `phar_version` / `latest_release` / `self_update` | 591+ | PHAR versioning and self-update |
| `get_preferences` / `save_preferences` / `get_preference` / `set_preference` | 675+ | Persistent user prefs (`preferences.json` in userData) |

## PHAR Backend Contract (NDJSON Streaming)

This app consumes `krpanocode.phar --json` output. The authoritative spec lives in the **sister project**:
`https://github.com/iceman1010/KRPano_LLM_code/PLAN-JSON-MODE.md`

Non-negotiable rules agents must follow:
- Events are NDJSON: `{"type":"...","field":"value"}\n` on **stdout**
- **Error events come on stdout** (not stderr) in JSON mode: `{"type":"error","message":"..."}`
- The renderer must handle any `type:"error"` event gracefully — never assume exit code 0 means success
- `type:"clarify"` events require piping the user's answer back via `clarify_answer` IPC
- `type:"diff"` events carry per-file before/after content for review
- See `docs/JSON-MODE.md` (this repo, when authored) and the sister project's `PLAN-JSON-MODE.md` for the full event taxonomy

## Mock Environment

Development uses a Bash mock that emulates the PHAR NDJSON contract (no API cost):
- **Automatic**: `npm run dev` falls back to `main/mock/krpanocode-mock` when real PHP/PHAR is missing
- **Force mock**: `KRPANOCODE_DEV=1 npm run dev`
- **Force real backend**: `KRPANOCODE_DEV_MOCK="" npm run dev` (needs system PHP + seeded PHAR)
- **Custom mock path**: `KRPANOCODE_DEV_MOCK=/path/to/my-mock npm run dev`
- Full details: `docs/MOCKUP-TESTS.md`

Always develop UI changes against the mock first, then verify with a real PHAR run.

## Logging

- Log file: `~/.config/krpanocode-studio/studio.log` (Linux), `~/Library/Application Support/...` (macOS), `%APPDATA%\...` (Windows)
- Logger initialized in `main/index.cjs` `initLogger()` (line ~12) — intercepts `console.log/error`
- Format: `[INFO|ERROR] <ISO timestamp> [module] message`
- IPC: `invoke("open_log")` (reveal in file manager), `invoke("get_log_path")` (return path)
- Full docs: `docs/LOGGING.md`

## Preferences System

Persistent per-user settings stored in `<userData>/preferences.json`:
- **Selected model** (`selectedModel`): persisted between restarts; dropdown in `TopBar.tsx`
- Read/write via `get_preference` / `set_preference` / `get_preferences` / `save_preferences` IPC handlers
- Loaded into `appStore.selectedModel` on startup in `src/App.tsx`
- When no API key is configured (`models.length === 0`), TopBar shows a "No API key" badge instead of the dropdown — handle this gracefully

## Verification Steps

There is no unit-test framework. Before marking a task complete, verify manually:

1. **Build check**: `npm run build` (typecheck + vite build)
2. **Lint**: no dedicated lint script — TypeScript strict mode in `tsconfig.json` is the type-check gate
3. **Runtime**: `npm run dev` — exercise the UI flow with the mock backend
4. **Production parity**: `npm run dev:prod` (disables mock, uses real PHAR if seeded)
5. **Packaging sanity** (Linux): `npm run package:linux` and inspect `release/`

## Common Pitfalls

- **PHAR binary paths**: `process.resourcesPath` is read-only in AppImage/Program Files. App copies bundled PHAR to `userData/krpanocode.phar` on first run (`ensurePharReady`)
- **`extraResources` vs `files`**: `files` is packed into read-only `app.asar`; PHAR + PHP must be in `extraResources` so they can be spawned
- **LiteLLM API keys**: must have `sk-` prefix or the proxy rejects them
- **Vite aliases**: `@/*` → `src/*` (configured in `vite.config.ts` and `tsconfig.json`)
- **Main process module type**: `main/index.cjs` is CommonJS ( Electron main cannot be ESM by default here); renderer is ESM via Vite

## Project Knowledge Reference

Detailed knowledge is split into focused docs:

- **`docs/SELF-UPDATE.md`** — electron-updater auto-update mechanism: GitHub Releases flow, platform-specific behavior, session-end protection, troubleshooting
- **`docs/LOGGING.md`** — log file location, format, modules, troubleshooting, how to disable
- **`docs/CICD.md`** — full release pipeline: version-gated trigger, build matrix, PHAR/PHP download, electron-builder config
- **`docs/MOCKUP-TESTS.md`** — mock environment setup, NDJSON emulation, dev/testing workflow without API costs

## Cross-References (Sister Project)

The PHAR backend is developed in a separate repo. When changes touch the NDJSON contract or event handling:
- **Repo**: `https://github.com/iceman1010/KRPano_LLM_code`
- **`AGENTS.md`** (sibling): project rules for the CLI
- **`PLAN-JSON-MODE.md`** (sibling, authoritative): NDJSON event spec — consult before changing any event handling in `index.cjs` `send_prompt` or `usePharStream.ts`

Read `docs/MOCKUP-TESTS.md` before any change to the mock or backend resolution.
Read `docs/CICD.md` before any change to packaging, release, or version handling.
