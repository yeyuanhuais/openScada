const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const { spawn } = require("child_process");

const EXECUTABLE_NAME = "scada.develop.exe";

const extractVersionFromPath = (targetPath) => {
  const segments = targetPath.split(path.sep);
  for (const segment of segments) {
    const match = segment.match(/v?(\d+\.\d+\.\d+\.\d+)/i);
    if (match) {
      return match[1];
    }
  }
  return null;
};

const groupFromVersion = (version) => {
  if (!version) {
    return "其他";
  }
  const parts = version.split(".");
  if (parts.length < 2) {
    return "其他";
  }
  return `${parts[0]}.${parts[1]}`;
};

const findExecutableInDir = async (rootDir) => {
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (error) {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isFile()) {
        if (entry.name.toLowerCase() === EXECUTABLE_NAME) {
          return entryPath;
        }
      } else if (entry.isDirectory()) {
        stack.push(entryPath);
      }
    }
  }
  return null;
};

const scanRoot = async (rootDir) => {
  const groups = new Map();
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const entryPath = path.join(rootDir, entry.name);
    const exePath = await findExecutableInDir(entryPath);
    if (!exePath) {
      continue;
    }
    const version = extractVersionFromPath(exePath) || extractVersionFromPath(entryPath);
    const group = groupFromVersion(version);
    const label = version || entry.name;
    const item = {
      label,
      version,
      group,
      exePath
    };
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group).push(item);
  }

  const sortedGroups = Array.from(groups.entries())
    .map(([group, items]) => ({
      group,
      items: items.sort((a, b) => a.label.localeCompare(b.label, "zh-CN"))
    }))
    .sort((a, b) => a.group.localeCompare(b.group, "zh-CN"));

  return sortedGroups;
};

const createWindow = () => {
  const win = new BrowserWindow({
    width: 720,
    height: 520,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  win.setMenuBarVisibility(false);
  win.loadFile("index.html");
};

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("select-root", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle("default-root", async () => process.cwd());

ipcMain.handle("scan-root", async (_event, rootDir) => {
  const targetRoot = rootDir || process.cwd();
  return scanRoot(targetRoot);
});

ipcMain.handle("launch-exe", async (_event, exePath) => {
  if (!exePath) {
    return false;
  }
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", exePath], {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      }).unref();
    } else {
      spawn(exePath, [], {
        detached: true,
        stdio: "ignore"
      }).unref();
    }
    return true;
  } catch (error) {
    return false;
  }
});
