// =============================================================================
// S.P.E.C.T.R.E. TCC — Context Bridge (Preload)
// Exposes safe IPC channels to the renderer process
// =============================================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('spectre', {
  // Window controls for frameless titlebar
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },

  // Serial port management (Phase 8)
  serial: {
    connect: (port) => ipcRenderer.invoke('serial:connect', port),
    disconnect: () => ipcRenderer.invoke('serial:disconnect'),
    getStatus: () => ipcRenderer.invoke('serial:status'),
    listPorts: () => ipcRenderer.invoke('serial:list'),
  },

  // Platform info
  platform: process.platform,
});
