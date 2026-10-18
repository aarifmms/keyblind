import { execFileSync } from "node:child_process";

const SERVICE = "keyblind";

function guarded(): boolean {
  return process.platform === "darwin" && process.env.KEYBLIND_DISABLE_KEYCHAIN !== "1";
}

export function keychainAvailable(): boolean {
  if (!guarded()) return false;
  try {
    execFileSync("security", ["help"], { stdio: "ignore", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export function keychainGet(account: string): string | null {
  if (!guarded()) return null;
  try {
    const out = execFileSync(
      "security",
      ["find-generic-password", "-s", SERVICE, "-a", account, "-w"],
      { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"], timeout: 5000 },
    );
    return out.trim() || null;
  } catch {
    return null;
  }
}

export function keychainSet(account: string, value: string): void {
  if (!guarded()) return;
  try {
    execFileSync("security", ["delete-generic-password", "-s", SERVICE, "-a", account], { stdio: "ignore" });
  } catch {
    // no existing item
  }
  execFileSync(
    "security",
    ["add-generic-password", "-s", SERVICE, "-a", account, "-w", value, "-U"],
    { stdio: "ignore", timeout: 5000 },
  );
}

export function keychainDelete(account: string): void {
  if (!guarded()) return;
  try {
    execFileSync("security", ["delete-generic-password", "-s", SERVICE, "-a", account], { stdio: "ignore" });
  } catch {
    // no existing item
  }
}
