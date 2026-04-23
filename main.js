const { app, BrowserWindow } = require("electron");

const { registerIpcHandlers } = require("./main/ipc");
const { getStore, initializeStore } = require("./main/store");
const { createMainWindow } = require("./main/window");

registerIpcHandlers({ getStore });

app.whenReady().then(async () => {
  await initializeStore();

  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
