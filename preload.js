const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("scadaApi", {
  selectRoot: () => ipcRenderer.invoke("select-root"),
  scanRoot: (rootDir) => ipcRenderer.invoke("scan-root", rootDir),
  launchExe: (exePath) => ipcRenderer.invoke("launch-exe", exePath)
});
