const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const { spawn } = require("child_process");

const EXECUTABLE_NAME = "scada.develop.exe";
const PREFIXES = ["Scada", "Neutral", "JSCC", "Debug"];
const DEFAULT_SOURCE_FOLDER =
  "\\\\192.168.11.3\\xxx\\xxx\\xxx\\3-固件打包\\v3.38\\feature\\HMIS-10657-趋势图改原生\\3.38.10657.22";
const DEFAULT_VERSION = "3.39.10657.1";
const REPLACE_FOLDERS = [
  "cboxs\\New",
  "cboxs\\Old",
  "hmis\\New",
  "hmis\\Old",
  "iot\\New",
  "iot\\Old",
  "ipc\\New",
  "ipc\\Old"
];
const REPLACE_PATTERNS = [
  { regex: /haiwell_cbox_a40i_.*_new\.iot/i, target: "cboxs\\New" },
  { regex: /HaiwellBoxs.*\.box/i, target: "cboxs\\Old" },
  { regex: /haiwell_hmi_a40i_.*_new\.iot/i, target: "hmis\\New" },
  { regex: /HaiwellHmis.*\.hmi/i, target: "hmis\\Old" },
  { regex: /haiwell_hmi_t507_.*_new\.iot/i, target: "iot\\New" },
  { regex: /HMI.*\.iot/i, target: "iot\\Old" },
  { regex: /haiwell_ipc_.*_new\.iot/i, target: "ipc\\New" },
  { regex: /HaiwellIPC.*\.ipc/i, target: "ipc\\Old" },
  { regex: /Boxs_New_.*\.iot/i, target: "cboxs\\New" },
  { regex: /Boxs_.*\.box/i, target: "cboxs\\Old" },
  { regex: /Hmis_New_.*\.iot/i, target: "hmis\\New" },
  { regex: /Hmis_.*\.box/i, target: "hmis\\Old" },
  { regex: /IOT_New_.*\.iot/i, target: "iot\\New" },
  { regex: /IOT_.*\.iot/i, target: "iot\\Old" },
  { regex: /IPC_New_.*\.iot/i, target: "ipc\\New" },
  { regex: /IPC_.*\.ipc/i, target: "ipc\\Old" }
];

const extractVersionFromPath = targetPath => {
  const segments = targetPath.split(path.sep);
  for (const segment of segments) {
    const match = segment.match(/v?(\d+\.\d+\.\d+\.\d+)/i);
    if (match) {
      return match[1];
    }
  }
  return null;
};

const groupFromVersion = version => {
  if (!version) {
    return "其他";
  }
  const parts = version.split(".");
  if (parts.length < 2) {
    return "其他";
  }
  return `${parts[0]}.${parts[1]}`;
};

const detectPrefix = value => {
  if (!value) {
    return "其他";
  }
  const classType = PREFIXES.join("|");
  const reg = new RegExp("^(" + classType + ")");
  const m = reg.exec(value);
  return m[1] || "其他";
};

const normalizePrefix = prefix => {
  if (!prefix) {
    return null;
  }
  const match = PREFIXES.find(item => item.toLowerCase() === String(prefix).toLowerCase());
  return match || null;
};

const parseTargetVersion = (rawVersion, rawPrefix) => {
  const normalizedPrefix = normalizePrefix(rawPrefix);
  if (!rawVersion) {
    return {
      version: null,
      prefix: normalizedPrefix
    };
  }
  const prefixGroup = PREFIXES.join("|");
  const versionMatch = String(rawVersion).trim().match(new RegExp(`^(?:(${prefixGroup})[\\s-_]*)?v?(\\d+\\.\\d+\\.\\d+\\.\\d+)$`, "i"));
  if (versionMatch) {
    return {
      prefix: normalizePrefix(versionMatch[1]) || normalizedPrefix,
      version: versionMatch[2]
    };
  }
  return {
    version: String(rawVersion).trim(),
    prefix: normalizedPrefix
  };
};

const findExecutableInDir = async rootDir => {
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

const scanRoot = async rootDir => {
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
    const prefix = detectPrefix(`${entry.name}`);
    const label = version || entry.name;
    const item = {
      label,
      version,
      group,
      prefix,
      exePath,
    };
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group).push(item);
  }

  const sortedGroups = Array.from(groups.entries())
    .map(([group, items]) => ({
      group,
      items: items.sort((a, b) => a.label.localeCompare(b.label, "zh-CN")),
    }))
    .sort((a, b) => a.group.localeCompare(b.group, "zh-CN"));

  return sortedGroups;
};

const createWindow = () => {
  const win = new BrowserWindow({
    width: 720,
    height: 520,
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
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
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle("default-root", async () => {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return process.env.PORTABLE_EXECUTABLE_DIR;
  }
  return path.dirname(app.getPath("exe"));
});

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
        windowsHide: true,
      }).unref();
    } else {
      spawn(exePath, [], {
        detached: true,
        stdio: "ignore",
      }).unref();
    }
    return true;
  } catch (error) {
    return false;
  }
});

const ensureFolder = async (folderPath) => {
  await fs.mkdir(folderPath, { recursive: true });
};

const toTargetFolder = (baseFolder, relativeFolder) =>
  path.join(baseFolder, ...relativeFolder.split(/[/\\]/));

ipcMain.handle("replace-firmware-files", async (_event, payload) => {
  const sourceFolder = payload?.sourceFolder?.trim() || DEFAULT_SOURCE_FOLDER;
  const parsedTarget = parseTargetVersion(payload?.version?.trim() || DEFAULT_VERSION, payload?.targetPrefix);
  const version = parsedTarget.version || DEFAULT_VERSION;
  const prefix = parsedTarget.prefix || "Scada";
  const baseFolder = `D:\\sacda组态\\${prefix}-v${version}\\HaiwellDir\\firmware`;
  const logs = [
    `源文件夹: ${sourceFolder}`,
    `目标版本: ${version}`,
    `目标类型: ${prefix}`,
    `目标路径: ${baseFolder}`
  ];
  let copiedFiles = 0;
  let cleanedFiles = 0;
  let matchedFiles = 0;

  try {
    const sourceStat = await fs.stat(sourceFolder);
    if (!sourceStat.isDirectory()) {
      return {
        success: false,
        message: "源文件夹不存在或不是目录。",
        logs
      };
    }
  } catch (error) {
    return {
      success: false,
      message: "无法访问源文件夹。",
      logs: [...logs, error.message]
    };
  }

  try {
    for (const folder of REPLACE_FOLDERS) {
      const targetFolder = toTargetFolder(baseFolder, folder);
      try {
        await ensureFolder(targetFolder);
        const entries = await fs.readdir(targetFolder, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile()) {
            continue;
          }
          const filePath = path.join(targetFolder, entry.name);
          await fs.rm(filePath, { force: true });
          cleanedFiles += 1;
        }
        logs.push(`清理完成: ${targetFolder}`);
      } catch (error) {
        logs.push(`清理失败: ${targetFolder} (${error.message})`);
      }
    }

    const sourceEntries = await fs.readdir(sourceFolder, { withFileTypes: true });
    for (const entry of sourceEntries) {
      if (!entry.isFile()) {
        continue;
      }
      const fileName = entry.name;
      const sourcePath = path.join(sourceFolder, fileName);
      for (const pattern of REPLACE_PATTERNS) {
        if (!pattern.regex.test(fileName)) {
          continue;
        }
        matchedFiles += 1;
        const targetFolder = toTargetFolder(baseFolder, pattern.target);
        try {
          await ensureFolder(targetFolder);
          await fs.copyFile(sourcePath, path.join(targetFolder, fileName));
          copiedFiles += 1;
          logs.push(`复制 ${fileName} -> ${targetFolder}`);
        } catch (error) {
          logs.push(`复制失败 ${fileName} -> ${targetFolder} (${error.message})`);
        }
      }
    }

    logs.push(`清理文件数: ${cleanedFiles}`);
    logs.push(`匹配文件数: ${matchedFiles}`);
    logs.push(`复制文件数: ${copiedFiles}`);

    return {
      success: true,
      message: "文件替换执行完成。",
      logs
    };
  } catch (error) {
    logs.push(`执行失败: ${error.message}`);
    return {
      success: false,
      message: "文件替换执行失败。",
      logs
    };
  }
});
