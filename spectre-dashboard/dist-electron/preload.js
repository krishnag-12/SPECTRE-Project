"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('spectre', {
    window: {
        minimize: () => ipcRenderer.send('window:minimize'),
        maximize: () => ipcRenderer.send('window:maximize'),
        close: () => ipcRenderer.send('window:close'),
    },
    serial: {
        connect: (port) => ipcRenderer.invoke('serial:connect', port),
        disconnect: () => ipcRenderer.invoke('serial:disconnect'),
        getStatus: () => ipcRenderer.invoke('serial:status'),
        listPorts: () => ipcRenderer.invoke('serial:list'),
    },
    platform: process.platform,
});
