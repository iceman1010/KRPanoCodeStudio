const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { spawn } = require("node:child_process");

// ---- File logger ----
let logStream = null;

function initLogger() {
  const logPath = path.join(app.getPath("userData"), "studio.log");
  logStream = fs.createWriteStream(logPath, { flags: "w" });
  console.log(`[log] writing to ${logPath}`);
  // Also mirror console.log/error to the file
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args) => {
    origLog(...args);
    if (logStream) logStream.write(`[INFO]  ${new Date().toISOString()} ${args.map(String).join(" ")}\n`);
  };
  console.error = (...args) => {
    origErr(...args);
    if (logStream) logStream.write(`[ERROR] ${new Date().toISOString()} ${args.map(String).join(" ")}\n`);
  };
}

function getLogPath() {
  return path.join(app.getPath("userData"), "studio.log");
}

// ---- Globals ----
let mainWindow = null;
let httpServer = null;
let httpPort = 0;
let tourFolder = null;
let watcher = null;
let currentChild = null;
let currentStdin = null;
// Idle-timeout machinery for PHAR streams. The CLI runs with
// default_socket_timeout=-1 (required for --clarify stdin reads), so a stale
// socket after suspend/resume can block forever. We arm an idle timer (default
// 5 minutes, configurable via preferences.cliIdleTimeoutMs) that resets on
// every stdout line; while a clarify event is pending (the PHAR is waiting for
// the user's answer) the timer is paused so we never rush the user. On fire we
// DO NOT kill the child immediately — we pop a modal in the renderer offering
// Abort or Extend, and only act when the user responds. This avoids killing a
// run that's just genuinely slow while still recovering from a truly dead socket.
const DEFAULT_CLI_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
let idleTimer = null;
let inClarify = false;
// Remember how to re-arm the idle timer for the currently-running stream. The
// clarify_answer handler uses this to resume the timer once the user answers
// (it is paused while the PHAR waits for input). Set by spawnPhar/setup/etc.
let currentIdleResetFn = null;
// When a timer fires, we remember how to abort/extend that specific run so the
// `respond_idle_timeout` IPC can act on it. There is at most one outstanding
// idle timeout at a time (a single PHAR child is ever active).
let pendingIdle = null;

function getCliIdleTimeoutMs() {
  try {
    const prefs = loadPreferences();
    const v = Number(prefs.cliIdleTimeoutMs);
    if (Number.isFinite(v) && v >= 1000) return v;
  } catch {}
  return DEFAULT_CLI_IDLE_TIMEOUT_MS;
}

function armIdleTimer(resetFn) {
  // resetFn: called when the timer fires. It must set pendingIdle so the
  // renderer's response can act on this run.
  disarmIdleTimer();
  currentIdleResetFn = resetFn;
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (typeof resetFn === "function") resetFn();
  }, getCliIdleTimeoutMs());
}
function disarmIdleTimer() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  currentIdleResetFn = null;
}

// Fire an idle-timeout notification to the renderer and record how to abort /
// extend this run. `scope` is shown in the modal; `onAbort`/`onExtend` are
// called from the `respond_idle_timeout` IPC handler.
function notifyIdleTimeout(scope, onAbort, onExtend) {
  // If a previous prompt is outstanding (shouldn't happen, but be safe),
  // auto-abort it so the new one takes over cleanly.
  if (pendingIdle && pendingIdle.onAbort) pendingIdle.onAbort();
  pendingIdle = { scope, onAbort, onExtend };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("cli-idle-timeout", { scope });
  } else {
    // No window to ask — default to abort so we never hang forever.
    if (onAbort) onAbort();
    pendingIdle = null;
  }
}

ipcMain.handle("respond_idle_timeout", async (_evt, payload) => {
  const action = payload && payload.action;
  const p = pendingIdle;
  pendingIdle = null;
  if (!p) return;
  if (action === "extend") {
    if (typeof p.onExtend === "function") p.onExtend();
  } else {
    // "abort" or anything else
    if (typeof p.onAbort === "function") p.onAbort();
  }
});
let isDev = false;

// Track the resolved backend signature so we only log it when it actually
// changes — resolveBackend() is called on every spawn and was flooding the
// log with the same "bundled PHP not found" line on every prompt.
let lastBackendKey = null;

// Forward every phar-event both to the renderer (IPC) and to studio.log.
// Logging the full event stream here is what lets us diagnose premature PHAR
// exits during multi-round clarify flows (see __stream_end__ handling).
function emitPharEvent(evt) {
  const serialized = JSON.stringify(evt);
  // Cap log line at 500 chars — diff/reasoning events can be huge.
  console.log(`[phar-event] ${serialized.slice(0, 500)}${serialized.length > 500 ? "…" : ""}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("phar-event", evt);
  }
}

// Clear the current child/stdin globals ONLY if they still point to this
// child. Guards against the race where a new spawn has already replaced them
// before the old child's late exit/error callback fires.
function detachChild(child) {
  if (currentChild === child) {
    currentChild = null;
    currentStdin = null;
  }
}

// ---- PHAR paths (writable copy in userData, bundled copy in resources) ----
const RELEASES_LATEST_URL =
  "https://github.com/iceman1010/krpanocode-releases/releases/latest";

function pharUserPath() {
  return path.join(app.getPath("userData"), "krpanocode.phar");
}
function pharBundledPath() {
  return path.join(process.resourcesPath, "krpanocode.phar");
}
function phpPath() {
  return path.join(process.resourcesPath, "php", "bin", "php");
}

// Copy the bundled PHAR to userData on first run so --update can rewrite it.
// AppImage (Linux) and Program Files (Windows) make resourcesPath read-only.
function ensurePharReady() {
  const userPath = pharUserPath();
  if (fs.existsSync(userPath)) return userPath;
  const bundled = pharBundledPath();
  if (fs.existsSync(bundled)) {
    fs.mkdirSync(path.dirname(userPath), { recursive: true });
    fs.copyFileSync(bundled, userPath);
    console.log(`[phar] seeded ${userPath} from bundle`);
    return userPath;
  }
  // Dev mode fallback: use the PHAR from the source repo if available
  const srcPhar = path.join(
    __dirname,
    "..",
    "..",
    "KRPano_LLM_code",
    "krpanocode.phar"
  );
  if (fs.existsSync(srcPhar)) {
    fs.mkdirSync(path.dirname(userPath), { recursive: true });
    fs.copyFileSync(srcPhar, userPath);
    console.log(`[phar] seeded ${userPath} from source`);
    return userPath;
  }
  throw new Error(
    `PHAR not found: tried bundle at ${bundled} and source at ${srcPhar}`
  );
}

// Query `--json --version` from the active backend; returns e.g. "0.5.4".
function getPharVersion() {
  const { cmd, prefixArgs } = resolveBackend();
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [...prefixArgs, "--json", "--version"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    let out = "";
    const onIdleFire = () => {
      notifyIdleTimeout(
        "version",
        () => {
          settled = true;
          disarmIdleTimer();
          try { child.kill(); } catch {}
          reject("Version check aborted (idle too long)");
        },
        () => armIdleTimer(onIdleFire),
      );
    };
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      disarmIdleTimer();
      if (code !== 0) return reject(`version check exited ${code}`);
      const lines = out.trim().split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
          const evt = JSON.parse(line);
          if (evt.type === "version" && evt.version) return resolve(evt.version);
        } catch {}
      }
      reject("could not parse version output");
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      disarmIdleTimer();
      reject(String(err));
    });
    armIdleTimer(onIdleFire);
  });
}

// Hit GitHub's redirect endpoint for /releases/latest → returns "vX.Y.Z".
function getLatestReleaseTag() {
  return new Promise((resolve, reject) => {
    const req = https.get(
      RELEASES_LATEST_URL,
      { headers: { "User-Agent": "KRPanoCodeStudio" } },
      (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          const m = res.headers.location.match(/\/tag\/(v[\d.]+)$/);
          if (m) return resolve(m[1]);
        }
        reject(new Error(`unexpected status ${res.statusCode}`));
        res.resume();
      }
    );
    req.on("error", reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

// List every release tag from the releases repo (newest first) so the UI can
// offer a downgrade picker. Returns e.g. ["0.6.0", "0.5.11", ...].
function listReleaseVersions() {
  return new Promise((resolve, reject) => {
    const apiUrl =
      "https://api.github.com/repos/iceman1010/krpanocode-releases/releases?per_page=100";
    const req = https.get(
      apiUrl,
      { headers: { "User-Agent": "KRPanoCodeStudio", Accept: "application/vnd.github+json" } },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`unexpected status ${res.statusCode}`));
          res.resume();
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          try {
            const releases = JSON.parse(body);
            if (!Array.isArray(releases)) throw new Error("bad payload");
            const versions = releases
              .map((r) => String(r.tag_name || "").replace(/^v/, ""))
              .filter(Boolean);
            resolve(versions);
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

// Run `--update` (no --json). Streams stdout lines to renderer as update-progress.
// Pass a version to pin it via `--to-version` (downgrade support).
function runSelfUpdate(version) {
  const { cmd, prefixArgs } = resolveBackend();
  const updateArgs = version ? ["--update", "--to-version", version] : ["--update"];
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [...prefixArgs, ...updateArgs], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    let out = "";
    const onIdleFire = () => {
      notifyIdleTimeout(
        "update",
        () => {
          settled = true;
          disarmIdleTimer();
          try { child.kill(); } catch {}
          reject(new Error("Self-update aborted (idle too long)"));
        },
        () => armIdleTimer(onIdleFire),
      );
    };
    child.stdout.on("data", (d) => {
      const text = d.toString();
      out += text;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("update-progress", { text });
      }
    });
    child.stderr.on("data", (d) => { out += d.toString(); });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      disarmIdleTimer();
      if (code === 0) resolve(out);
      else reject(new Error(`update exited ${code}: ${out}`));
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      disarmIdleTimer();
      reject(err);
    });
    armIdleTimer(onIdleFire);
  });
}

// Startup version check for BOTH the app (electron-updater) and the CLI
// (PHAR). Notification-only: it never runs --update and never auto-downloads.
// It coalesces both results and sends a single `update-check-notification`
// event (with app/cli entries only when a newer version exists) so the
// renderer can show one modal that points the user to Preferences.
let startupUpdateNotificationSent = false;
function sendStartupUpdateNotification(result) {
  if (startupUpdateNotificationSent) return;
  if (!(result.app || result.cli)) return;
  startupUpdateNotificationSent = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-check-notification", result);
  }
}

function checkUpdatesOnStartup() {
  // Skip in dev mode (mock backend has fake version) or if explicitly disabled
  if (isDev || process.env.KRPANOCODE_DEV === "1" || process.env.KRPANOCODE_DEV_MOCK) return;
  const result = { app: null, cli: null };
  let pending = 0;
  const finish = () => {
    if (--pending === 0) sendStartupUpdateNotification(result);
  };

  // CLI: compare installed PHAR version vs latest release. No --update.
  pending++;
  (async () => {
    try {
      const current = await getPharVersion();
      const latest = (await getLatestReleaseTag()).replace(/^v/, "");
      if (latest === current) {
        console.log(`[update] CLI up to date (${current})`);
      } else {
        console.log(`[update] CLI ${current} → ${latest} available`);
        result.cli = { currentVersion: current, newVersion: latest };
      }
    } catch (err) {
      console.log("[update] CLI check failed:", String(err));
    }
    finish();
  })();

  // App: electron-updater check only (autoDownload is false). Packaged only.
  if (!app.isPackaged) return;
  pending++;
  autoUpdater.once("update-available", (info) => {
    result.app = { currentVersion: app.getVersion(), newVersion: info.version };
    finish();
  });
  autoUpdater.once("update-not-available", () => finish());
  autoUpdater.once("error", () => finish());
  autoUpdater.checkForUpdates().catch(() => finish());
}

const MIME = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  swf: "application/x-shockwave-flash",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  mp4: "video/mp4",
  webm: "video/webm",
};

function mimeFor(filepath) {
  const ext = path.extname(filepath).slice(1).toLowerCase();
  return MIME[ext] || "application/octet-stream";
}

// ---- HTTP static server ----
function startHttpServer(folder) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        let urlPath = req.url.split("?")[0];
        // Strip leading slash; empty => index.html
        let rel = urlPath.replace(/^\/+/, "");
        if (!rel) rel = "index.html";
        // URL-decode
        rel = decodeURIComponent(rel);
        let full = path.join(folder, rel);
        // Directory → index.html
        try {
          const stat = await fsp.stat(full);
          if (stat.isDirectory()) full = path.join(full, "index.html");
        } catch {}
        // Prevent path traversal
        if (!full.startsWith(path.resolve(folder))) {
          res.writeHead(403);
          return res.end("forbidden");
        }
        try {
          const data = await fsp.readFile(full);
          res.writeHead(200, { "Content-Type": mimeFor(full) });
          return res.end(data);
        } catch {
          res.writeHead(404);
          return res.end("not found");
        }
      } catch (err) {
        res.writeHead(500);
        return res.end(String(err));
      }
    });
    server.listen(0, "127.0.0.1", () => {
      httpPort = server.address().port;
      httpServer = server;
      resolve(httpPort);
    });
    server.on("error", reject);
  });
}

function stopHttpServer() {
  if (httpServer) {
    httpServer.close();
    httpServer = null;
    httpPort = 0;
  }
}

// ---- File watcher (native fs.watch, recursive) ----

function startWatcher(folder) {
  stopWatcher();
  let debounceTimer = null;
  try {
    watcher = fs.watch(folder, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      // Skip noise directories
      if (
        filename.includes("node_modules") ||
        filename.includes(".git") ||
        filename.includes(".krpanocode-backup") ||
        filename.includes(".mock-backup")
      ) {
        return;
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("preview-reload");
        }
      }, 300);
    });
  } catch (err) {
    console.log("[watcher] fs.watch failed:", String(err));
  }
}

function stopWatcher() {
  if (watcher) {
    try { watcher.close(); } catch {}
    watcher = null;
  }
}

// ---- PHAR / mock spawning ----
function findSystemPhp() {
  const candidates = [
    "/usr/bin/php",
    "/usr/local/bin/php",
    "/opt/homebrew/bin/php",
    "/opt/homebrew/opt/php/bin/php",
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

// Log a backend-resolution message only when the backend signature actually
// changes. resolveBackend() runs on every spawn, so without this the log
// fills with the same "bundled PHP not found" line on every prompt.
function logBackendOnce(key, msg) {
  if (key === lastBackendKey) return;
  lastBackendKey = key;
  console.log(msg);
}

function resolveBackend() {
  try {
    if (process.env.KRPANOCODE_DEV_MOCK) {
      return { cmd: process.env.KRPANOCODE_DEV_MOCK, prefixArgs: [] };
    }
    if (process.env.KRPANOCODE_DEV === "1") {
      const mockPath = path.join(__dirname, "mock", "krpanocode-mock");
      return { cmd: mockPath, prefixArgs: [] };
    }
    // prod: php + writable phar copy in userData (so --update can rewrite it)
    const phar = ensurePharReady();
    // PHP ini override: default_socket_timeout (60s by default) applies to
    // piped STDIN, causing fgets(STDIN) in jsonClarify() to return false
    // after one minute even when the pipe is open and the user simply hasn't
    // answered yet. -1 means no timeout. This must be passed as a CLI -d
    // override (NOT via ini_set inside the script) because the timeout is
    // bound when the STDIN stream is first opened, before the script runs.
    // See https://github.com/iceman1010/KRPano_LLM_code commit 48b5a43 context.
    const phpIniArgs = ["-d", "default_socket_timeout=-1"];
    const php = phpPath();
    if (!fs.existsSync(php)) {
      const sysPhp = findSystemPhp();
      if (sysPhp) {
        logBackendOnce(
          `sys:${sysPhp}`,
          `[backend] bundled PHP not found, using system PHP at ${sysPhp}`
        );
        return { cmd: sysPhp, prefixArgs: [...phpIniArgs, phar] };
      }
      logBackendOnce(
        `mock:fallback`,
        `[backend] PHP not found at ${php}, falling back to mock`
      );
      const mockPath = path.join(__dirname, "mock", "krpanocode-mock");
      return { cmd: mockPath, prefixArgs: [] };
    }
    return { cmd: php, prefixArgs: [...phpIniArgs, phar] };
  } catch (err) {
    console.error("[backend] resolveBackend error:", String(err));
    throw err;
  }
}

function spawnPhar(args) {
  return new Promise((resolve, reject) => {
    if (!tourFolder) return reject("no tour open");
    let backend;
    try {
      backend = resolveBackend();
    } catch (err) {
      console.error("[spawn] resolveBackend failed:", String(err));
      return reject(String(err));
    }
    const { cmd, prefixArgs } = backend;
    const fullArgs = [...prefixArgs, ...args];
    console.log(`[spawn] ${cmd} ${fullArgs.join(" ")}`);
    console.log(`[spawn] cwd: ${tourFolder}`);
    const child = spawn(cmd, fullArgs, {
      cwd: tourFolder,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    currentChild = child;
    currentStdin = child.stdin;
    let firstDataReceived = false;
    // Track whether we've already finalized this child so a late callback
    // (e.g. exit firing after stdout-end) doesn't double-emit __stream_end__.
    let finalized = false;

    const finalize = () => {
      if (finalized) return;
      finalized = true;
      detachChild(child);
      disarmIdleTimer();
      emitPharEvent({ type: "__stream_end__" });
    };

    const sendError = (msg) => {
      console.error("[spawn] error:", msg);
      emitPharEvent({ type: "error", message: msg });
      finalize();
    };

    // Stream stdout NDJSON lines to renderer
    let buffer = "";
    let lastErrorEvent = null;

    // Idle-timeout handlers for THIS child. Abort kills + surfaces an error;
    // Extend just re-arms the timer and lets the child keep running. Both clear
    // the pendingIdle slot.
    const onIdleFire = () => {
      notifyIdleTimeout(
        "edit",
        () => {
          // abort
          inClarify = false;
          try { child.kill(); } catch {}
          if (!firstDataReceived) {
            reject("PHAR run aborted (idle too long)");
          } else {
            sendError("PHAR run aborted: no output for the configured idle timeout. Check your network or the CLI.");
          }
        },
        () => {
          // extend — re-arm and continue
          armIdleTimer(onIdleFire);
        },
      );
    };

    child.stdout.on("data", (chunk) => {
      firstDataReceived = true;
      // Reset idle timer on every chunk while not waiting on the user.
      if (!inClarify) armIdleTimer(onIdleFire);
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const evt = JSON.parse(trimmed);
          if (evt.type === "error") {
            lastErrorEvent = evt;
            // Log the full error event (including http_code, http_headers, etc.)
            // to the app log file so the user can dig into cf-ray / retry-after.
            // The logger already prefixes with timestamp; we add a short category.
            console.log("[phar-event:]", JSON.stringify(evt));
          } else if (evt.type === "retry") {
            // Also log retry events with their headers so the activity log is
            // backed by a durable record.
            console.log("[phar-event:]", JSON.stringify(evt));
          }
          if (evt.type === "clarify") {
            // Pause the idle timer while the PHAR waits for user input — we
            // must never rush the user. clarify_answer re-arms it on write ok.
            inClarify = true;
            disarmIdleTimer();
          }
          emitPharEvent(evt);
        } catch {
          emitPharEvent({ type: "stderr", text: trimmed });
        }
      }
    });

    // Capture stderr — previously discarded, causing silent failures
    let stderrBuffer = "";
    child.stderr.on("data", (chunk) => {
      stderrBuffer += chunk.toString();
      console.error("[spawn] stderr:", chunk.toString().trim());
    });

    child.stdout.on("end", () => {
      console.log("[spawn] stdout ended");
      finalize();
    });

    // If spawn itself fails (command not found, etc.)
    child.on("error", (err) => {
      console.error("[spawn] child error:", String(err));
      if (!firstDataReceived) {
        detachChild(child);
        reject(String(err));
      } else {
        sendError(`Process error: ${String(err)}`);
      }
    });

    // Handle exit codes — non-zero means failure
    child.on("exit", (code, signal) => {
      console.log(`[spawn] exited code=${code} signal=${signal}`);
      // Always detach on exit so clarify_answer can't write to a dead stream.
      detachChild(child);
      // Clear any pending idle timeout — the child is gone, so the user's
      // response would be a no-op anyway. Drop the modal's promise silently.
      if (pendingIdle && pendingIdle.scope === "edit") pendingIdle = null;
      if (code !== 0 && code !== null) {
        let msg;
        if (lastErrorEvent && lastErrorEvent.message) {
          msg = lastErrorEvent.message;
        } else {
          const stderrTail = stderrBuffer.trim().slice(-500);
          msg = stderrTail
            ? `PHAR exited with code ${code}: ${stderrTail}`
            : `PHAR exited with code ${code}`;
        }
        if (!firstDataReceived) {
          // Never produced any output — likely a startup crash
          reject(msg);
        } else {
          sendError(msg);
        }
      } else {
        // Clean exit — make sure the renderer sees __stream_end__ even if the
        // PHAR closed stdout without an explicit `done` event (the clarify bug).
        finalize();
      }
    });

    // Arm the idle timer once the child is alive.
    armIdleTimer(onIdleFire);

    resolve();
  });
}

function killCurrentChild() {
  if (currentChild) {
    try { currentChild.kill("SIGTERM"); } catch {}
    currentChild = null;
    currentStdin = null;
  }
  disarmIdleTimer();
  inClarify = false;
}

// ---- IPC handlers ----
ipcMain.handle("open_tour", async (event, folder) => {
  try {
    const resolved = path.resolve(folder);
    const stat = await fsp.stat(resolved);
    if (!stat.isDirectory()) throw "not a directory";
    tourFolder = resolved;
    stopHttpServer();
    stopWatcher();
    const port = await startHttpServer(resolved);
    startWatcher(resolved);
    // Persist this tour in recent tours
    const prefs = loadPreferences();
    const recent = (prefs.recentTours || []).filter(
      (t) => t.folder !== resolved
    );
    recent.unshift({ folder: resolved, openedAt: Date.now() });
    prefs.recentTours = recent.slice(0, 5);
    savePreferences(prefs);
    return `http://127.0.0.1:${port}/`;
  } catch (err) {
    return Promise.reject(String(err));
  }
});

ipcMain.handle("send_prompt", async (event, options) => {
  const { prompt, clarify, model } = options;
  try {
    if (!tourFolder) return Promise.reject("no tour open");
    killCurrentChild();
    const tourStr = String(tourFolder);
    // --yes = auto-confirm keep changes. The UI implements its own Keep/Undo
    // via the separate --restore command, so the PHAR must never block on
    // the confirmation prompt.
    const args = ["--json", "--yes"];
    if (clarify) args.push("--clarify");
    if (model) args.push("-m", model);
    args.push("-p", prompt, "-f", tourStr);
    await spawnPhar(args);
    return;
  } catch (err) {
    return Promise.reject(String(err));
  }
});

ipcMain.handle("clarify_answer", async (event, answer) => {
  const stdin = currentStdin;
  // The PHAR may have exited while the user was typing their answer (the
  // multi-round clarify bug). Guard the write so we never throw
  // ERR_STREAM_DESTROYED — instead surface a readable error to the UI.
  if (!stdin || stdin.destroyed || !stdin.writable) {
    const msg = "The AI stream closed while waiting for your answer. Please retry the prompt.";
    console.error("[clarify_answer] stream not writable:", msg);
    emitPharEvent({ type: "error", message: msg });
    emitPharEvent({ type: "__stream_end__" });
    return Promise.reject(msg);
  }
  return new Promise((resolve, reject) => {
    stdin.write(answer + "\n", (err) => {
      if (err) {
        // Write failed mid-flight — treat the stream as dead and clean up.
        const msg = `Failed to send answer: ${String(err)}`;
        console.error("[clarify_answer] write failed:", msg);
        emitPharEvent({ type: "error", message: msg });
        emitPharEvent({ type: "__stream_end__" });
        reject(msg);
      } else {
        // Resume the idle timer now that the user has answered — a stale
        // socket right after this point should still be recoverable.
        inClarify = false;
        if (currentIdleResetFn) armIdleTimer(currentIdleResetFn);
        resolve();
      }
    });
  });
});

ipcMain.handle("undo", async () => {
  try {
    if (!tourFolder) return Promise.reject("no tour open");
    killCurrentChild();
    const tourStr = String(tourFolder);
    await spawnPhar(["--json", "--restore", "-f", tourStr]);
    return;
  } catch (err) {
    return Promise.reject(String(err));
  }
});

ipcMain.handle("list_models", async () => {
  return new Promise((resolve, reject) => {
    // list_models does not need a tour folder — it hits the proxy directly.
    const { cmd, prefixArgs } = resolveBackend();
    const cwd = tourFolder || app.getPath("userData");
    const child = spawn(cmd, [...prefixArgs, "--json", "--models"], {
      cwd,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buffer = "";
    let settled = false;
    let stderrBuffer = "";
    const onIdleFire = () => {
      notifyIdleTimeout(
        "models",
        () => {
          settled = true;
          disarmIdleTimer();
          try { child.kill(); } catch {}
          reject("Model list aborted (idle too long)");
        },
        () => armIdleTimer(onIdleFire),
      );
    };
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const v = JSON.parse(trimmed);
          if (v.type === "models" && Array.isArray(v.models)) {
            settled = true;
            disarmIdleTimer();
            resolve(v.models);
            child.kill();
            return;
          }
        } catch {}
      }
    });
    // Capture stderr so we can surface a better error message when the PHAR
    // exits with a non-zero code before emitting a models event.
    child.stderr.on("data", (chunk) => {
      stderrBuffer += chunk.toString();
      console.error("[list_models] stderr:", chunk.toString().trim());
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      disarmIdleTimer();
      reject(String(err));
    });
    // Ensure the promise settles if the backend exits without a models event
    // (e.g. no API key configured) — otherwise the renderer would wait forever.
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      disarmIdleTimer();
      // Surface the stderr tail so the user can see WHY it failed (e.g.
      // "API key not found" vs a cryptic exit code).
      const stderrTail = stderrBuffer.trim().slice(-500);
      const msg = stderrTail
        ? `Model list failed (exit code ${code}): ${stderrTail}`
        : `Model list failed (exit code ${code})`;
      reject(msg);
    });
    armIdleTimer(onIdleFire);
  });
});

ipcMain.handle("setup", async (event, key, model, backupKeep) => {
  return new Promise((resolve, reject) => {
    // setup writes ~/.krpanocode/.env; no tour folder needed.
    const { cmd, prefixArgs } = resolveBackend();
    const cwd = tourFolder || app.getPath("userData");
    const args = [...prefixArgs, "--json", "--setup", "--key", key, "--model", model];
    if (backupKeep != null) args.push("--backup-keep", String(backupKeep));
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let settled = false;
    let buffer = "";
    const onIdleFire = () => {
      notifyIdleTimeout(
        "setup",
        () => {
          settled = true;
          disarmIdleTimer();
          try { child.kill(); } catch {}
          reject("Setup aborted (idle too long)");
        },
        () => armIdleTimer(onIdleFire),
      );
    };
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const v = JSON.parse(trimmed);
          if (v.type === "setup") {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("phar-event", v);
            }
            settled = true;
            disarmIdleTimer();
            resolve(!!v.ok);
            child.kill();
            return;
          }
        } catch {}
      }
    });
    child.on("error", (err) => {
      settled = true;
      disarmIdleTimer();
      reject(String(err));
    });
    // Ensure the promise settles if the backend exits without a setup event
    // (e.g. invalid key → error event + non-zero exit).
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      disarmIdleTimer();
      reject(`Setup failed (exit code ${code})`);
    });
    armIdleTimer(onIdleFire);
  });
});

ipcMain.handle("phar_version", async () => {
  try {
    return await getPharVersion();
  } catch (err) {
    return Promise.reject(String(err));
  }
});

// Resolve the active backend (PHP binary + PHAR path, or the mock) without
// spawning anything. Lets the Settings modal show the user exactly what is
// running their edits — especially useful after `self_update` to confirm
// which PHAR got replaced.
ipcMain.handle("backend_info", async () => {
  try {
    const { cmd, prefixArgs } = resolveBackend();
    // pharPath = the first .phar in prefixArgs, or null for mock backends.
    const pharPath = prefixArgs.find((a) => a.endsWith(".phar")) ?? null;
    return {
      cmd,            // interpreter or mock script (e.g. /usr/bin/php)
      prefixArgs,     // argv after cmd (e.g. ["/path/to/krpanocode.phar"])
      pharPath,       // resolved .phar path or null
      isMock: pharPath === null,
    };
  } catch (err) {
    return Promise.reject(String(err));
  }
});

ipcMain.handle("latest_release", async () => {
  try {
    return await getLatestReleaseTag();
  } catch (err) {
    return Promise.reject(String(err));
  }
});

ipcMain.handle("list_release_versions", async () => {
  try {
    return await listReleaseVersions();
  } catch (err) {
    return Promise.reject(String(err));
  }
});

ipcMain.handle("self_update", async (_evt, version) => {
  try {
    return await runSelfUpdate(version);
  } catch (err) {
    return Promise.reject(String(err));
  }
});

ipcMain.handle("open_log", async () => {
  const logPath = getLogPath();
  // Show the file in the OS file manager
  shell.showItemInFolder(logPath);
  return logPath;
});

ipcMain.handle("get_log_path", async () => {
  return getLogPath();
});

ipcMain.handle("stop_edit", async () => {
  killCurrentChild();
});

ipcMain.handle("get_preview_url", async () => {
  if (!httpPort) return "";
  return `http://127.0.0.1:${httpPort}/`;
});

ipcMain.handle("pick_folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("open_external", async (event, url) => {
  await shell.openExternal(url);
});

ipcMain.handle("diag_log", async (event, data) => {
  console.log("[diag]", JSON.stringify(data));
});

// ---- User preferences storage ----
const preferencesPath = path.join(app.getPath("userData"), "preferences.json");

function loadPreferences() {
  try {
    if (fs.existsSync(preferencesPath)) {
      const data = fs.readFileSync(preferencesPath, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("[prefs] failed to load:", String(err));
  }
  return {};
}

function savePreferences(prefs) {
  try {
    fs.mkdirSync(path.dirname(preferencesPath), { recursive: true });
    fs.writeFileSync(preferencesPath, JSON.stringify(prefs, null, 2));
  } catch (err) {
    console.error("[prefs] failed to save:", String(err));
  }
}

ipcMain.handle("get_preferences", async () => {
  return loadPreferences();
});

ipcMain.handle("save_preferences", async (event, prefs) => {
  savePreferences(prefs);
  return true;
});

ipcMain.handle("get_preference", async (event, key) => {
  const prefs = loadPreferences();
  return prefs[key] ?? null;
});

ipcMain.handle("set_preference", async (event, key, value) => {
  const prefs = loadPreferences();
  prefs[key] = value;
  savePreferences(prefs);
  return value;
});

// ---- App auto-update ----
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = "info";
// Notification-only: never download in the background during a check. The
// user explicitly triggers the download from Preferences.
autoUpdater.autoDownload = false;

autoUpdater.on("update-available", (info) => {
  log.info("Update available:", info.version);
  mainWindow?.webContents.send("update-available", info);
});

autoUpdater.on("update-not-available", (info) => {
  log.info("No update available, current version:", info.version);
  mainWindow?.webContents.send("update-not-available", info.version);
});

autoUpdater.on("download-progress", (progress) => {
  mainWindow?.webContents.send("update-download-progress", progress);
});

autoUpdater.on("update-downloaded", (info) => {
  log.info("Update downloaded:", info.version);
  mainWindow?.webContents.send("update-downloaded", info);
});

autoUpdater.on("error", (err) => {
  log.error("Update error:", err);
  mainWindow?.webContents.send("update-error", String(err));
});

ipcMain.handle("check_for_updates", async () => {
  if (!app.isPackaged) throw new Error("Updates only available in packaged app");
  return await autoUpdater.checkForUpdates();
});

ipcMain.handle("download_update", async () => {
  if (!app.isPackaged) throw new Error("Updates only available in packaged app");
  autoUpdater.downloadUpdate();
});

ipcMain.handle("install_update", async () => {
  if (!app.isPackaged) throw new Error("Updates only available in packaged app");
  if (process.platform === "linux") {
    await autoUpdater.installPendingUpdateIfAvailable();
  } else {
    autoUpdater.quitAndInstall();
  }
});

ipcMain.handle("get_current_version", async () => {
  return app.getVersion();
});

// ---- Window creation ----
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:1420");
    mainWindow.once("ready-to-show", () => {
      mainWindow.show();
      mainWindow.webContents.openDevTools();
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
    mainWindow.once("ready-to-show", () => mainWindow.show());
  }

  mainWindow.on("closed", () => { mainWindow = null; });
}

// ---- App lifecycle ----
app.whenReady().then(() => {
  isDev = process.argv.includes("--dev");
  initLogger();
  console.log(`[app] starting, dev=${isDev}, version=${app.getVersion()}`);
  createWindow();
  checkUpdatesOnStartup();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopHttpServer();
  stopWatcher();
  killCurrentChild();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopHttpServer();
  stopWatcher();
  killCurrentChild();
});
