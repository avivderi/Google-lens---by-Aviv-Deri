'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  checkGnomeExtension: () => ipcRenderer.invoke('check-gnome-extension'),
  installGnomeExtension: () => ipcRenderer.invoke('install-gnome-extension'),
  closeWindow: () => ipcRenderer.send('close-settings-window'),
});
