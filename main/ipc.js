const { app, dialog, ipcMain } = require("electron");
const fs = require("fs/promises");
const path = require("path");

const { scanRoot } = require("./services/version-service");
const {
  deleteVersionFolder,
  extractZip,
  launchExe,
  listZipFiles,
  replaceFirmwareFiles,
} = require("./services/file-service");

const openDirDialog = async defaultPath => {
  const options = { properties: ["openDirectory"] };
  if (defaultPath) {
    try {
      const stat = await fs.stat(defaultPath);
      options.defaultPath = stat.isDirectory() ? defaultPath : path.dirname(defaultPath);
    } catch {
      // 路径无效时不设置初始目录
    }
  }

  const result = await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
};

const registerIpcHandlers = ({ getStore }) => {
  ipcMain.handle("store-get-all", () => {
    const store = getStore();
    return {
      rootPath: store.get("rootPath"),
      sourceFolder: store.get("sourceFolder"),
      version: store.get("version"),
      extractFolder: store.get("extractFolder"),
      versionSearchKeyword: store.get("versionSearchKeyword"),
      versionSelectedPrefix: store.get("versionSelectedPrefix"),
      versionSelectedGroup: store.get("versionSelectedGroup"),
      versionFiltersCollapsed: store.get("versionFiltersCollapsed"),
    };
  });

  ipcMain.handle("store-set", (_event, key, value) => {
    const store = getStore();
    store.set(key, value);
  });

  ipcMain.handle("select-root", async (_event, currentValue) => {
    const store = getStore();
    const selected = await openDirDialog(currentValue || store.get("rootPath"));
    if (selected) store.set("rootPath", selected);
    return selected;
  });

  ipcMain.handle("select-folder", async (_event, currentValue) => {
    const store = getStore();
    const selected = await openDirDialog(currentValue || store.get("sourceFolder"));
    if (selected) store.set("sourceFolder", selected);
    return selected;
  });

  ipcMain.handle("select-extract-folder", async (_event, currentValue) => {
    const store = getStore();
    const selected = await openDirDialog(currentValue || store.get("extractFolder"));
    if (selected) store.set("extractFolder", selected);
    return selected;
  });

  ipcMain.handle("default-root", async () => {
    if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
    return path.dirname(app.getPath("exe"));
  });

  ipcMain.handle("get-app-version", () => app.getVersion());

  ipcMain.handle("scan-root", async (_event, rootDir) => scanRoot(rootDir || process.cwd()));

  ipcMain.handle("launch-exe", async (_event, exePath) => launchExe(exePath));

  ipcMain.handle("delete-version-folder", async (_event, folderPath) => deleteVersionFolder(folderPath));

  ipcMain.handle("replace-firmware-files", async (event, payload) => {
    const store = getStore();
    return replaceFirmwareFiles(event, payload, store);
  });

  ipcMain.handle("list-zip-files", async (_event, folderPath) => listZipFiles(folderPath));

  ipcMain.handle("extract-zip", async (event, payload) => extractZip(event, payload));
};

module.exports = {
  registerIpcHandlers,
};