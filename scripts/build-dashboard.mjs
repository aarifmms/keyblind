// Build the dashboard as a static export and copy it into dist/dashboard/ so
// the local keyblind server can serve it same-origin with the REST API.
import { execSync } from "node:child_process";
import { cpSync, rmSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dashboardDir = path.join(root, "dashboard");
const outDir = path.join(dashboardDir, "out");
const destDir = path.join(root, "dist", "dashboard");

if (!existsSync(path.join(dashboardDir, "node_modules"))) {
  console.error("dashboard/node_modules not found. Run `cd dashboard && npm install` first.");
  process.exit(1);
}

console.log("Building dashboard static export...");
execSync("npm run build", { cwd: dashboardDir, stdio: "inherit" });

rmSync(destDir, { recursive: true, force: true });
mkdirSync(path.dirname(destDir), { recursive: true });
cpSync(outDir, destDir, { recursive: true });
console.log(`Dashboard copied to ${path.relative(root, destDir)}`);
