const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  selectFile: (options) => ipcRenderer.invoke('select-file', options),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  isElectron: true,
})
