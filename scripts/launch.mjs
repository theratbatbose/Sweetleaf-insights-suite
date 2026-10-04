// One-click launcher: installs dependencies and builds on first run (or after an update), then starts Sweetleaf.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 10)) {
  console.error(`\n  Sweetleaf needs Node.js 20.10 or newer (you have ${process.versions.node}).`);
  console.error("  Install the LTS version from https://nodejs.org and try again.\n");
  process.exit(1);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (args, label) => {
  console.log(`\n  ${label}…\n`);
  const result = spawnSync(npm, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(`\n  ${label} failed. Check your internet connection (needed only for first-time setup) and try again.\n`);
    process.exit(result.status ?? 1);
  }
};

function newest(dir) {
  let latest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    latest = Math.max(latest, entry.isDirectory() ? newest(full) : statSync(full).mtimeMs);
  }
  return latest;
}

const lockFile = path.join(root, "node_modules", ".package-lock.json");
if (!existsSync(lockFile) || statSync(path.join(root, "package.json")).mtimeMs > statSync(lockFile).mtimeMs) {
  run(["install", "--no-audit", "--no-fund"], "Installing Sweetleaf (first run only, needs internet)");
}

const server = path.join(root, "build", "server.mjs");
const client = path.join(root, "dist", "index.html");
const sources = Math.max(...["src", "server", "shared"].map((dir) => newest(path.join(root, dir))), statSync(path.join(root, "index.html")).mtimeMs);
if (!existsSync(server) || !existsSync(client) || sources > Math.min(statSync(server).mtimeMs, statSync(client).mtimeMs)) {
  run(["run", "build"], "Preparing the app");
}

process.env.SWEETLEAF_OPEN ??= "1";
await import(pathToFileURL(server).href);
