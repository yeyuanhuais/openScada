const rootPathEl = document.getElementById("rootPath");
const groupFiltersEl = document.getElementById("groupFilters");
const prefixFiltersEl = document.getElementById("prefixFilters");
const versionListEl = document.getElementById("versionList");
const searchInputEl = document.getElementById("searchInput");
const selectRootButton = document.getElementById("selectRoot");
const refreshButton = document.getElementById("refresh");

let currentRoot = null;
let groupedData = [];
let selectedGroups = new Set();
let selectedPrefixes = new Set();
let searchKeyword = "";

const PREFIX_ORDER = ["Scada", "Neutral", "JSCC", "其他"];
const prefixClassName = (prefix) => {
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

  groupedData.forEach((group) => {
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
  groupedData.forEach((group) => {
    group.items.forEach((item) => {
      prefixes.add(item.prefix || "其他");
    });
  });

  const sortedPrefixes = Array.from(prefixes).sort((a, b) => {
    const indexA = PREFIX_ORDER.indexOf(a);
    const indexB = PREFIX_ORDER.indexOf(b);
    if (indexA !== -1 || indexB !== -1) {
      return (indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA)
        - (indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB);
    }
    return a.localeCompare(b, "zh-CN");
  });

  if (sortedPrefixes.length === 0) {
    prefixFiltersEl.innerHTML = '<div class="empty">暂无前缀</div>';
    return;
  }

  sortedPrefixes.forEach((prefix) => {
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
  const visibleGroups = groupedData.filter((group) => selectedGroups.has(group.group));
  const visibleItems = visibleGroups.flatMap((group) =>
    group.items.filter((item) => selectedPrefixes.has(item.prefix || "其他"))
  );

  const filteredItems = visibleItems.filter((item) => {
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

  filteredItems.forEach((item) => {
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
    button.textContent = "打开";
    button.addEventListener("click", async () => {
      await window.scadaApi.launchExe(item.exePath);
    });

    card.appendChild(meta);
    card.appendChild(button);
    versionListEl.appendChild(card);
  });
};

const refreshData = async () => {
  if (!currentRoot) {
    currentRoot = await window.scadaApi.defaultRoot();
    rootPathEl.textContent = currentRoot;
  }
  groupedData = await window.scadaApi.scanRoot(currentRoot);
  selectedGroups = new Set(groupedData.map((group) => group.group));
  selectedPrefixes = new Set(
    groupedData.flatMap((group) => group.items.map((item) => item.prefix || "其他"))
  );
  renderGroups();
  renderPrefixes();
  renderVersions();
};

selectRootButton.addEventListener("click", async () => {
  const selected = await window.scadaApi.selectRoot();
  if (selected) {
    currentRoot = selected;
    rootPathEl.textContent = selected;
    await refreshData();
  }
});

refreshButton.addEventListener("click", async () => {
  await refreshData();
});

searchInputEl.addEventListener("input", (event) => {
  searchKeyword = event.target.value || "";
  renderVersions();
});

refreshData();
