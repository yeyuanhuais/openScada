const { DEFAULT_SOURCE_FOLDER, DEFAULT_VERSION } = require("./config");

let store = null;

const initializeStore = async () => {
  const { default: Store } = await import("electron-store");
  store = new Store({
    defaults: {
      rootPath: "",
      sourceFolder: DEFAULT_SOURCE_FOLDER,
      version: DEFAULT_VERSION,
      extractFolder: "",
      versionSearchKeyword: "",
      versionSelectedPrefix: "",
      versionSelectedGroup: "",
      versionFiltersCollapsed: false,
    },
  });

  return store;
};

const getStore = () => store;

module.exports = {
  getStore,
  initializeStore,
};