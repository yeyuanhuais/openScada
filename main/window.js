const { BrowserWindow } = require("electron");
const path = require("path");

const APP_ROOT = path.join(__dirname, "..");

const createMainWindow = () => {
  const win = new BrowserWindow({
    width: 720,
    height: 520,
    icon: path.join(APP_ROOT, "icon.ico"),
    webPreferences: {
      preload: path.join(APP_ROOT, "preload.js"),
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(APP_ROOT, "index.html"));

  return win;
};

module.exports = {
  createMainWindow,
};