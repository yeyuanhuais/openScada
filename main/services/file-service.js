const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { createWriteStream } = require("fs");
const yauzl = require("yauzl");

const { DEFAULT_SOURCE_FOLDER, DEFAULT_VERSION, REPLACE_FOLDERS, REPLACE_PATTERNS } = require("../config");
const { parseTargetVersion, compareVersions } = require("./version-service");

const ensureFolder = async folderPath => {
  await fs.mkdir(folderPath, { recursive: true });
};

const toTargetFolder = (baseFolder, relativeFolder) => path.join(baseFolder, ...relativeFolder.split(/[/\\]/));

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const extractZipSortMeta = fileName => {
  const normalizedName = String(fileName || "");
  const versionMatch = normalizedName.match(/v?(\d+\.\d+\.\d+\.\d+)/i);
  const version = versionMatch ? versionMatch[1] : "";
  const prefix = normalizedName.slice(0, versionMatch ? versionMatch.index : normalizedName.length).replace(/[-_.\s]+$/, "");

  return {
    prefix,
    version,
  };
};

const compareZipFileNames = (leftName, rightName) => {
  const leftMeta = extractZipSortMeta(leftName);
  const rightMeta = extractZipSortMeta(rightName);

  return (
    leftMeta.prefix.localeCompare(rightMeta.prefix, "zh-CN") ||
    compareVersions(leftMeta.version, rightMeta.version) ||
    leftName.localeCompare(rightName, "zh-CN")
  );
};

const resolveFirmwareBaseFolder = ({ exePath, prefix, version, rootPath }) => {
  if (exePath) {
    return path.join(path.dirname(exePath), "firmware");
  }

  const prefixFolder = prefix === "Scada" ? "Haiwell" : prefix;
  return path.join(rootPath || "", `${prefix}-v${version}`, `${prefixFolder}Dir`, "firmware");
};

const deleteDirWithCmd = targetDir =>
  new Promise(resolve => {
    const proc = spawn("cmd", ["/c", "rd", "/s", "/q", targetDir], {
      windowsHide: true,
      stdio: "ignore",
    });

    proc.on("error", error => resolve({ ok: false, error }));
    proc.on("close", async code => {
      if (code === 0) {
        resolve({ ok: true });
        return;
      }

      try {
        await fs.stat(targetDir);
        resolve({ ok: false, error: new Error(`rd 退出码: ${code}`) });
      } catch {
        resolve({ ok: true });
      }
    });
  });

const launchExe = async exePath => {
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
};

const deleteVersionFolder = async folderPath => {
  if (!folderPath) {
    return { success: false, message: "未提供要删除的目录。" };
  }

  try {
    const stat = await fs.stat(folderPath);
    if (!stat.isDirectory()) {
      return { success: false, message: "目标路径不是目录。" };
    }
  } catch {
    return { success: false, message: "目标目录不存在或无法访问。" };
  }

  try {
    await fs.rm(folderPath, { recursive: true, force: true });
    return { success: true, message: "删除成功。" };
  } catch (error) {
    if (process.platform === "win32") {
      let lastError = error;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await deleteDirWithCmd(folderPath);
        if (result.ok) {
          return { success: true, message: "删除成功。" };
        }
        lastError = result.error || lastError;
        await wait(200 * (attempt + 1));
      }
      return { success: false, message: `删除失败: ${lastError.message}` };
    }

    return { success: false, message: `删除失败: ${error.message}` };
  }
};

const replaceFirmwareFiles = async (event, payload, store) => {
  const sourceFolder = payload?.sourceFolder?.trim() || DEFAULT_SOURCE_FOLDER;
  const parsedTarget = parseTargetVersion(payload?.version?.trim() || DEFAULT_VERSION, payload?.targetPrefix);
  const version = parsedTarget.version || DEFAULT_VERSION;
  const prefix = parsedTarget.prefix || "Scada";

  store.set("version", version);
  store.set("sourceFolder", sourceFolder);

  const exePath = payload?.exePath?.trim() || "";
  const baseFolder = resolveFirmwareBaseFolder({
    exePath,
    prefix,
    version,
    rootPath: store.get("rootPath"),
  });

  const sendLog = msg => {
    try {
      event.sender.send("replace-log", msg);
    } catch {
      // 窗口关闭后忽略推送失败
    }
  };

  sendLog(`源文件夹: ${sourceFolder}`);
  sendLog(`目标版本: ${version}`);
  sendLog(`目标类型: ${prefix}`);
  if (exePath) {
    sendLog(`目标程序: ${exePath}`);
  }
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

    sendLog("─────────────────────────");
    sendLog(`清理文件数: ${cleanedFiles}`);
    sendLog(`匹配文件数: ${matchedFiles}`);
    sendLog(`复制文件数: ${copiedFiles}`);

    return { success: true, message: "文件替换执行完成。" };
  } catch (error) {
    sendLog(`执行失败: ${error.message}`);
    return { success: false, message: "文件替换执行失败。" };
  }
};

const listZipFiles = async folderPath => {
  if (!folderPath) return { error: "未提供文件夹路径" };

  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const zipFiles = entries
      .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith(".zip"))
      .map(entry => ({
        name: entry.name,
        filePath: path.join(folderPath, entry.name),
      }))
      .sort((left, right) => compareZipFileNames(left.name, right.name));
    return { files: zipFiles };
  } catch (error) {
    return { error: error.message };
  }
};

const extractZip = async (event, payload) => {
  const { zipPath, targetRoot } = payload || {};

  const sendLog = msg => {
    try {
      event.sender.send("extract-log", msg);
    } catch {
      // 忽略窗口关闭后的推送异常
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
  } catch (error) {
    sendLog(`创建目标目录失败: ${error.message}`);
    return { success: false, message: `创建目标目录失败: ${error.message}` };
  }

  return new Promise(resolve => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, zipfile) => {
      if (error) {
        sendLog(`打开 zip 失败: ${error.message}`);
        return resolve({ success: false, message: `打开 zip 失败: ${error.message}` });
      }

      const total = zipfile.entryCount;
      let done = 0;
      let failed = false;

      sendLog(`共 ${total} 个条目，开始解压...`);
      sendProgress(1, `共 ${total} 个条目`);

      zipfile.readEntry();

      zipfile.on("entry", async entry => {
        if (/\/$/.test(entry.fileName)) {
          const dirPath = path.join(destPath, entry.fileName);
          try {
            await fs.mkdir(dirPath, { recursive: true });
          } catch {
            // 目录已存在时忽略
          }
          done += 1;
          sendProgress((done / total) * 100, entry.fileName);
          zipfile.readEntry();
          return;
        }

        const fileDest = path.join(destPath, entry.fileName);
        const fileDir = path.dirname(fileDest);

        try {
          await fs.mkdir(fileDir, { recursive: true });
        } catch {
          // 目录已存在时忽略
        }

        zipfile.openReadStream(entry, (streamError, readStream) => {
          if (streamError) {
            sendLog(`读取条目失败 [${entry.fileName}]: ${streamError.message}`);
            done += 1;
            zipfile.readEntry();
            return;
          }

          const writer = createWriteStream(fileDest);
          readStream.pipe(writer);

          writer.on("finish", () => {
            done += 1;
            sendProgress((done / total) * 100, entry.fileName);
            zipfile.readEntry();
          });

          writer.on("error", writeError => {
            sendLog(`写入失败 [${entry.fileName}]: ${writeError.message}`);
            done += 1;
            zipfile.readEntry();
          });
        });
      });

      zipfile.on("end", () => {
        if (failed) return;
        sendProgress(100, "全部完成！");
        sendLog("─────────────────────────");
        sendLog(`解压完成！目标路径: ${destPath}`);
        resolve({ success: true, message: "解压完成。", destPath });
      });

      zipfile.on("error", zipError => {
        failed = true;
        sendLog(`解压错误: ${zipError.message}`);
        resolve({ success: false, message: `解压错误: ${zipError.message}` });
      });
    });
  });
};

module.exports = {
  deleteVersionFolder,
  extractZip,
  launchExe,
  listZipFiles,
  replaceFirmwareFiles,
};
