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

module.exports = {
  DEFAULT_SOURCE_FOLDER,
  DEFAULT_VERSION,
  EXECUTABLE_NAME,
  PREFIXES,
  REPLACE_FOLDERS,
  REPLACE_PATTERNS,
};