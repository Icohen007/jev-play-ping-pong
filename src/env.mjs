import fs from "node:fs";

export function parseEnv(source) {
  const values = {};

  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) {
      throw new Error(`Unsupported .env syntax on line ${index + 1}.`);
    }

    let value = match[2];
    if (value.length >= 2 && value[0] === value.at(-1) && ['"', "'"].includes(value[0])) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }

  return values;
}

export function readEnvFile(path) {
  const descriptor = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const info = fs.fstatSync(descriptor);
    if (!info.isFile() || info.uid !== process.getuid()) {
      throw new Error("The env file must be a regular file owned by the current user.");
    }
    if (info.size > 65_536) {
      throw new Error("The env file is unexpectedly large.");
    }

    return {
      values: parseEnv(fs.readFileSync(descriptor, "utf8")),
      permissionsTooOpen: (info.mode & 0o077) !== 0,
    };
  } finally {
    fs.closeSync(descriptor);
  }
}
