// ─── 版本浏览 DOM ─────────────────────────────────────────────────────────────
const rootPathEl = document.getElementById("rootPath");
const groupFiltersEl = document.getElementById("groupFilters");
const prefixFiltersEl = document.getElementById("prefixFilters");
const versionListEl = document.getElementById("versionList");
const searchInputEl = document.getElementById("searchInput");
const selectRootButton = document.getElementById("selectRoot");
const refreshButton = document.getElementById("refresh");
const tabs = document.querySelectorAll(".tab");
const tabPanels = document.querySelectorAll(".tab-panel");

// ─── 文件替换 DOM ─────────────────────────────────────────────────────────────
const sourceFolderInput = document.getElementById("sourceFolderInput");
const sourceBrowseButton = document.getElementById("sourceBrowse");
const versionInput = document.getElementById("versionInput");
const runReplaceButton = document.getElementById("runReplace");
const replaceStatusEl = document.getElementById("replaceStatus");
const replaceLogEl = document.getElementById("replaceLog");

// ─── 组态解压 DOM ─────────────────────────────────────────────────────────────
const extractFolderInput = document.getElementById("extractFolderInput");
const extractBrowseButton = document.getElementById("extractBrowse");
const scanZipsButton = document.getElementById("scanZips");
const zipFileSelectEl = document.getElementById("zipFileSelect");
const extractDestHintEl = document.getElementById("extractDestHint");
const runExtractButton = document.getElementById("runExtract");
const extractStatusEl = document.getElementById("extractStatus");
const extractLogEl = document.getElementById("extractLog");
const extractProgressWrap = document.getElementById("extractProgressWrap");
const extractProgressFill = document.getElementById("extractProgressFill");
const extractProgressLabel = document.getElementById("extractProgressLabel");

// ─── 状态 ─────────────────────────────────────────────────────────────────────
let currentRoot = null;
let groupedData = [];
let selectedGroups = new Set();
let selectedPrefixes = new Set();
let searchKeyword = "";
let selectedTargetPrefix = null;
let selectedZipPath = null; // 当前选中的 zip 文件路径

const DEFAULT_SOURCE_FOLDER = "\\\\192.168.11.3\\xxx\\xxx\\xxx\\3-固件打包\\v3.38\\feature\\HMIS-10657-趋势图改原生\\3.38.10657.22";
const DEFAULT_VERSION = "3.39.10657.1";

// 持久化：防抖保存，避免每次按键都写磁盘
const SAVE_DELAY = 600;
const saveTimers = {};
const scheduleSave = (key, value) => {
  clearTimeout(saveTimers[key]);
  saveTimers[key] = setTimeout(() => electronAPI.storeSet(key, value), SAVE_DELAY);
};

const PREFIX_ORDER = ["Scada", "Neutral", "JSCC", "其他"];
const prefixClassName = prefix => {
  const normalized = (prefix || "其他").toLowerCase();
  if (normalized === "其他") return "other";
  return normalized.replace(/[^a-z0-9-]/g, "") || "other";
};

// ─── 版本浏览渲染 ─────────────────────────────────────────────────────────────

const renderGroups = () => {
  groupFiltersEl.innerHTML = "";
  if (groupedData.length === 0) {
    groupFiltersEl.innerHTML = '<div class="empty">暂无可用版本</div>';
    return;
  }
  groupedData.forEach(group => {
    const wrapper = document.createElement("label");
    wrapper.className = "group-filter";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedGroups.has(group.group);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedGroups.add(group.group);
      else selectedGroups.delete(group.group);
      renderVersions();
    });

    const text = document.createElement("span");
    text.textContent = group.group;

    wrapper.appendChild(checkbox);
    wrapper.appendChild(text);
    groupFiltersEl.appendChild(wrapper);
  });
};

const renderPrefixes = () => {
  prefixFiltersEl.innerHTML = "";
  const prefixes = new Set();
  groupedData.forEach(group => {
    group.items.forEach(item => prefixes.add(item.prefix || "其他"));
  });

  const sortedPrefixes = Array.from(prefixes).sort((a, b) => {
    const indexA = PREFIX_ORDER.indexOf(a);
    const indexB = PREFIX_ORDER.indexOf(b);
    if (indexA !== -1 || indexB !== -1) {
      return (indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA) -
             (indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB);
    }
    return a.localeCompare(b, "zh-CN");
  });

  if (sortedPrefixes.length === 0) {
    prefixFiltersEl.innerHTML = '<div class="empty">暂无前缀</div>';
    return;
  }

  sortedPrefixes.forEach(prefix => {
    const wrapper = document.createElement("label");
    wrapper.className = "prefix-filter";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedPrefixes.has(prefix);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedPrefixes.add(prefix);
      else selectedPrefixes.delete(prefix);
      renderVersions();
    });

    const text = document.createElement("span");
    text.textContent = prefix;

    wrapper.appendChild(checkbox);
    wrapper.appendChild(text);
    prefixFiltersEl.appendChild(wrapper);
  });
};

const renderVersions = () => {
  versionListEl.innerHTML = "";
  const keyword = searchKeyword.trim().toLowerCase();
  const visibleGroups = groupedData.filter(group => selectedGroups.has(group.group));
  const visibleItems = visibleGroups.flatMap(group =>
    group.items.filter(item => selectedPrefixes.has(item.prefix || "其他"))
  );
  const filteredItems = visibleItems.filter(item => {
    if (!keyword) return true;
    const haystack = `${item.label} ${item.version || ""} ${item.group} ${item.prefix || ""}`.toLowerCase();
    return haystack.includes(keyword);
  });

  if (filteredItems.length === 0) {
    versionListEl.innerHTML = '<div class="empty">暂无匹配结果</div>';
    return;
  }

  filteredItems.forEach(item => {
    const card = document.createElement("div");
    card.className = "version-item";

    const prefixLabel = item.prefix || "其他";
    const prefix = document.createElement("span");
    prefix.className = `prefix-tag prefix-${prefixClassName(prefixLabel)}`;
    prefix.textContent = prefixLabel;

    const info = document.createElement("div");
    info.className = "info";
    info.textContent = item.label;

    const groupTag = document.createElement("span");
    groupTag.className = "group-tag";
    groupTag.textContent = item.group;

    const tags = document.createElement("div");
    tags.className = "tags";
    tags.appendChild(prefix);
    tags.appendChild(groupTag);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.appendChild(tags);
    meta.appendChild(info);

    const openButton = document.createElement("button");
    openButton.className = "primary";
    openButton.textContent = "打开";
    openButton.addEventListener("click", async () => {
      await electronAPI.launchExe(item.exePath);
    });

    const selectButton = document.createElement("button");
    selectButton.className = "ghost";
    selectButton.textContent = "设为目标";
    selectButton.addEventListener("click", () => {
      const targetVersion = item.version || item.label;
      versionInput.value = targetVersion;
      selectedTargetPrefix = item.prefix || null;
      replaceStatusEl.textContent = `已选择目标版本：${targetVersion}`;
      replaceStatusEl.classList.remove("error");
      setActiveTab("replace");
    });

    const actions = document.createElement("div");
    actions.className = "version-actions";
    actions.appendChild(selectButton);
    actions.appendChild(openButton);

    card.appendChild(meta);
    card.appendChild(actions);
    versionListEl.appendChild(card);
  });
};

// 更新解压目标提示
const updateExtractDestHint = () => {
  if (currentRoot && selectedZipPath) {
    const zipName = selectedZipPath.split(/[/\\]/).pop().replace(/\.zip$/i, "");
    const destPath = `${currentRoot}\\${zipName}`;
    extractDestHintEl.textContent = `将解压到: ${destPath}`;
    runExtractButton.disabled = false;
  } else if (!currentRoot) {
    extractDestHintEl.textContent = "请先在版本浏览页选择根目录路径。";
    runExtractButton.disabled = true;
  } else {
    extractDestHintEl.textContent = "请先选择要解压的 zip 文件。";
    runExtractButton.disabled = true;
  }
};

const refreshData = async () => {
  if (!currentRoot) {
    const stored = await electronAPI.storeGetAll();
    currentRoot = stored.rootPath || await electronAPI.defaultRoot();
    rootPathEl.textContent = currentRoot;
  }
  groupedData = await electronAPI.scanRoot(currentRoot);
  selectedGroups = new Set(groupedData.map(group => group.group));
  selectedPrefixes = new Set(groupedData.flatMap(group => group.items.map(item => item.prefix || "其他")));
  renderGroups();
  renderPrefixes();
  renderVersions();
  updateExtractDestHint();
};

// ─── 版本浏览事件 ─────────────────────────────────────────────────────────────

selectRootButton.addEventListener("click", async () => {
  const selected = await electronAPI.selectRoot(currentRoot || rootPathEl.textContent);
  if (selected) {
    currentRoot = selected;
    rootPathEl.textContent = selected;
    electronAPI.storeSet("rootPath", selected);
    await refreshData();
    updateExtractDestHint();
  }
});

refreshButton.addEventListener("click", async () => {
  await refreshData();
});

searchInputEl.addEventListener("input", event => {
  searchKeyword = event.target.value || "";
  renderVersions();
});

const setActiveTab = targetTab => {
  tabs.forEach(tab => {
    tab.classList.toggle("is-active", tab.dataset.tab === targetTab);
  });
  tabPanels.forEach(panel => {
    panel.classList.toggle(
      "active",
      panel.id === `tab${targetTab[0].toUpperCase()}${targetTab.slice(1)}`
    );
  });
};

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    setActiveTab(tab.dataset.tab);
    if (tab.dataset.tab === "extract") updateExtractDestHint();
  });
});

// ─── 文件替换事件 ─────────────────────────────────────────────────────────────

sourceFolderInput.value = DEFAULT_SOURCE_FOLDER;
versionInput.value = DEFAULT_VERSION;

// 输入变化时持久化保存（防抖）
sourceFolderInput.addEventListener("input", () => scheduleSave("sourceFolder", sourceFolderInput.value));
versionInput.addEventListener("input",       () => scheduleSave("version",       versionInput.value));

sourceBrowseButton.addEventListener("click", async () => {
  const selected = await electronAPI.selectFolder(sourceFolderInput.value.trim());
  if (selected) {
    sourceFolderInput.value = selected;
    electronAPI.storeSet("sourceFolder", selected);
  }
});


// ─── 日志追加工具（两个面板通用）─────────────────────────────────────────────
const MAX_LOG_LINES = 500;

const appendLog = (el, text) => {
  el.insertAdjacentText("afterbegin", text + "\n");

  // 超出上限时裁掉尾部
  const lines = el.textContent.split("\n");
  if (lines.length > MAX_LOG_LINES + 50) {
    el.textContent = lines.slice(0, MAX_LOG_LINES).join("\n");
  }
};

// 注册实时日志监听（只注册一次）
electronAPI.onReplaceLog(msg => {
  appendLog(replaceLogEl, msg);
});

runReplaceButton.addEventListener("click", async () => {
  const sourceFolder = sourceFolderInput.value.trim() || DEFAULT_SOURCE_FOLDER;
  const version = versionInput.value.trim() || DEFAULT_VERSION;

  replaceStatusEl.textContent = "正在执行...";
  replaceStatusEl.classList.remove("error");
  runReplaceButton.disabled = true;
  replaceLogEl.textContent = "";

  try {
    const result = await electronAPI.replaceFirmwareFiles({
      sourceFolder,
      version,
      targetPrefix: selectedTargetPrefix,
    });
    replaceStatusEl.textContent = result.message || (result.success ? "执行完成" : "执行失败");
    replaceStatusEl.classList.toggle("error", !result.success);
  } catch (error) {
    replaceStatusEl.textContent = "执行失败";
    replaceStatusEl.classList.add("error");
    appendLog(replaceLogEl, `执行失败: ${error.message}`);
  } finally {
    runReplaceButton.disabled = false;
  }
});

// ─── 组态解压事件 ─────────────────────────────────────────────────────────────

// 设置进度条
const setExtractProgress = (current, total) => {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  extractProgressFill.style.width = `${pct}%`;
  extractProgressLabel.textContent = `${pct}%  (${current} / ${total})`;
};

// 扫描并填充下拉框
const scanAndRenderZips = async () => {
  const folderPath = extractFolderInput.value.trim();
  zipFileSelectEl.innerHTML = "";
  selectedZipPath = null;
  updateExtractDestHint();

  if (!folderPath) {
    zipFileSelectEl.innerHTML = '<option value="">-- 请先输入文件夹路径 --</option>';
    zipFileSelectEl.disabled = true;
    return;
  }

  zipFileSelectEl.innerHTML = '<option value="">正在扫描...</option>';
  zipFileSelectEl.disabled = true;

  const result = await electronAPI.listZipFiles(folderPath);

  if (result.error) {
    zipFileSelectEl.innerHTML = `<option value="">扫描失败: ${result.error}</option>`;
    return;
  }

  if (!result.files || result.files.length === 0) {
    zipFileSelectEl.innerHTML = '<option value="">未找到 zip 文件</option>';
    return;
  }

  zipFileSelectEl.innerHTML = '<option value="">-- 请选择 zip 文件 --</option>';
  result.files.forEach(file => {
    const opt = document.createElement("option");
    opt.value = file.filePath;
    opt.textContent = file.name;
    zipFileSelectEl.appendChild(opt);
  });
  zipFileSelectEl.disabled = false;
};

// 下拉框选择变化
zipFileSelectEl.addEventListener("change", () => {
  selectedZipPath = zipFileSelectEl.value || null;
  updateExtractDestHint();
});

extractBrowseButton.addEventListener("click", async () => {
  const selected = await electronAPI.selectExtractFolder(extractFolderInput.value.trim());
  if (selected) {
    extractFolderInput.value = selected;
    electronAPI.storeSet("extractFolder", selected);
    await scanAndRenderZips();
  }
});

scanZipsButton.addEventListener("click", async () => {
  electronAPI.storeSet("extractFolder", extractFolderInput.value);
  await scanAndRenderZips();
});

extractFolderInput.addEventListener("input", () => scheduleSave("extractFolder", extractFolderInput.value));

extractFolderInput.addEventListener("keydown", async event => {
  if (event.key === "Enter") await scanAndRenderZips();
});

// 注册实时日志监听（只注册一次）
// 进度行格式: PROGRESS:当前百分比/100:描述文字
electronAPI.onExtractLog(msg => {
  if (msg.startsWith("PROGRESS:")) {
    const body     = msg.slice("PROGRESS:".length);
    const slashIdx = body.indexOf("/");
    const colonIdx = body.indexOf(":", slashIdx);
    const pct      = parseInt(body.slice(0, slashIdx), 10);
    const label    = colonIdx !== -1 ? body.slice(colonIdx + 1) : "";
    setExtractProgress(pct, 100);
    // if (label) extractStatusEl.textContent = label;
  } else {
    appendLog(extractLogEl, msg);
  }
});

runExtractButton.addEventListener("click", async () => {
  if (!selectedZipPath) {
    extractStatusEl.textContent = "请先选择要解压的 zip 文件。";
    extractStatusEl.classList.add("error");
    return;
  }
  if (!currentRoot) {
    extractStatusEl.textContent = "请先在版本浏览页选择根目录路径。";
    extractStatusEl.classList.add("error");
    return;
  }

  extractStatusEl.textContent = "准备中...";
  extractStatusEl.classList.remove("error");
  runExtractButton.disabled = true;

  extractLogEl.textContent = "";
  setExtractProgress(0, 100);
  extractProgressWrap.style.display = "flex";

  try {
    const result = await electronAPI.extractZip({
      zipPath: selectedZipPath,
      targetRoot: currentRoot,
    });
    extractStatusEl.textContent = result.message || (result.success ? "解压完成" : "解压失败");
    extractStatusEl.classList.toggle("error", !result.success);
    if (result.success) setExtractProgress(1, 1);
  } catch (error) {
    extractStatusEl.textContent = "解压失败";
    extractStatusEl.classList.add("error");
    appendLog(extractLogEl, `解压失败: ${error.message}`);
  } finally {
    runExtractButton.disabled = false;
  }
});

// ─── 初始化：从持久化存储回显所有输入框 ─────────────────────────────────────

(async () => {
  const stored = await electronAPI.storeGetAll();

  // 文件替换
  sourceFolderInput.value = stored.sourceFolder || DEFAULT_SOURCE_FOLDER;
  versionInput.value      = stored.version       || DEFAULT_VERSION;

  // 组态解压
  if (stored.extractFolder) {
    extractFolderInput.value = stored.extractFolder;
  }

  // 版本浏览 rootPath（refreshData 内部会读 stored.rootPath）
  if (stored.rootPath) {
    currentRoot = stored.rootPath;
    rootPathEl.textContent = stored.rootPath;
  }

  await refreshData();

  // 如果上次有 extractFolder，自动扫描一次
  if (stored.extractFolder) {
    await scanAndRenderZips();
  }
})();