'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { createApi, todayISO } = require('./src/api');

let statePath;

const api = createApi({
  name: 'desktop',
  loadState: () => { try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch (e) { return null; } },
  saveState: s => fs.writeFileSync(statePath, JSON.stringify(s)),
  readSop: () => fs.readFileSync(path.join(__dirname, 'docs', 'SOP.md'), 'utf8'),
  exportCsv: (filename, csv) => {
    const dir = path.join(app.getPath('documents'), 'SINGER-Credit-Exports');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, filename);
    fs.writeFileSync(file, csv);
    return { saved: file };
  }
});

ipcMain.handle('api', (_e, method, args) => api.call(method, args));

app.whenReady().then(() => {
  statePath = path.join(app.getPath('userData'), 'singer-credit-state.json');
  if (process.env.SINGER_FRESH) { try { fs.unlinkSync(statePath); } catch (e) { /* nothing to remove */ } }
  api.init();
  const win = new BrowserWindow({
    width: 1440, height: 900, title: 'SINGER CREDIT - Loan Management',
    backgroundColor: '#f6f7f9', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
});
app.on('window-all-closed', () => app.quit());
