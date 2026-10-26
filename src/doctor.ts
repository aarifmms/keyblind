import { isInitialized, getKey, listSecrets, checkExpired, resolveSecret, listRotationNeeded, listPendingRevocations, listRevocationsDue } from "./vault.js";
import { getBackend, listAvailableBackends } from "./backends.js";
import { getLicenseInfo, getSecretLimit, tierLabel } from "./license.js";
import { readConfig } from "./config.js";
import { execFileSync } from "node:child_process";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

interface CheckResult {
  name: string;
  status: "ok" | "warn" | "error";
  detail: string;
}

export function runDoctor(): CheckResult[] {
  const checks: CheckResult[] = [];

  // 1. Vault initialization
  if (isInitialized()) {
    checks.push({ name: "Vault initialized", status: "ok", detail: "~/.keyblind/ exists and has a valid key" });
  } else {
    checks.push({ name: "Vault initialized", status: "error", detail: "Not initialized. Run: keyblind init" });
  }

  // 2. Key access
  try {
    getKey();
    checks.push({ name: "Encryption key", status: "ok", detail: "Machine-identity-bound key is readable" });
  } catch {
    checks.push({ name: "Encryption key", status: "error", detail: "Cannot read key. Vault may be corrupted. Try: keyblind init" });
  }

  // 3. Secret count vs limit
  if (isInitialized()) {
    const names = listSecrets();
    const limit = getSecretLimit();
    const pct = limit === Infinity ? 0 : Math.round((names.length / limit) * 100);
    if (limit === Infinity) {
      checks.push({ name: "Secret count", status: "ok", detail: `${names.length} secrets (unlimited)` });
    } else if (names.length >= limit) {
      checks.push({ name: "Secret count", status: "error", detail: `${names.length}/${limit} — limit reached. Upgrade to Pro for unlimited.` });
    } else if (pct > 80) {
      checks.push({ name: "Secret count", status: "warn", detail: `${names.length}/${limit} — ${pct}% used. Consider upgrading.` });
    } else {
      checks.push({ name: "Secret count", status: "ok", detail: `${names.length}/${limit}` });
    }
  }

  // 4. Expired secrets
  if (isInitialized()) {
    try {
      const expired = checkExpired();
      if (expired.length === 0) {
        checks.push({ name: "Expired secrets", status: "ok", detail: "No expired secrets" });
      } else {
        checks.push({ name: "Expired secrets", status: "warn", detail: `${expired.length} expired: ${expired.join(", ")}. Run: keyblind rotate <name>` });
      }
    } catch {
      checks.push({ name: "Expired secrets", status: "warn", detail: "Could not check expiry" });
    }
  }

  // 5. License
  try {
    const info = getLicenseInfo();
    if (info) {
      const expDate = new Date(info.exp + "T23:59:59Z");
      const daysLeft = Math.ceil((expDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      if (info.tier === "free") {
        checks.push({ name: "License", status: "ok", detail: `Free tier (${info.email})` });
      } else if (daysLeft < 30) {
        checks.push({ name: "License", status: "warn", detail: `${tierLabel(info.tier)} (${info.email}) — expires in ${daysLeft} days` });
      } else {
        checks.push({ name: "License", status: "ok", detail: `${tierLabel(info.tier)} (${info.email}) — expires ${info.exp}` });
      }
    } else {
      checks.push({ name: "License", status: "ok", detail: "Free tier (not activated). 5 secret limit." });
    }
  } catch {
    checks.push({ name: "License", status: "ok", detail: "Free tier" });
  }

  // 6. Backend connectivity
  try {
    const backends = listAvailableBackends();
    const current = getBackend();
    const available = backends.filter(b => b.available);
    checks.push({
      name: "Backend",
      status: "ok",
      detail: `Current: ${current.name}. Available: ${available.map(b => b.name).join(", ")}`,
    });
  } catch {
    checks.push({ name: "Backend", status: "warn", detail: "Could not check backends" });
  }

  // 7. Disk space for vault
  try {
    const vaultDir = path.join(os.homedir(), ".keyblind");
    // Check disk space via statfs-like approach
    const free = getDiskFree(vaultDir);
    if (free === null) {
      checks.push({ name: "Disk space", status: "ok", detail: "Could not check (non-critical)" });
    } else if (free < 10 * 1024 * 1024) {
      checks.push({ name: "Disk space", status: "warn", detail: `Low: ${formatBytes(free)} free on vault disk` });
    } else {
      checks.push({ name: "Disk space", status: "ok", detail: `${formatBytes(free)} free` });
    }
  } catch {
    checks.push({ name: "Disk space", status: "ok", detail: "Could not check (non-critical)" });
  }

  // 8. Project config
  const config = readConfig();
  if (config) {
    const parts: string[] = [];
    if (config.backend) parts.push(`backend=${config.backend}`);
    if (config.projectName) parts.push(`project=${config.projectName}`);
    if (config.expiryDays) parts.push(`expiry=${config.expiryDays}d`);
    checks.push({ name: "Project config", status: "ok", detail: `.keyblind found (${parts.join(", ") || "minimal"})` });
  } else {
    checks.push({ name: "Project config", status: "ok", detail: "No .keyblind file (optional)" });
  }

  // 9. Sandbox audit — check if any .env has unsandboxed patterns
  if (fs.existsSync(".env")) {
    const envContent = fs.readFileSync(".env", "utf8");
    const hasRealSecrets = /^(?!#)(?!.*sandbox_)[A-Z_]+=.*(?:sk-|ghp_|xox[baprs]-|AKIA|ya29\.|SG\.|eyJ)/m.test(envContent);
    if (hasRealSecrets) {
      checks.push({ name: ".env safety", status: "warn", detail: ".env may contain real API keys. Run: keyblind sandbox" });
    } else {
      checks.push({ name: ".env safety", status: "ok", detail: "No obvious real secrets detected in .env" });
    }
  } else {
    checks.push({ name: ".env safety", status: "ok", detail: "No .env file in current directory" });
  }

  // 10. Backup safety — key material must not leak into backups or git
  if (isInitialized()) {
    checks.push(...backupSafetyChecks());
  }

  // 11. Secret rotation — surface secrets that have not been rotated in 90 days
  if (isInitialized()) {
    try {
      const stale = listRotationNeeded(90);
      if (stale.length === 0) {
        checks.push({ name: "Secret rotation", status: "ok", detail: "No secrets older than 90 days" });
      } else {
        const oldest = stale.slice(0, 5).map((s) => `${s.name} (${s.ageDays}d)`).join(", ");
        const more = stale.length > 5 ? ` +${stale.length - 5} more` : "";
        checks.push({ name: "Secret rotation", status: "warn", detail: `${stale.length} secret${stale.length === 1 ? "" : "s"} not rotated in 90+ days: ${oldest}${more}. Run: keyblind rotate <name>` });
      }
    } catch {
      checks.push({ name: "Secret rotation", status: "ok", detail: "Could not check rotation age" });
    }
  }

  // 12. Rotation health — pending revocations from provider-native rotation
  if (isInitialized()) {
    try {
      const pending = listPendingRevocations();
      const due = listRevocationsDue();
      const failed = pending.filter((r) => r.status === "failed");
      const awaiting = pending.filter((r) => r.status === "pending");
      if (pending.length === 0) {
        checks.push({ name: "Rotation health", status: "ok", detail: "No pending revocations" });
      } else if (due.length > 0) {
        checks.push({ name: "Rotation health", status: "warn", detail: `${due.length} revocation${due.length === 1 ? "" : "s"} past the rollback window. Run: keyblind rotate --finalize` });
      } else if (failed.length > 0) {
        checks.push({ name: "Rotation health", status: "warn", detail: `${failed.length} revocation${failed.length === 1 ? "" : "s"} failed. Review with: keyblind rotate --pending` });
      } else {
        checks.push({ name: "Rotation health", status: "ok", detail: `${awaiting.length} revocation${awaiting.length === 1 ? "" : "s"} awaiting rollback window` });
      }
    } catch {
      checks.push({ name: "Rotation health", status: "ok", detail: "Could not check rotation state" });
    }
  }

  return checks;
}

// --- Backup safety ---

const SENSITIVE_VAULT_FILES = new Set(["vault.db", ".keyblind.key"]);

export function gitTrackedSensitiveFiles(dir: string = process.cwd()): string[] {
  try {
    const out = execFileSync("git", ["ls-files"], {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 3000,
    });
    return out
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.length > 0 && SENSITIVE_VAULT_FILES.has(path.basename(f)));
  } catch {
    // Not a git repository, or git unavailable.
    return [];
  }
}

function dirInsideGit(dir: string): boolean {
  let cur = dir;
  for (;;) {
    if (fs.existsSync(path.join(cur, ".git"))) return true;
    const parent = path.dirname(cur);
    if (parent === cur) return false;
    cur = parent;
  }
}

export function backupSafetyChecks(): CheckResult[] {
  const checks: CheckResult[] = [];
  const vaultDir = path.join(os.homedir(), ".keyblind");

  if (fs.existsSync(path.join(vaultDir, ".keyblind.key"))) {
    checks.push({
      name: "Key storage",
      status: "warn",
      detail: "Master key is in a plaintext file (~/.keyblind/.keyblind.key). Backing up ~/.keyblind/ would copy the key alongside the vault.",
    });
  } else {
    checks.push({
      name: "Key storage",
      status: "ok",
      detail: "Master key is in the OS keyring (no plaintext key file)",
    });
  }

  if (dirInsideGit(vaultDir)) {
    checks.push({
      name: "Vault in git repo",
      status: "warn",
      detail: "~/.keyblind/ is inside a git working tree. Add it to .gitignore so the vault is never committed.",
    });
  }

  const tracked = gitTrackedSensitiveFiles();
  if (tracked.length > 0) {
    checks.push({
      name: "Git-tracked vault files",
      status: "warn",
      detail: `Tracked by git: ${tracked.join(", ")}. Run: git rm --cached ${tracked.join(" ")}`,
    });
  }

  return checks;
}

function getDiskFree(dirPath: string): number | null {
  try {
    // macOS/Linux compatible — try various paths
    const testPath = path.resolve(dirPath);
    // Simple approach: just check we can stat the directory
    fs.statSync(testPath);
    // Can't easily get disk free in cross-platform Node without extra deps.
    // Return null to indicate "can't check" rather than erroring.
    return null;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}
