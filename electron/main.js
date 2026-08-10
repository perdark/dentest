"use strict";

/**
 * Desktop wrapper for the clinic app.
 *
 * The staff double-click one icon and get a window. Behind it this starts the
 * Next.js standalone server on 127.0.0.1 using Electron's own bundled Node
 * (ELECTRON_RUN_AS_NODE), so the laptop needs no Node install and nothing is
 * exposed to the network.
 *
 * All user-facing text is Arabic — nobody at the clinic reads English stack
 * traces, so failures have to explain themselves in plain terms.
 */

const { app, BrowserWindow, dialog, shell, Menu } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");

const isDev = !app.isPackaged;
const appRoot = isDev
  ? path.join(__dirname, "..", "build", "app")
  : path.join(process.resourcesPath, "app", "server");

let serverProcess = null;
let mainWindow = null;
let serverPort = 0;
let shuttingDown = false;

// ── helpers ─────────────────────────────────────────────────────────────────

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(port, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (shuttingDown) return reject(new Error("shutting down"));
      const req = http.get(
        { host: "127.0.0.1", port, path: "/login", timeout: 2000 },
        (res) => {
          res.resume();
          resolve();
        },
      );
      req.on("error", retry);
      req.on("timeout", () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() > deadline) {
        reject(new Error("لم يبدأ النظام خلال الوقت المتوقع."));
      } else {
        setTimeout(attempt, 250);
      }
    };
    attempt();
  });
}

function fatal(title, detail) {
  dialog.showMessageBoxSync({
    type: "error",
    title: "دِنتِست",
    message: title,
    detail,
    buttons: ["إغلاق"],
    defaultId: 0,
  });
  app.exit(1);
}

// ── server lifecycle ────────────────────────────────────────────────────────

async function startServer() {
  const serverJs = path.join(appRoot, "server.js");
  if (!fs.existsSync(serverJs)) {
    fatal(
      "ملفات البرنامج غير مكتملة",
      `لم يتم العثور على:\n${serverJs}\n\nأعد تثبيت البرنامج.`,
    );
    return;
  }

  serverPort = await freePort();

  // The database and backups live in the user's app-data folder, never beside
  // the program: Program Files is read-only and is replaced on every update.
  const dataDir = app.getPath("userData");
  fs.mkdirSync(dataDir, { recursive: true });

  // Dependencies ship as "vendor" rather than "node_modules", because
  // electron-builder strips any folder with that name from the package. Point
  // Node's resolver at it so require() behaves normally. [packaging]
  const vendor = path.join(appRoot, "vendor");
  const nodePath = [vendor, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);

  serverProcess = spawn(process.execPath, [serverJs], {
    cwd: appRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      NODE_PATH: nodePath,
      HOSTNAME: "127.0.0.1",
      PORT: String(serverPort),
      DENTEST_DATA_DIR: dataDir,
      DENTEST_MIGRATIONS_DIR: path.join(appRoot, "drizzle"),
      DENTEST_QUIET: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderrTail = "";
  serverProcess.stderr.on("data", (chunk) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-4000);
    if (isDev) process.stderr.write(chunk);
  });
  if (isDev) serverProcess.stdout.on("data", (c) => process.stdout.write(c));

  serverProcess.on("exit", (code) => {
    if (shuttingDown) return;
    fatal(
      "توقّف النظام بشكل غير متوقّع",
      `رمز الخروج: ${code}\n\n${stderrTail || "لا توجد تفاصيل إضافية."}`,
    );
  });

  await waitForServer(serverPort);
}

function stopServer() {
  shuttingDown = true;
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    serverProcess = null;
  }
}

// ── window ──────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 600,
    show: false,
    backgroundColor: "#ffffff",
    title: "دِنتِست — نظام العيادة",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/dashboard`);

  // Anything that is not our own local server opens in the system browser —
  // the app window must never become a general-purpose browser.
  const isOurs = (url) => url.startsWith(`http://127.0.0.1:${serverPort}`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isOurs(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e, url) => {
    if (!isOurs(url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function buildMenu() {
  // A minimal Arabic menu. The default Electron menu is English and full of
  // developer entries that would only confuse clinic staff.
  const template = [
    {
      label: "ملف",
      submenu: [
        {
          label: "تحديث الصفحة",
          accelerator: "F5",
          click: () => mainWindow && mainWindow.reload(),
        },
        { type: "separator" },
        { label: "خروج", role: "quit" },
      ],
    },
    {
      label: "تحرير",
      submenu: [
        { label: "تراجع", role: "undo" },
        { label: "إعادة", role: "redo" },
        { type: "separator" },
        { label: "قص", role: "cut" },
        { label: "نسخ", role: "copy" },
        { label: "لصق", role: "paste" },
        { label: "تحديد الكل", role: "selectAll" },
      ],
    },
    {
      label: "عرض",
      submenu: [
        { label: "تكبير", role: "zoomIn" },
        { label: "تصغير", role: "zoomOut" },
        { label: "الحجم الأصلي", role: "resetZoom" },
        { type: "separator" },
        { label: "ملء الشاشة", role: "togglefullscreen" },
      ],
    },
    {
      label: "مساعدة",
      submenu: [
        {
          label: "أين تُحفظ بيانات العيادة؟",
          click: () => {
            dialog.showMessageBox({
              type: "info",
              title: "مكان البيانات",
              message: "قاعدة بيانات العيادة والنسخ الاحتياطية محفوظة هنا:",
              detail: `${app.getPath("userData")}\n\nانسخ هذا المجلد إلى فلاش USB أسبوعياً على الأقل.`,
              buttons: ["فتح المجلد", "حسناً"],
              defaultId: 0,
            }).then(({ response }) => {
              if (response === 0) shell.openPath(app.getPath("userData"));
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── boot ────────────────────────────────────────────────────────────────────

// Two copies of the app would mean two servers writing one SQLite file.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      buildMenu();
      await startServer();
      createWindow();
    } catch (err) {
      fatal("تعذّر تشغيل النظام", String((err && err.message) || err));
    }
  });

  app.on("window-all-closed", () => {
    stopServer();
    app.quit();
  });

  app.on("before-quit", stopServer);
  process.on("exit", stopServer);
}
