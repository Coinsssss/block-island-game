import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["src", "tests"];
const files = ["playwright.config.js"];

function collectJsFiles(dirPath) {
  return readdirSync(dirPath).flatMap((entry) => {
    const fullPath = join(dirPath, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      return collectJsFiles(fullPath);
    }

    return entry.endsWith(".js") ? [fullPath] : [];
  });
}

for (const root of roots) {
  files.push(...collectJsFiles(resolve(root)));
}

let hasFailure = false;

for (const filePath of files) {
  const result = spawnSync(process.execPath, ["--check", filePath], {
    stdio: "inherit"
  });

  if (result.status !== 0) {
    hasFailure = true;
  }
}

if (hasFailure) {
  process.exit(1);
}

console.log("Syntax check passed for", files.length, "files.");
