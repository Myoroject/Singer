'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('singer', { call: (method, ...args) => ipcRenderer.invoke('api', method, args) });
