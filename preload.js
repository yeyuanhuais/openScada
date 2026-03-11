const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // 持久化存储
  storeGetAll: () => ipcRenderer.invoke("store-get-all"),
  storeSet: (key, value) => ipcRenderer.invoke("store-set", key, value),

  // 版本浏览
  defaultRoot: () => ipcRenderer.invoke("default-root"),
  scanRoot: rootDir => ipcRenderer.invoke("scan-root", rootDir),
  selectRoot: currentValue => ipcRenderer.invoke("select-root", currentValue),
  launchExe: exePath => ipcRenderer.invoke("launch-exe", exePath),

  // 文件替换
  selectFolder: currentValue => ipcRenderer.invoke("select-folder", currentValue),
  replaceFirmwareFiles: payload => ipcRenderer.invoke("replace-firmware-files", payload),

  // 实时日志监听（文件替换）
  onReplaceLog: callback => {
    const handler = (_event, msg) => callback(msg);
    ipcRenderer.on("replace-log", handler);
    return () => ipcRenderer.removeListener("replace-log", handler);
  },

  // 组态解压
  selectExtractFolder: currentValue => ipcRenderer.invoke("select-extract-folder", currentValue),
  listZipFiles: folderPath => ipcRenderer.invoke("list-zip-files", folderPath),
  extractZip: payload => ipcRenderer.invoke("extract-zip", payload),

  // 实时日志监听（组态解压）
  onExtractLog: callback => {
    const handler = (_event, msg) => callback(msg);
    ipcRenderer.on("extract-log", handler);
    return () => ipcRenderer.removeListener("extract-log", handler);
  },
});