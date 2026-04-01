const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const { spawn } = require("child_process");

let store = null; // 通过动态 import() 初始化

const EXECUTABLE_NAME = "scada.develop.exe";
const PREFIXES = ["Scada", "Neutral", "JSCC", "Debug"];
const DEFAULT_SOURCE_FOLDER = "\\\\192.168.11.3\\xxx\\xxx\\xxx\\3-固件打包\\v3.38\\feature\\HMIS-10657-趋势图改原生\\3.38.10657.22";
const DEFAULT_VERSION = "3.39.10657.1";
const REPLACE_FOLDERS = ["cboxs\\New", "cboxs\\Old", "hmis\\New", "hmis\\Old", "iot\\New", "iot\\Old", "ipc\\New", "ipc\\Old"];
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
  { regex: /IPC_.*\.ipc/i, target: "ipc\\Old" },
];

// ─── 工具函数 ────────────────────────────────────────────────────────────────

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
  if (!version) return "其他";
  const parts = version.split(".");
  if (parts.length < 2) return "其他";
  return `${parts[0]}.${parts[1]}`;
};

const detectPrefix = value => {
  if (!value) return "其他";
  const classType = PREFIXES.join("|");
  const reg = new RegExp("^(" + classType + ")");
  const m = reg.exec(value);
  return (m && m[1]) || "其他";
};

const normalizePrefix = prefix => {
  if (!prefix) return null;
  const match = PREFIXES.find(item => item.toLowerCase() === String(prefix).toLowerCase());
  return match || null;
};

const parseTargetVersion = (rawVersion, rawPrefix) => {
  const normalizedPrefix = normalizePrefix(rawPrefix);
  if (!rawVersion) {
    return { version: null, prefix: normalizedPrefix };
  }
  const prefixGroup = PREFIXES.join("|");
  const versionMatch = String(rawVersion)
    .trim()
    .match(new RegExp(`^(?:(${prefixGroup})[\\s-_]*)?v?(\\d+\\.\\d+\\.\\d+\\.\\d+)$`, "i"));
  if (versionMatch) {
    return {
      prefix: normalizePrefix(versionMatch[1]) || normalizedPrefix,
      version: versionMatch[2],
    };
  }
  return {
    version: String(rawVersion).trim(),
    prefix: normalizedPrefix,
  };
};

const findExecutableInDir = async rootDir => {
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isFile()) {
        if (entry.name.toLowerCase() === EXECUTABLE_NAME) return entryPath;
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
    if (!entry.isDirectory()) continue;
    const entryPath = path.join(rootDir, entry.name);
    const exePath = await findExecutableInDir(entryPath);
    if (!exePath) continue;
    const version = extractVersionFromPath(exePath) || extractVersionFromPath(entryPath);
    const group = groupFromVersion(version);
    const prefix = detectPrefix(`${entry.name}`);
    const label = version || entry.name;
    const item = { label, version, group, prefix, exePath };
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(item);
  }
  return Array.from(groups.entries())
    .map(([group, items]) => ({
      group,
      items: items.sort((a, b) => a.label.localeCompare(b.label, "zh-CN")),
    }))
    .sort((a, b) => a.group.localeCompare(b.group, "zh-CN"));
};

const ensureFolder = async folderPath => {
  await fs.mkdir(folderPath, { recursive: true });
};

const toTargetFolder = (baseFolder, relativeFolder) => path.join(baseFolder, ...relativeFolder.split(/[/\\]/));

// ─── 窗口 ────────────────────────────────────────────────────────────────────

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

app.whenReady().then(async () => {
  // electron-store 是纯 ESM 包，使用动态 import() 引入
  const { default: Store } = await import("electron-store");
  store = new Store({
    defaults: {
      rootPath: "",
      sourceFolder: DEFAULT_SOURCE_FOLDER,
      version: DEFAULT_VERSION,
      extractFolder: "",
    },
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ─── IPC 处理器 ───────────────────────────────────────────────────────────────

// 读取所有持久化字段，供渲染进程初始化时回显
ipcMain.handle("store-get-all", () => ({
  rootPath: store.get("rootPath"),
  sourceFolder: store.get("sourceFolder"),
  version: store.get("version"),
  extractFolder: store.get("extractFolder"),
}));

// 保存单个字段
ipcMain.handle("store-set", (_event, key, value) => {
  store.set(key, value);
});

// 打开目录对话框的公共函数，接受 defaultPath 参数
const openDirDialog = async defaultPath => {
  const opts = { properties: ["openDirectory"] };
  // 如果传入了有效路径则作为初始目录
  if (defaultPath) {
    try {
      const stat = await fs.stat(defaultPath);
      opts.defaultPath = stat.isDirectory() ? defaultPath : path.dirname(defaultPath);
    } catch {
      // 路径不存在则不设 defaultPath
    }
  }
  const result = await dialog.showOpenDialog(opts);
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
};

ipcMain.handle("select-root", async (_event, currentValue) => {
  const selected = await openDirDialog(currentValue || store.get("rootPath"));
  if (selected) store.set("rootPath", selected);
  return selected;
});

ipcMain.handle("select-folder", async (_event, currentValue) => {
  const selected = await openDirDialog(currentValue || store.get("sourceFolder"));
  if (selected) store.set("sourceFolder", selected);
  return selected;
});

ipcMain.handle("select-extract-folder", async (_event, currentValue) => {
  const selected = await openDirDialog(currentValue || store.get("extractFolder"));
  if (selected) store.set("extractFolder", selected);
  return selected;
});

ipcMain.handle("default-root", async () => {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
  return path.dirname(app.getPath("exe"));
});

ipcMain.handle("scan-root", async (_event, rootDir) => {
  return scanRoot(rootDir || process.cwd());
});

ipcMain.handle("launch-exe", async (_event, exePath) => {
  if (!exePath) return false;
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", exePath], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }).unref();
    } else {
      spawn(exePath, [], { detached: true, stdio: "ignore" }).unref();
    }
    return true;
  } catch {
    return false;
  }
});

// 文件替换 —— 每条日志实时推送给渲染进程
ipcMain.handle("replace-firmware-files", async (event, payload) => {
  const sourceFolder = payload?.sourceFolder?.trim() || DEFAULT_SOURCE_FOLDER;
  const parsedTarget = parseTargetVersion(payload?.version?.trim() || DEFAULT_VERSION, payload?.targetPrefix);
  const version = parsedTarget.version || DEFAULT_VERSION;
  const prefix = parsedTarget.prefix || "Scada";
  store.set("version", version); // 将版本信息存储到持久化存储中，供下次回显
  store.set("sourceFolder", sourceFolder); // 将版本信息存储到持久化存储中，供下次回显

  const baseFolder = `${store.get("rootPath")}\\${prefix}-v${version}\\${prefix}Dir\\firmware`;

  // 每条日志立即推送给渲染进程
  const sendLog = msg => {
    try {
      event.sender.send("replace-log", msg);
    } catch {
      // 窗口已关闭时忽略
    }
  };

  sendLog(`源文件夹: ${sourceFolder}`);
  sendLog(`目标版本: ${version}`);
  sendLog(`目标类型: ${prefix}`);
  sendLog(`目标路径: ${baseFolder}`);

  let copiedFiles = 0;
  let cleanedFiles = 0;
  let matchedFiles = 0;

  try {
    const sourceStat = await fs.stat(sourceFolder);
    if (!sourceStat.isDirectory()) {
      return { success: false, message: "源文件夹不存在或不是目录。" };
    }
  } catch (error) {
    sendLog(`无法访问源文件夹: ${error.message}`);
    return { success: false, message: "无法访问源文件夹。" };
  }

  try {
    // 清理目标文件夹
    for (const folder of REPLACE_FOLDERS) {
      const targetFolder = toTargetFolder(baseFolder, folder);
      try {
        await ensureFolder(targetFolder);
        const entries = await fs.readdir(targetFolder, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          await fs.rm(path.join(targetFolder, entry.name), { force: true });
          cleanedFiles += 1;
        }
        sendLog(`清理完成: ${targetFolder}`);
      } catch (error) {
        sendLog(`清理失败: ${targetFolder} (${error.message})`);
      }
    }

    // 复制匹配文件
    const sourceEntries = await fs.readdir(sourceFolder, { withFileTypes: true });
    for (const entry of sourceEntries) {
      if (!entry.isFile()) continue;
      const fileName = entry.name;
      const sourcePath = path.join(sourceFolder, fileName);
      for (const pattern of REPLACE_PATTERNS) {
        if (!pattern.regex.test(fileName)) continue;
        matchedFiles += 1;
        const targetFolder = toTargetFolder(baseFolder, pattern.target);
        try {
          await ensureFolder(targetFolder);
          await fs.copyFile(sourcePath, path.join(targetFolder, fileName));
          copiedFiles += 1;
          sendLog(`复制 ${fileName} -> ${targetFolder}`);
        } catch (error) {
          sendLog(`复制失败 ${fileName} -> ${targetFolder} (${error.message})`);
        }
      }
    }

    sendLog(`─────────────────────────`);
    sendLog(`清理文件数: ${cleanedFiles}`);
    sendLog(`匹配文件数: ${matchedFiles}`);
    sendLog(`复制文件数: ${copiedFiles}`);

    return { success: true, message: "文件替换执行完成。" };
  } catch (error) {
    sendLog(`执行失败: ${error.message}`);
    return { success: false, message: "文件替换执行失败。" };
  }
});

// 扫描指定文件夹下的 zip 文件
ipcMain.handle("list-zip-files", async (_event, folderPath) => {
  if (!folderPath) return { error: "未提供文件夹路径" };
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const zipFiles = entries
      .filter(e => e.isFile() && e.name.toLowerCase().endsWith(".zip"))
      .map(e => ({
        name: e.name,
        filePath: path.join(folderPath, e.name),
      }));
    return { files: zipFiles };
  } catch (error) {
    return { error: error.message };
  }
});

// 解压流程：yauzl 直接从源路径（含网络路径）流式解压到目标目录
// 无需拷贝临时文件，真实逐文件进度
// 依赖：npm install yauzl
ipcMain.handle("extract-zip", async (event, payload) => {
  const { zipPath, targetRoot } = payload || {};
  const yauzl = require("yauzl");
  const { createWriteStream } = require("fs");

  const sendLog = msg => {
    try {
      event.sender.send("extract-log", msg);
    } catch {
      /* 忽略 */
    }
  };
  const sendProgress = (pct, label) => {
    sendLog(`PROGRESS:${Math.round(pct)}/100:${label}`);
  };

  if (!zipPath) {
    sendLog("错误：未指定源文件。");
    return { success: false, message: "未指定源文件。" };
  }
  if (!targetRoot) {
    sendLog("错误：未指定解压根目录。");
    return { success: false, message: "未指定解压根目录。" };
  }

  const zipName = path.basename(zipPath, ".zip");
  const destPath = path.join(targetRoot, zipName);

  sendLog(`源文件:   ${zipPath}`);
  sendLog(`解压目录: ${destPath}`);
  sendProgress(0, "正在打开压缩文件...");

  try {
    await fs.mkdir(destPath, { recursive: true });
  } catch (err) {
    sendLog(`创建目标目录失败: ${err.message}`);
    return { success: false, message: `创建目标目录失败: ${err.message}` };
  }

  return new Promise(resolve => {
    // lazyEntries：手动逐条读取，控制并发
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        sendLog(`打开 zip 失败: ${err.message}`);
        return resolve({ success: false, message: `打开 zip 失败: ${err.message}` });
      }

      const total = zipfile.entryCount;
      let done = 0;
      let failed = false;

      sendLog(`共 ${total} 个条目，开始解压...`);
      sendProgress(1, `共 ${total} 个条目`);

      // 读取下一条目
      zipfile.readEntry();

      zipfile.on("entry", async entry => {
        // 目录条目
        if (/\/$/.test(entry.fileName)) {
          const dirPath = path.join(destPath, entry.fileName);
          try {
            await fs.mkdir(dirPath, { recursive: true });
          } catch {
            /* 忽略已存在 */
          }
          done++;
          sendProgress((done / total) * 100, `${entry.fileName}`);
          zipfile.readEntry();
          return;
        }

        // 文件条目：先确保父目录存在，再流式写出
        const fileDest = path.join(destPath, entry.fileName);
        const fileDir = path.dirname(fileDest);

        try {
          await fs.mkdir(fileDir, { recursive: true });
        } catch {
          /* 忽略 */
        }

        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr) {
            sendLog(`读取条目失败 [${entry.fileName}]: ${streamErr.message}`);
            done++;
            zipfile.readEntry();
            return;
          }

          const writer = createWriteStream(fileDest);
          readStream.pipe(writer);

          writer.on("finish", () => {
            done++;
            const pct = (done / total) * 100;
            sendProgress(pct, entry.fileName);
            zipfile.readEntry(); // 继续下一条
          });

          writer.on("error", writeErr => {
            sendLog(`写入失败 [${entry.fileName}]: ${writeErr.message}`);
            done++;
            zipfile.readEntry();
          });
        });
      });

      zipfile.on("end", () => {
        if (failed) return;
        sendProgress(100, "全部完成！");
        sendLog(`─────────────────────────`);
        sendLog(`解压完成！目标路径: ${destPath}`);
        resolve({ success: true, message: "解压完成。", destPath });
      });

      zipfile.on("error", zipErr => {
        failed = true;
        sendLog(`解压错误: ${zipErr.message}`);
        resolve({ success: false, message: `解压错误: ${zipErr.message}` });
      });
    });
  });
});
