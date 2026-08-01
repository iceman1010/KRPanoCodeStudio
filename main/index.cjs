const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
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
let isDev = false;

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
    let out = "";
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.on("close", (code) => {
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
    child.on("error", reject);
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

// Run `--update` (no --json). Streams stdout lines to renderer as update-progress.
function runSelfUpdate() {
  const { cmd, prefixArgs } = resolveBackend();
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [...prefixArgs, "--update"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => {
      const text = d.toString();
      out += text;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("update-progress", { text });
      }
    });
    child.stderr.on("data", (d) => { out += d.toString(); });
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`update exited ${code}: ${out}`));
    });
    child.on("error", reject);
  });
}

// Silent startup check: compare installed vs latest; self-update if stale.
async function checkForUpdatesSilently() {
  // Skip in dev mode (mock backend has fake version) or if explicitly disabled
  if (isDev || process.env.KRPANOCODE_DEV === "1" || process.env.KRPANOCODE_DEV_MOCK) return;
  try {
    const current = await getPharVersion();
    const latestTag = await getLatestReleaseTag();
    const latest = latestTag.replace(/^v/, "");
    if (latest === current) {
      console.log(`[update] up to date (${current})`);
      return;
    }
    console.log(`[update] ${current} → ${latest}, running --update...`);
    await runSelfUpdate();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-notification", {
        ok: true,
        oldVersion: current,
        newVersion: latest,
      });
    }
  } catch (err) {
    console.log("[update] check failed:", String(err));
  }
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
    const php = phpPath();
    if (!fs.existsSync(php)) {
      console.log(`[backend] PHP not found at ${php}, falling back to mock`);
      const mockPath = path.join(__dirname, "mock", "krpanocode-mock");
      return { cmd: mockPath, prefixArgs: [] };
    }
    return { cmd: php, prefixArgs: [phar] };
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

    const sendError = (msg) => {
      console.error("[spawn] error:", msg);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("phar-event", { type: "error", message: msg });
        mainWindow.webContents.send("phar-event", { type: "__stream_end__" });
      }
    };

    // Stream stdout NDJSON lines to renderer
    let buffer = "";
    child.stdout.on("data", (chunk) => {
      firstDataReceived = true;
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const evt = JSON.parse(trimmed);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("phar-event", evt);
          }
        } catch {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("phar-event", { type: "stderr", text: trimmed });
          }
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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("phar-event", { type: "__stream_end__" });
      }
    });

    // If spawn itself fails (command not found, etc.)
    child.on("error", (err) => {
      console.error("[spawn] child error:", String(err));
      if (!firstDataReceived) {
        reject(String(err));
      } else {
        sendError(`Process error: ${String(err)}`);
      }
    });

    // Handle exit codes — non-zero means failure
    child.on("exit", (code, signal) => {
      console.log(`[spawn] exited code=${code} signal=${signal}`);
      if (code !== 0 && code !== null) {
        const stderrTail = stderrBuffer.trim().slice(-500);
        const msg = stderrTail
          ? `PHAR exited with code ${code}: ${stderrTail}`
          : `PHAR exited with code ${code}`;
        if (!firstDataReceived) {
          // Never produced any output — likely a startup crash
          reject(msg);
        } else {
          sendError(msg);
        }
      }
    });

    resolve();
  });
}

function killCurrentChild() {
  if (currentChild) {
    try { currentChild.kill("SIGTERM"); } catch {}
    currentChild = null;
    currentStdin = null;
  }
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
    return `http://127.0.0.1:${port}/`;
  } catch (err) {
    return Promise.reject(String(err));
  }
});

ipcMain.handle("send_prompt", async (event, prompt, clarify) => {
  try {
    if (!tourFolder) return Promise.reject("no tour open");
    killCurrentChild();
    const tourStr = String(tourFolder);
    // --yes = auto-confirm keep changes. The UI implements its own Keep/Undo
    // via the separate --restore command, so the PHAR must never block on
    // the confirmation prompt.
    const args = ["--json", "--yes"];
    if (clarify) args.push("--clarify");
    args.push("-p", prompt, "-f", tourStr);
    await spawnPhar(args);
    return;
  } catch (err) {
    return Promise.reject(String(err));
  }
});

ipcMain.handle("clarify_answer", async (event, answer) => {
  if (!currentStdin) return Promise.reject("no active PHAR process");
  return new Promise((resolve, reject) => {
    currentStdin.write(answer + "\n", (err) => {
      if (err) reject(String(err));
      else resolve();
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
            resolve(v.models);
            child.kill();
            return;
          }
        } catch {}
      }
    });
    child.on("error", (err) => reject(String(err)));
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
    let buffer = "";
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
            resolve(!!v.ok);
            child.kill();
            return;
          }
        } catch {}
      }
    });
    child.on("error", (err) => reject(String(err)));
  });
});

ipcMain.handle("phar_version", async () => {
  try {
    return await getPharVersion();
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

ipcMain.handle("self_update", async () => {
  try {
    return await runSelfUpdate();
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
  checkForUpdatesSilently();
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
