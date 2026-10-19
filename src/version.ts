import { readFileSync } from "node:fs";

let cached = "";

export function getVersion(): string {
  if (cached) return cached;
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    cached = pkg.version || "0.0.0";
  } catch {
    cached = "0.0.0";
  }
  return cached;
}
