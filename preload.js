const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("scadaApi", {
  selectRoot: () => ipcRenderer.invoke("select-root"),
  defaultRoot: () => ipcRenderer.invoke("default-root"),
  scanRoot: (rootDir) => ipcRenderer.invoke("scan-root", rootDir),
  launchExe: (exePath) => ipcRenderer.invoke("launch-exe", exePath)
});
