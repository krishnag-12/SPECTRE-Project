// =============================================================================
// S.P.E.C.T.R.E. Tactical Command Center — Electron Main Process
// =============================================================================

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const { startMockStream } = require('./mock-serial');

const IS_DEV = !app.isPackaged;
const USE_MOCK = process.env.SPECTRE_MOCK === 'true' || IS_DEV;

let mainWindow = null;
let httpServer = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: '#0A0A0A',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '..', 'public', 'favicon.ico'),
  });

  // In dev, load Vite dev server; in production, load built files
  if (IS_DEV) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startBackend() {
  httpServer = http.createServer();

  if (USE_MOCK) {
    console.log('[SPECTRE] Starting in MOCK mode — simulated telemetry active');
    startMockStream(httpServer);
  } else {
    // Real serial bridge will be loaded here in Phase 8
    console.log('[SPECTRE] Starting in LIVE mode — awaiting serial connection');
    // const { startSerialBridge } = require('./serial-bridge');
    // startSerialBridge(httpServer);
  }

  httpServer.listen(3001, '127.0.0.1', () => {
    console.log('[SPECTRE] Socket.IO backend listening on http://127.0.0.1:3001');
  });
}

// ---- IPC Handlers for window controls ----
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window:close', () => mainWindow?.close());

// ---- App Lifecycle ----
app.whenReady().then(() => {
  startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (httpServer) httpServer.close();
  if (process.platform !== 'darwin') app.quit();
});
