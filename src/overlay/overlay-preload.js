'use strict';

// overlay-preload.js — exposes a minimal bridge between main process and overlay renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('circleAI', {
    // Main → renderer: initialise with snapshot path
    onInit: (cb) => ipcRenderer.on('init', (_e, data) => cb(data)),

    // Renderer → main: user finished drawing
    sendRegionSelected: (payload) => ipcRenderer.send('region-selected', payload),

    // Renderer → main: user pressed ESC
    sendCancelled: () => ipcRenderer.send('overlay-cancelled'),
});
