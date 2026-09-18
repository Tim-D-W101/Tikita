/*
 * The only bridge between the page and this shell.
 *
 * The register is loaded from the web, so it is treated as untrusted: all it
 * is told is that it is running on the desktop, which is what it uses to
 * switch on the wide layout and the records editor. The setup screen is a
 * local file, and only that origin is handed the controls that can change
 * which address the shell opens.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tikitaDesktop', {
  shell: true,
  platform: process.platform,
  electron: process.versions.electron
});

if (location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('tikitaSetup', {
    getUrl: () => ipcRenderer.invoke('tikita:get-url'),
    setUrl: (url) => ipcRenderer.invoke('tikita:set-url', url),
    retry: () => ipcRenderer.invoke('tikita:retry')
  });
}
