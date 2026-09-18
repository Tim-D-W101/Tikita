/*
 * Tikita desktop — a window onto the hosted app.
 *
 * The register itself is not bundled here. This shell opens the deployed
 * site, so anything changed and pushed to the repository is on this PC the
 * next time the window is opened: no reinstall, no update server, no
 * signing. The web app's own service worker keeps a copy of itself, so the
 * PC still opens when the office loses its connection.
 *
 * The shell only needs rebuilding when this file changes, which is rare.
 */
'use strict';

const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const DEFAULT_URL = 'https://tim-d-w101.github.io/tikita/';

const CONFIG_FILE = () => path.join(app.getPath('userData'), 'config.json');
const WINDOW_FILE = () => path.join(app.getPath('userData'), 'window.json');

let win = null;

// ── settings ─────────────────────────────────────────────

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return fallback;
  }
}

function writeJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
  } catch (err) {
    console.error('Could not write ' + file, err);
  }
}

/*
 * The address can be overridden without rebuilding: an environment variable
 * wins, then whatever was typed into the setup screen, then the default.
 */
function appUrl() {
  const fromEnv = (process.env.TIKITA_URL || '').trim();
  if (fromEnv) return fromEnv;
  const saved = readJson(CONFIG_FILE(), {});
  return (saved && typeof saved.url === 'string' && saved.url.trim()) || DEFAULT_URL;
}

function setAppUrl(url) {
  const config = readJson(CONFIG_FILE(), {});
  config.url = url;
  writeJson(CONFIG_FILE(), config);
}

function sameSite(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch (err) {
    return false;
  }
}

// ── window ───────────────────────────────────────────────

function savedBounds() {
  const saved = readJson(WINDOW_FILE(), null);
  if (!saved || typeof saved.width !== 'number' || typeof saved.height !== 'number') return null;
  return saved;
}

function rememberBounds() {
  if (!win || win.isDestroyed() || win.isMinimized()) return;
  const bounds = win.getNormalBounds();
  writeJson(WINDOW_FILE(), {
    x: bounds.x, y: bounds.y,
    width: bounds.width, height: bounds.height,
    maximized: win.isMaximized()
  });
}

function createWindow() {
  const saved = savedBounds();

  win = new BrowserWindow({
    x: saved ? saved.x : undefined,
    y: saved ? saved.y : undefined,
    width: saved ? saved.width : 1280,
    height: saved ? saved.height : 860,
    minWidth: 480,
    minHeight: 520,
    title: 'Tikita',
    backgroundColor: '#f4f6f7',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  if (saved && saved.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());

  // Nothing in this app needs the camera, the microphone or a location.
  win.webContents.session.setPermissionRequestHandler((wc, permission, callback) => callback(false));

  // Links out of the app open in the real browser, never in this window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://') || sameSite(url, appUrl())) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });

  // An address that cannot be reached at all — usually a wrong URL, or a
  // first launch with no connection — lands on the setup screen instead of
  // Chromium's error page.
  win.webContents.on('did-fail-load', (event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* aborted, e.g. a redirect */) return;
    showSetup(description || ('Error ' + code));
  });

  ['resize', 'move'].forEach((e) => win.on(e, rememberBounds));
  win.on('close', rememberBounds);
  win.on('closed', () => { win = null; });

  load();
}

function load() {
  win.loadURL(appUrl());
}

function showSetup(reason) {
  if (!win || win.isDestroyed()) return;
  win.loadFile(path.join(__dirname, 'setup.html'), {
    query: { url: appUrl(), reason: reason || '' }
  });
}

// ── requests from the setup screen ───────────────────────

ipcMain.handle('tikita:get-url', () => appUrl());

ipcMain.handle('tikita:set-url', (event, url) => {
  const clean = String(url || '').trim();
  if (!/^https?:\/\/.+/i.test(clean)) return { ok: false, message: 'That does not look like a web address.' };
  setAppUrl(clean);
  load();
  return { ok: true };
});

ipcMain.handle('tikita:retry', () => { load(); });

// ── menu ─────────────────────────────────────────────────

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: '&File',
      submenu: [
        {
          // The app updates itself on load, so this is also "get my latest changes".
          label: 'Reload — picks up the latest changes',
          accelerator: 'CmdOrCtrl+R',
          click: () => { if (win) load(); }
        },
        {
          label: 'Reload, ignoring the saved copy',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => { if (win) win.webContents.reloadIgnoringCache(); }
        },
        { type: 'separator' },
        { label: 'Change app address…', click: () => showSetup('') },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Tikita' }
      ]
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: '&View',
      submenu: [
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: '&Help',
      submenu: [
        {
          label: 'About Tikita',
          click: () => {
            dialog.showMessageBox(win, {
              type: 'info',
              title: 'About Tikita',
              message: 'Tikita — worker attendance',
              detail:
                'Desktop shell ' + app.getVersion() + '\n' +
                'Electron ' + process.versions.electron + '\n\n' +
                'Showing: ' + appUrl() + '\n\n' +
                'The register updates itself: reopening this window, or ' +
                'File → Reload, takes whatever was last published.',
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ]));
}

// ── start ────────────────────────────────────────────────

/*
 * One window only. This PC holds the records, and two windows editing the
 * same browser storage is a good way to lose a day's marks.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    buildMenu();
    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
