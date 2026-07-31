const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("node:path");
const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { spawn } = require("node:child_process");
const chokidar = require("chokidar");

// ---- Globals ----
let mainWindow = null;
let httpServer = null;
let httpPort = 0;
let tourFolder = null;
let watcher = null;
let currentChild = null;
let currentStdin = null;
let isDev = false;

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

// ---- File watcher ----
function startWatcher(folder) {
  stopWatcher();
  let debounceTimer = null;
  watcher = chokidar.watch(folder, {
    ignored: (p) => p.includes("node_modules") || p.includes(".git"),
    ignoreInitial: true,
    persistent: true,
  });
  watcher.on("all", () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("preview-reload");
      }
    }, 300);
  });
}

function stopWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}

// ---- PHAR / mock spawning ----
function resolveBackend() {
  if (process.env.KRPANOCODE_DEV_MOCK) {
    return { cmd: process.env.KRPANOCODE_DEV_MOCK, prefixArgs: [] };
  }
  if (process.env.KRPANOCODE_DEV === "1") {
    const mockPath = path.join(__dirname, "mock", "krpanocode-mock");
    return { cmd: mockPath, prefixArgs: [] };
  }
  // prod: php + phar bundled in resources
  const phpPath = path.join(process.resourcesPath, "php", "bin", "php");
  const pharPath = path.join(process.resourcesPath, "krpanocode.phar");
  return { cmd: phpPath, prefixArgs: [pharPath] };
}

function spawnPhar(args) {
  return new Promise((resolve, reject) => {
    if (!tourFolder) return reject("no tour open");
    const { cmd, prefixArgs } = resolveBackend();
    const fullArgs = [...prefixArgs, ...args];
    const child = spawn(cmd, fullArgs, {
      cwd: tourFolder,
      env: { ...process.env, KRPANOCODE_TOUR: tourFolder },
      stdio: ["pipe", "pipe", "pipe"],
    });
    currentChild = child;
    currentStdin = child.stdin;

    // Stream stdout NDJSON lines to renderer
    let buffer = "";
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep partial line
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
    child.stdout.on("end", () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("phar-event", { type: "__stream_end__" });
      }
    });
    child.on("error", (err) => reject(String(err)));
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
    const args = ["--json"];
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
    if (!tourFolder) return reject("no tour open");
    const { cmd, prefixArgs } = resolveBackend();
    const child = spawn(cmd, [...prefixArgs, "--json", "--models"], {
      cwd: tourFolder,
      env: { ...process.env, KRPANOCODE_TOUR: tourFolder },
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

ipcMain.handle("setup", async (event, key, model) => {
  return new Promise((resolve, reject) => {
    if (!tourFolder) return reject("no tour open");
    const { cmd, prefixArgs } = resolveBackend();
    const child = spawn(cmd, [...prefixArgs, "--json", "--setup", "--key", key, "--model", model], {
      cwd: tourFolder,
      env: { ...process.env, KRPANOCODE_TOUR: tourFolder },
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
  createWindow();
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
