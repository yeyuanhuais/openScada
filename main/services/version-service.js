const fs = require("fs/promises");
const path = require("path");

const { EXECUTABLE_NAME, PREFIXES } = require("../config");

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
  const match = reg.exec(value);
  return (match && match[1]) || "其他";
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

const compareVersions = (left, right) => {
  const leftParts = (left || "").split(".").map(Number);
  const rightParts = (right || "").split(".").map(Number);

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index] || 0;
    const rightPart = rightParts[index] || 0;
    if (leftPart !== rightPart) return leftPart - rightPart;
  }

  return 0;
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
    const prefix = detectPrefix(entry.name);
    const label = version || entry.name;
    const item = { label, version, group, prefix, exePath, folderPath: entryPath };

    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(item);
  }

  return Array.from(groups.entries())
    .map(([group, items]) => ({
      group,
      items: items.sort((left, right) => compareVersions(left.version, right.version) || left.label.localeCompare(right.label, "zh-CN")),
    }))
    .sort((left, right) => compareVersions(left.group, right.group) || left.group.localeCompare(right.group, "zh-CN"));
};

module.exports = {
  parseTargetVersion,
  scanRoot,
  compareVersions,
};
