const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  exportDb: () => ipcRenderer.invoke('export-db'),
  importDb: () => ipcRenderer.invoke('import-db'),
});
