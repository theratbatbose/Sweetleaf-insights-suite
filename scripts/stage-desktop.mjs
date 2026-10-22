// Prepares desktop/app/ for electron-builder: the built server and UI, the Electron entry point,
// and only the runtime dependencies (no build tools).
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktop = path.join(root, "desktop");
const stage = path.join(desktop, "app");

if (!existsSync(path.join(root, "build", "server.mjs")) || !existsSync(path.join(root, "dist", "index.html"))) {
  console.error("Build Sweetleaf first: run `npm run build` in the project folder.");
  process.exit(1);
}

rmSync(stage, { recursive: true, force: true });
mkdirSync(path.join(stage, "build"), { recursive: true });
cpSync(path.join(root, "build", "server.mjs"), path.join(stage, "build", "server.mjs"));
cpSync(path.join(root, "dist"), path.join(stage, "dist"), { recursive: true });
cpSync(path.join(desktop, "main.mjs"), path.join(stage, "main.mjs"));
cpSync(path.join(desktop, "assets", "icon.png"), path.join(stage, "icon.png"));

const rootPackage = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
// The UI libraries are already compiled into dist/; only the server's packages are needed at runtime.
const browserOnly = new Set(["react", "react-dom", "lucide-react"]);
const dependencies = Object.fromEntries(Object.entries(rootPackage.dependencies).filter(([name]) => !browserOnly.has(name)));
writeFileSync(path.join(stage, "package.json"), JSON.stringify({
  name: "sweetleaf-suite",
  productName: "Sweetleaf Suite",
  version: rootPackage.version,
  description: "Local-first workbench for qualitative research",
  author: "Sweetleaf Suite",
  homepage: "https://github.com/theratbatbose/Sweetleaf-insights-suite",
  repository: "github:theratbatbose/Sweetleaf-insights-suite",
  type: "module",
  main: "main.mjs",
  dependencies,
}, null, 2));
cpSync(path.join(root, "package-lock.json"), path.join(stage, "package-lock.json"));
execSync("npm install --omit=dev --no-audit --no-fund --loglevel=error", { cwd: stage, stdio: "inherit" });
console.log(`Staged desktop app in ${stage}`);
