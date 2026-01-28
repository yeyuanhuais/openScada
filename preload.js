const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectRoot: () => ipcRenderer.invoke("select-root"),
  defaultRoot: () => ipcRenderer.invoke("default-root"),
  scanRoot: (rootDir) => ipcRenderer.invoke("scan-root", rootDir),
  launchExe: (exePath) => ipcRenderer.invoke("launch-exe", exePath),
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  replaceFirmwareFiles: (payload) => ipcRenderer.invoke("replace-firmware-files", payload)
});
