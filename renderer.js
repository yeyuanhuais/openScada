// ─── 版本浏览 DOM ─────────────────────────────────────────────────────────────
const rootPathEl = document.getElementById("rootPath");
const groupFiltersEl = document.getElementById("groupFilters");
const prefixFiltersEl = document.getElementById("prefixFilters");
const versionListEl = document.getElementById("versionList");
const searchInputEl = document.getElementById("searchInput");
const versionStatusEl = document.getElementById("versionStatus");
const filtersPanelEl = document.getElementById("filtersPanel");
const filtersPreviewEl = document.getElementById("filtersPreview");
const toggleFiltersButton = document.getElementById("toggleFilters");
const selectRootButton = document.getElementById("selectRoot");
const refreshButton = document.getElementById("refresh");
const tabs = document.querySelectorAll(".tab");
const tabPanels = document.querySelectorAll(".tab-panel");
const brandEl = document.querySelector(".brand");
const deleteConfirmModalEl = document.getElementById("deleteConfirmModal");
const deleteModalMessageEl = document.getElementById("deleteModalMessage");
const deleteModalCancelButton = document.getElementById("deleteModalCancel");
const deleteModalConfirmButton = document.getElementById("deleteModalConfirm");
const toggleDeleteModeButton = document.getElementById("toggleDeleteMode");
const removeOldVersionsButton = document.getElementById("removeOldVersions");
const deleteSelectedButton = document.getElementById("deleteSelected");
const deleteSelectionHintEl = document.getElementById("deleteSelectionHint");
const deleteProgressWrap = document.getElementById("deleteProgressWrap");
const deleteProgressFill = document.getElementById("deleteProgressFill");
const deleteProgressLabel = document.getElementById("deleteProgressLabel");

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
let selectedGroup = null; // 单选：null 表示不限
let selectedPrefix = null; // 单选：null 表示不限
let searchKeyword = "";
let selectedTargetPrefix = null;
let selectedTargetExePath = null;
let selectedZipPath = null;
let deleteModalResolver = null;
let isDeleteMode = false;
let deleteSelection = new Set();
let areFiltersCollapsed = false;

const DEFAULT_SOURCE_FOLDER = "\\\\192.168.11.3\\xxx\\xxx\\xxx\\3-固件打包\\v3.38\\feature\\HMIS-10657-趋势图改原生\\3.38.10657.22";
const DEFAULT_VERSION = "3.39.10657.1";

// 持久化：防抖保存，避免每次按键都写磁盘
const SAVE_DELAY = 600;
const saveTimers = {};
const scheduleSave = (key, value) => {
  clearTimeout(saveTimers[key]);
  saveTimers[key] = setTimeout(() => electronAPI.storeSet(key, value), SAVE_DELAY);
};

const saveVersionFilters = () => {
  scheduleSave("versionSearchKeyword", searchKeyword);
  scheduleSave("versionSelectedPrefix", selectedPrefix || "");
  scheduleSave("versionSelectedGroup", selectedGroup || "");
  scheduleSave("versionFiltersCollapsed", areFiltersCollapsed);
};

const PREFIX_ORDER = ["Scada", "Neutral", "JSCC", "其他"];
const compareVersionStrings = (left, right) => {
  const leftParts = String(left || "")
    .split(".")
    .map(part => Number(part) || 0);
  const rightParts = String(right || "")
    .split(".")
    .map(part => Number(part) || 0);

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index] || 0;
    const rightPart = rightParts[index] || 0;
    if (leftPart !== rightPart) return leftPart - rightPart;
  }

  return 0;
};

const prefixClassName = prefix => {
  const normalized = (prefix || "其他").toLowerCase();
  if (normalized === "其他") return "other";
  return normalized.replace(/[^a-z0-9-]/g, "") || "other";
};

const updateFiltersPreview = () => {
  const previewParts = [];

  if (selectedPrefix) {
    previewParts.push(`前缀: ${selectedPrefix}`);
  }
  if (selectedGroup) {
    previewParts.push(`版本: ${selectedGroup}`);
  }
  if (searchKeyword.trim()) {
    previewParts.push(`关键词: ${searchKeyword.trim()}`);
  }

  filtersPreviewEl.textContent = previewParts.length > 0 ? previewParts.join(" / ") : "当前未设置筛选";
  filtersPreviewEl.classList.toggle("is-visible", areFiltersCollapsed);
};

const updateFiltersCollapseState = () => {
  filtersPanelEl.classList.toggle("is-collapsed", areFiltersCollapsed);
  toggleFiltersButton.textContent = areFiltersCollapsed ? "展开筛选" : "收起筛选";
  toggleFiltersButton.setAttribute("aria-expanded", String(!areFiltersCollapsed));
  updateFiltersPreview();
};

const setDeleteProgress = (current, total) => {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  deleteProgressFill.style.width = `${pct}%`;
  deleteProgressLabel.textContent = `${pct}%  (${current} / ${total})`;
};

const updateDeleteControls = () => {
  const selectedCount = deleteSelection.size;
  toggleDeleteModeButton.textContent = isDeleteMode ? "关闭删除" : "开启删除";
  deleteSelectionHintEl.textContent = isDeleteMode
    ? `已进入删除模式，当前选中 ${selectedCount} 项。`
    : "开启删除后可多选版本。";
  removeOldVersionsButton.disabled = !isDeleteMode;
  deleteSelectedButton.disabled = !isDeleteMode || selectedCount === 0;
};

const exitDeleteMode = () => {
  isDeleteMode = false;
  deleteSelection = new Set();
  deleteProgressWrap.style.display = "none";
  setDeleteProgress(0, 0);
  updateDeleteControls();
};

const getFilteredItems = () => {
  const keyword = searchKeyword.trim().toLowerCase();
  let items = groupedData.flatMap(group => group.items);

  if (selectedPrefix !== null) {
    items = items.filter(item => (item.prefix || "其他") === selectedPrefix);
  }
  if (selectedGroup !== null) {
    items = items.filter(item => item.group === selectedGroup);
  }
  if (keyword) {
    items = items.filter(item => {
      const haystack = `${item.label} ${item.version || ""} ${item.group} ${item.prefix || ""}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }

  return items;
};

const toggleDeleteSelection = folderPath => {
  if (!folderPath) return;

  if (deleteSelection.has(folderPath)) {
    deleteSelection.delete(folderPath);
  } else {
    deleteSelection.add(folderPath);
  }

  updateDeleteControls();
  renderVersions();
};

const collectOldVersionCandidates = items => {
  const versionBuckets = new Map();

  items.forEach(item => {
    const versionParts = String(item.version || "").split(".");
    if (versionParts.length < 4) return;

    const familyKey = `${item.prefix || "其他"}:${versionParts.slice(0, 3).join(".")}`;
    if (!versionBuckets.has(familyKey)) {
      versionBuckets.set(familyKey, []);
    }
    versionBuckets.get(familyKey).push(item);
  });

  const candidates = [];
  versionBuckets.forEach(bucketItems => {
    if (bucketItems.length < 2) return;

    const sortedItems = [...bucketItems].sort((left, right) => compareVersionStrings(left.version, right.version));
    candidates.push(...sortedItems.slice(0, -1));
  });

  return candidates;
};

const runDeleteBatch = async ({ items, actionLabel }) => {
  if (items.length === 0) {
    versionStatusEl.textContent = `${actionLabel}没有可删除的版本。`;
    versionStatusEl.classList.remove("error");
    return;
  }

  const versionList = items.map(item => `- ${item.label || item.version || item.folderPath}`).join("\n");
  const confirmed = await openDeleteConfirmModal(
    `将永久删除 ${actionLabel}${items.length} 个版本目录，此操作不可恢复。\n${versionList}`
  );
  if (!confirmed) return;

  deleteProgressWrap.style.display = "flex";
  setDeleteProgress(0, items.length);
  versionStatusEl.textContent = `${actionLabel}中...`;
  versionStatusEl.classList.remove("error");
  toggleDeleteModeButton.disabled = true;
  removeOldVersionsButton.disabled = true;
  deleteSelectedButton.disabled = true;

  let successCount = 0;
  const failedItems = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    try {
      const result = await electronAPI.deleteVersionFolder(item.folderPath);
      if (result.success) {
        successCount += 1;
      } else {
        failedItems.push(`${item.label || item.folderPath}: ${result.message}`);
      }
    } catch (error) {
      failedItems.push(`${item.label || item.folderPath}: ${error.message}`);
    }
    setDeleteProgress(index + 1, items.length);
  }

  if (failedItems.length > 0) {
    versionStatusEl.textContent = `${actionLabel}完成，成功 ${successCount} 项，失败 ${failedItems.length} 项。`;
    versionStatusEl.classList.add("error");
  } else {
    versionStatusEl.textContent = `${actionLabel}完成，共删除 ${successCount} 项。`;
    versionStatusEl.classList.remove("error");
  }

  deleteSelection = new Set();
  await refreshData();
  toggleDeleteModeButton.disabled = false;
  updateDeleteControls();
};

const closeDeleteConfirmModal = confirmed => {
  deleteConfirmModalEl.classList.remove("is-open");
  deleteConfirmModalEl.setAttribute("aria-hidden", "true");
  if (deleteModalResolver) {
    deleteModalResolver(confirmed);
    deleteModalResolver = null;
  }
};

const openDeleteConfirmModal = message => {
  deleteModalMessageEl.textContent = message;
  deleteConfirmModalEl.classList.add("is-open");
  deleteConfirmModalEl.setAttribute("aria-hidden", "false");
  deleteModalConfirmButton.focus();
  return new Promise(resolve => {
    deleteModalResolver = resolve;
  });
};

deleteModalCancelButton.addEventListener("click", () => closeDeleteConfirmModal(false));
deleteModalConfirmButton.addEventListener("click", () => closeDeleteConfirmModal(true));
deleteConfirmModalEl.addEventListener("click", event => {
  if (event.target === deleteConfirmModalEl) closeDeleteConfirmModal(false);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && deleteConfirmModalEl.classList.contains("is-open")) {
    closeDeleteConfirmModal(false);
  }
});

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

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "groupFilter";
    radio.checked = selectedGroup === group.group;
    radio.addEventListener("change", () => {
      selectedGroup = group.group;
      saveVersionFilters();
      renderVersions();
    });

    const text = document.createElement("span");
    text.textContent = group.group;

    wrapper.appendChild(radio);
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
      return (indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA) - (indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB);
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

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "prefixFilter";
    radio.checked = selectedPrefix === prefix;
    radio.addEventListener("change", () => {
      selectedPrefix = prefix;
      // 切换前缀时重置版本组选择
      selectedGroup = null;
      saveVersionFilters();
      renderGroups();
      renderVersions();
    });

    const text = document.createElement("span");
    text.textContent = prefix;

    wrapper.appendChild(radio);
    wrapper.appendChild(text);
    prefixFiltersEl.appendChild(wrapper);
  });
};

const renderVersions = () => {
  versionListEl.innerHTML = "";
  const items = getFilteredItems();

  deleteSelection.forEach(folderPath => {
    const exists = items.some(item => item.folderPath === folderPath);
    if (!exists) {
      deleteSelection.delete(folderPath);
    }
  });
  updateDeleteControls();

  if (items.length === 0) {
    versionListEl.innerHTML = '<div class="empty">暂无匹配结果</div>';
    return;
  }

  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "version-item";
    if (isDeleteMode) card.classList.add("delete-mode");
    if (deleteSelection.has(item.folderPath)) card.classList.add("is-selected");

    if (isDeleteMode) {
      const checkboxLabel = document.createElement("label");
      checkboxLabel.className = "version-select";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = deleteSelection.has(item.folderPath);
      checkbox.addEventListener("change", () => toggleDeleteSelection(item.folderPath));

      const checkboxText = document.createElement("span");
      checkboxText.textContent = "删除";

      checkboxLabel.appendChild(checkbox);
      checkboxLabel.appendChild(checkboxText);
      card.appendChild(checkboxLabel);
    }

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
    selectButton.textContent = "替换";
    selectButton.addEventListener("click", () => {
      const targetVersion = item.version || item.label;
      versionInput.value = targetVersion;
      selectedTargetPrefix = item.prefix || null;
      selectedTargetExePath = item.exePath || null;
      replaceStatusEl.textContent = `已选择目标版本：${targetVersion}`;
      replaceStatusEl.classList.remove("error");
      setActiveTab("replace");
    });

    const actions = document.createElement("div");
    actions.className = "version-actions";
    actions.appendChild(openButton);
    actions.appendChild(selectButton);

    card.appendChild(meta);
    card.appendChild(actions);
    versionListEl.appendChild(card);
  });
};

// 更新解压目标提示
const updateExtractDestHint = () => {
  if (currentRoot && selectedZipPath) {
    const zipName = selectedZipPath
      .split(/[/\\]/)
      .pop()
      .replace(/\.zip$/i, "");
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
    currentRoot = stored.rootPath || (await electronAPI.defaultRoot());
    rootPathEl.textContent = currentRoot;
  }

  groupedData = await electronAPI.scanRoot(currentRoot);

  const availablePrefixes = new Set();
  const availableGroups = new Set();
  groupedData.forEach(group => {
    availableGroups.add(group.group);
    group.items.forEach(item => availablePrefixes.add(item.prefix || "其他"));
  });

  let filtersChanged = false;
  if (selectedPrefix !== null && !availablePrefixes.has(selectedPrefix)) {
    selectedPrefix = null;
    filtersChanged = true;
  }
  if (selectedGroup !== null && !availableGroups.has(selectedGroup)) {
    selectedGroup = null;
    filtersChanged = true;
  }

  if (filtersChanged) {
    saveVersionFilters();
  }

  updateFiltersPreview();
  renderGroups();
  renderPrefixes();
  renderVersions();
  updateExtractDestHint();
};

// ─── 版本浏览事件 ─────────────────────────────────────────────────────────────

const clearFiltersButton = document.getElementById("clearFilters");

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

clearFiltersButton.addEventListener("click", () => {
  selectedPrefix = null;
  selectedGroup = null;
  searchKeyword = "";
  searchInputEl.value = "";
  saveVersionFilters();
  updateFiltersPreview();
  renderPrefixes();
  renderGroups();
  renderVersions();
});

refreshButton.addEventListener("click", async () => {
  await refreshData();
});

toggleFiltersButton.addEventListener("click", () => {
  areFiltersCollapsed = !areFiltersCollapsed;
  scheduleSave("versionFiltersCollapsed", areFiltersCollapsed);
  updateFiltersCollapseState();
});

toggleDeleteModeButton.addEventListener("click", () => {
  if (isDeleteMode) {
    exitDeleteMode();
  } else {
    isDeleteMode = true;
    deleteSelection = new Set();
    versionStatusEl.textContent = "已开启删除模式。";
    versionStatusEl.classList.remove("error");
    updateDeleteControls();
  }
  renderVersions();
});

removeOldVersionsButton.addEventListener("click", async () => {
  const candidates = collectOldVersionCandidates(getFilteredItems());
  await runDeleteBatch({
    items: candidates,
    actionLabel: "同版本旧版本删除",
  });
});

deleteSelectedButton.addEventListener("click", async () => {
  const selectedItems = getFilteredItems().filter(item => deleteSelection.has(item.folderPath));
  await runDeleteBatch({
    items: selectedItems,
    actionLabel: "批量删除",
  });
});

searchInputEl.addEventListener("input", event => {
  searchKeyword = event.target.value || "";
  saveVersionFilters();
  updateFiltersPreview();
  renderVersions();
});

const setActiveTab = targetTab => {
  tabs.forEach(tab => {
    tab.classList.toggle("is-active", tab.dataset.tab === targetTab);
  });
  tabPanels.forEach(panel => {
    panel.classList.toggle("active", panel.id === `tab${targetTab[0].toUpperCase()}${targetTab.slice(1)}`);
  });
};

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    setActiveTab(tab.dataset.tab);
    if (tab.dataset.tab === "extract") updateExtractDestHint();
    if (tab.dataset.tab === "versions") refreshData();
  });
});

// ─── 文件替换事件 ─────────────────────────────────────────────────────────────

sourceFolderInput.value = DEFAULT_SOURCE_FOLDER;
versionInput.value = DEFAULT_VERSION;

// 输入变化时持久化保存（防抖）
sourceFolderInput.addEventListener("input", () => scheduleSave("sourceFolder", sourceFolderInput.value));
versionInput.addEventListener("input", () => scheduleSave("version", versionInput.value));

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
      exePath: selectedTargetExePath,
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
    const body = msg.slice("PROGRESS:".length);
    const slashIdx = body.indexOf("/");
    const colonIdx = body.indexOf(":", slashIdx);
    const pct = parseInt(body.slice(0, slashIdx), 10);
    const label = colonIdx !== -1 ? body.slice(colonIdx + 1) : "";
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
    if (result.success) {
      await refreshData();
      setExtractProgress(1, 1);
    }
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

  try {
    const appVersion = await electronAPI.getAppVersion();
    if (brandEl) {
      brandEl.textContent = `v${appVersion}`;
    }
  } catch {
  }

  // 文件替换
  sourceFolderInput.value = stored.sourceFolder || DEFAULT_SOURCE_FOLDER;
  versionInput.value = stored.version || DEFAULT_VERSION;

  // 版本筛选
  searchKeyword = stored.versionSearchKeyword || "";
  selectedPrefix = stored.versionSelectedPrefix || null;
  selectedGroup = stored.versionSelectedGroup || null;
  areFiltersCollapsed = Boolean(stored.versionFiltersCollapsed);
  searchInputEl.value = searchKeyword;

  // 组态解压
  if (stored.extractFolder) {
    extractFolderInput.value = stored.extractFolder;
  }

  // 版本浏览 rootPath（refreshData 内部会读 stored.rootPath）
  if (stored.rootPath) {
    currentRoot = stored.rootPath;
    rootPathEl.textContent = stored.rootPath;
  }

  updateFiltersPreview();
  updateFiltersCollapseState();
  updateDeleteControls();

  await refreshData();

  // 如果上次有 extractFolder，自动扫描一次
  if (stored.extractFolder) {
    await scanAndRenderZips();
  }
})();
