import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Cross-platform secure storage for the wrapped master key. Each backend keeps
// the wrapped key out of a plaintext file by delegating to the OS keyring:
//   macOS   — Keychain (`security` CLI)
//   Linux   — libsecret (`secret-tool` CLI, Secret Service)
//   Windows — DPAPI (PowerShell ProtectedData, blob stored in a 0600 file)
// When no backend is available the caller falls back to the legacy key file.

const SERVICE = "keyblind";

function disabled(): boolean {
  return process.env.KEYBLIND_DISABLE_KEYCHAIN === "1";
}

// ── macOS Keychain ──────────────────────────────────────────────────────────

function macGet(account: string): string | null {
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

function macSet(account: string, value: string): void {
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

function macDelete(account: string): void {
  try {
    execFileSync("security", ["delete-generic-password", "-s", SERVICE, "-a", account], { stdio: "ignore" });
  } catch {
    // no existing item
  }
}

// ── Linux libsecret ─────────────────────────────────────────────────────────

function linuxGet(account: string): string | null {
  try {
    const out = execFileSync(
      "secret-tool",
      ["lookup", "service", SERVICE, "account", account],
      { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"], timeout: 5000 },
    );
    return out.trim() || null;
  } catch {
    return null;
  }
}

function linuxSet(account: string, value: string): void {
  execFileSync(
    "secret-tool",
    ["store", "--label=Keyblind", "service", SERVICE, "account", account],
    { input: value, stdio: ["pipe", "ignore", "pipe"], timeout: 5000 },
  );
}

function linuxDelete(account: string): void {
  try {
    execFileSync("secret-tool", ["clear", "service", SERVICE, "account", account], { stdio: "ignore" });
  } catch {
    // `clear` is unsupported on older libsecret, or no item exists
  }
}

// ── Windows DPAPI ───────────────────────────────────────────────────────────

function dpapiFile(account: string): string {
  // Account names (e.g. "project:name") are hex-encoded so they stay
  // filename-safe on Windows.
  const enc = Buffer.from(account, "utf-8").toString("hex");
  return path.join(os.homedir(), ".keyblind", `.keyblind.${enc}.dpapi`);
}

const PROTECT_SCRIPT = [
  "Add-Type -AssemblyName System.Security",
  "$v = [Console]::In.ReadToEnd()",
  "[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($v), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser))",
].join("; ");

const UNPROTECT_SCRIPT = [
  "Add-Type -AssemblyName System.Security",
  "$v = [Console]::In.ReadToEnd()",
  "[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($v.Trim()), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser))",
].join("; ");

function winRun(script: string, input: string): string {
  return execFileSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { input, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 15000, windowsHide: true },
  ).trim();
}

function winGet(account: string): string | null {
  const file = dpapiFile(account);
  if (!fs.existsSync(file)) return null;
  try {
    const blob = fs.readFileSync(file, "utf-8").trim();
    return winRun(UNPROTECT_SCRIPT, blob) || null;
  } catch {
    return null;
  }
}

function winSet(account: string, value: string): void {
  const file = dpapiFile(account);
  fs.mkdirSync(path.dirname(file), { mode: 0o700, recursive: true });
  const blob = winRun(PROTECT_SCRIPT, value);
  fs.writeFileSync(file, blob, { mode: 0o600 });
}

function winDelete(account: string): void {
  try {
    fs.rmSync(dpapiFile(account), { force: true });
  } catch {
    // no file
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export function keychainAvailable(): boolean {
  if (disabled()) return false;
  if (process.platform === "darwin") {
    try {
      execFileSync("security", ["help"], { stdio: "ignore", timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }
  if (process.platform === "linux") {
    // `secret-tool` has no --version flag (it exits 2 for any help/version
    // probe), so presence is detected via `command -v`.
    try {
      execFileSync("sh", ["-c", "command -v secret-tool"], { stdio: "ignore", timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }
  if (process.platform === "win32") return true; // PowerShell DPAPI is always present
  return false;
}

export function keychainGet(account: string): string | null {
  if (disabled()) return null;
  if (process.platform === "darwin") return macGet(account);
  if (process.platform === "linux") return linuxGet(account);
  if (process.platform === "win32") return winGet(account);
  return null;
}

export function keychainSet(account: string, value: string): void {
  if (disabled()) return;
  if (process.platform === "darwin") return macSet(account, value);
  if (process.platform === "linux") return linuxSet(account, value);
  if (process.platform === "win32") return winSet(account, value);
}

export function keychainDelete(account: string): void {
  if (disabled()) return;
  if (process.platform === "darwin") return macDelete(account);
  if (process.platform === "linux") return linuxDelete(account);
  if (process.platform === "win32") return winDelete(account);
}
