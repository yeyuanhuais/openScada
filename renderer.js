const rootPathEl = document.getElementById("rootPath");
const groupFiltersEl = document.getElementById("groupFilters");
const prefixFiltersEl = document.getElementById("prefixFilters");
const versionListEl = document.getElementById("versionList");
const searchInputEl = document.getElementById("searchInput");
const selectRootButton = document.getElementById("selectRoot");
const refreshButton = document.getElementById("refresh");
const tabs = document.querySelectorAll(".tab");
const tabPanels = document.querySelectorAll(".tab-panel");

const sourceFolderInput = document.getElementById("sourceFolderInput");
const sourceBrowseButton = document.getElementById("sourceBrowse");
const versionInput = document.getElementById("versionInput");
const runReplaceButton = document.getElementById("runReplace");
const replaceStatusEl = document.getElementById("replaceStatus");
const replaceLogEl = document.getElementById("replaceLog");

let currentRoot = null;
let groupedData = [];
let selectedGroups = new Set();
let selectedPrefixes = new Set();
let searchKeyword = "";
let selectedTargetPrefix = null;

const DEFAULT_SOURCE_FOLDER = "\\\\192.168.11.3\\xxx\\xxx\\xxx\\3-固件打包\\v3.38\\feature\\HMIS-10657-趋势图改原生\\3.38.10657.22";
const DEFAULT_VERSION = "3.39.10657.1";

const PREFIX_ORDER = ["Scada", "Neutral", "JSCC", "其他"];
const prefixClassName = prefix => {
  const normalized = (prefix || "其他").toLowerCase();
  if (normalized === "其他") {
    return "other";
  }
  return normalized.replace(/[^a-z0-9-]/g, "") || "other";
};

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
      if (checkbox.checked) {
        selectedGroups.add(group.group);
      } else {
        selectedGroups.delete(group.group);
      }
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
    group.items.forEach(item => {
      prefixes.add(item.prefix || "其他");
    });
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

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedPrefixes.has(prefix);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedPrefixes.add(prefix);
      } else {
        selectedPrefixes.delete(prefix);
      }
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
  const visibleItems = visibleGroups.flatMap(group => group.items.filter(item => selectedPrefixes.has(item.prefix || "其他")));

  const filteredItems = visibleItems.filter(item => {
    if (!keyword) {
      return true;
    }
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

    const button = document.createElement("button");
    button.className = "primary";
    button.textContent = "打开";
    button.addEventListener("click", async () => {
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
    actions.appendChild(button);

    card.appendChild(meta);
    card.appendChild(actions);
    versionListEl.appendChild(card);
  });
};

const refreshData = async () => {
  if (!currentRoot) {
    currentRoot = await electronAPI.defaultRoot();
    rootPathEl.textContent = currentRoot;
  }
  groupedData = await electronAPI.scanRoot(currentRoot);
  selectedGroups = new Set(groupedData.map(group => group.group));
  selectedPrefixes = new Set(groupedData.flatMap(group => group.items.map(item => item.prefix || "其他")));
  renderGroups();
  renderPrefixes();
  renderVersions();
};

selectRootButton.addEventListener("click", async () => {
  const selected = await electronAPI.selectRoot();
  if (selected) {
    currentRoot = selected;
    rootPathEl.textContent = selected;
    await refreshData();
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
    panel.classList.toggle("active", panel.id === `tab${targetTab[0].toUpperCase()}${targetTab.slice(1)}`);
  });
};

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    setActiveTab(tab.dataset.tab);
  });
});

sourceFolderInput.value = DEFAULT_SOURCE_FOLDER;
versionInput.value = DEFAULT_VERSION;
selectedTargetPrefix = null;

sourceBrowseButton.addEventListener("click", async () => {
  const selected = await electronAPI.selectFolder();
  if (selected) {
    sourceFolderInput.value = selected;
  }
});

const renderReplaceLogs = logs => {
  replaceLogEl.textContent = logs.length ? logs.join("\n") : "暂无日志输出。";
};

runReplaceButton.addEventListener("click", async () => {
  const sourceFolder = sourceFolderInput.value.trim() || DEFAULT_SOURCE_FOLDER;
  const version = versionInput.value.trim() || DEFAULT_VERSION;
  replaceStatusEl.textContent = "正在执行...";
  replaceStatusEl.classList.remove("error");
  runReplaceButton.disabled = true;
  renderReplaceLogs([]);

  try {
    const result = await electronAPI.replaceFirmwareFiles({
      sourceFolder,
      version,
      targetPrefix: selectedTargetPrefix
    });
    replaceStatusEl.textContent = result.message || (result.success ? "执行完成" : "执行失败");
    replaceStatusEl.classList.toggle("error", !result.success);
    renderReplaceLogs(result.logs || []);
  } catch (error) {
    replaceStatusEl.textContent = "执行失败";
    replaceStatusEl.classList.add("error");
    renderReplaceLogs([`执行失败: ${error.message}`]);
  } finally {
    runReplaceButton.disabled = false;
  }
});

refreshData();
