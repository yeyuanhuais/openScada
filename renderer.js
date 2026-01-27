const rootPathEl = document.getElementById("rootPath");
const groupFiltersEl = document.getElementById("groupFilters");
const versionListEl = document.getElementById("versionList");
const selectRootButton = document.getElementById("selectRoot");
const refreshButton = document.getElementById("refresh");

let currentRoot = null;
let groupedData = [];
let selectedGroups = new Set();

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

const renderVersions = () => {
  versionListEl.innerHTML = "";
  const visibleGroups = groupedData.filter((group) => selectedGroups.has(group.group));
  if (visibleGroups.length === 0) {
    versionListEl.innerHTML = '<div class="empty">请选择版本分类</div>';
    return;
  }

  visibleGroups.forEach((group) => {
    group.items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "version-item";

      const info = document.createElement("div");
      info.className = "info";
      info.textContent = item.label;

      const button = document.createElement("button");
      button.textContent = "打开";
      button.addEventListener("click", async () => {
        await window.scadaApi.launchExe(item.exePath);
      });

      card.appendChild(info);
      card.appendChild(button);
      versionListEl.appendChild(card);
    });
  });
};

const refreshData = async () => {
  if (!currentRoot) {
    groupedData = [];
    selectedGroups = new Set();
    renderGroups();
    renderVersions();
    return;
  }
  groupedData = await window.scadaApi.scanRoot(currentRoot);
  selectedGroups = new Set(groupedData.map((group) => group.group));
  renderGroups();
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

refreshData();
