import { execSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface ScanFinding {
  file: string;
  line: number;
  match: string;
  pattern: string;
  commit?: string;
}

export const SECRET_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: "OpenAI API Key", regex: /sk-(proj-)?[A-Za-z0-9_-]{20,}/g },
  { name: "GitHub Token", regex: /gh[pousr]_[A-Za-z0-9_]{20,}/g },
  { name: "GitHub PAT", regex: /github_pat_[A-Za-z0-9_]{20,}/g },
  { name: "AWS Access Key", regex: /(?:AKIA|ASIA)[A-Z0-9]{16}/g },
  { name: "Stripe Live Key", regex: /[rs]k_live_[A-Za-z0-9]{20,}/g },
  { name: "Stripe Test Key", regex: /[rs]k_test_[A-Za-z0-9]{20,}/g },
  { name: "Slack Webhook", regex: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_/]+/g },
  { name: "Google API Key", regex: /AIza[0-9A-Za-z_-]{35}/g },
  { name: "Private Key", regex: /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/g },
  { name: "JWT Token", regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: "Generic Password", regex: /(?:password|passwd|pwd)\s*[:=]\s*["'][^\s'"]{8,}["']/gi },
  { name: "Generic Secret", regex: /(?:secret|token|api[_-]?key)\s*[:=]\s*["'][^\s'"]{8,}["']/gi },
  { name: "NPM Token", regex: /npm_[A-Za-z0-9]{36}/g },
  { name: "Basic Auth", regex: /https?:\/\/[^:]+:[^@]+@/g },
];

function scanContent(findings: ScanFinding[], file: string, content: string, commit?: string): void {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments and obvious non-secret lines
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
      continue;
    }

    for (const { name, regex } of SECRET_PATTERNS) {
      regex.lastIndex = 0; // Reset regex state
      let match: RegExpExecArray | null;
      while ((match = regex.exec(line)) !== null) {
        findings.push({
          file,
          line: i + 1,
          match: maskSecret(match[0]),
          pattern: name,
          ...(commit ? { commit } : {}),
        });
      }
    }
  }
}

export function scanFiles(filePaths: string[]): ScanFinding[] {
  const findings: ScanFinding[] = [];

  for (const filePath of filePaths) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      scanContent(findings, filePath, content);
    } catch {
      // Skip unreadable files
    }
  }

  return findings;
}

function maskSecret(value: string): string {
  if (value.length <= 12) return "***";
  return value.slice(0, 6) + "..." + value.slice(-4);
}

export function getStagedFiles(): string[] {
  try {
    const result = execSync("git diff --cached --name-only --diff-filter=ACM", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return result.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function installHook(): string {
  const hooksDir = path.join(process.cwd(), ".git", "hooks");
  if (!fs.existsSync(hooksDir)) {
    throw new Error("Not a git repository (no .git/hooks directory). Run: git init");
  }

  const hookPath = path.join(hooksDir, "pre-commit");
  const hookScript = `#!/usr/bin/env bash
# Keyblind pre-commit hook — detect secrets before committing
# Installed by: keyblind install-hook

if command -v keyblind &>/dev/null; then
  keyblind check-secrets
  exit $?
elif command -v npx &>/dev/null; then
  npx keyblind check-secrets
  exit $?
else
  echo "⚠️  keyblind not found — skipping secret check"
  exit 0
fi
`;

  fs.writeFileSync(hookPath, hookScript, { mode: 0o755 });
  return hookPath;
}

function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return (
    /(^|\/)(tests?|__tests__|spec)(\/|$)/.test(normalized) ||
    /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(normalized)
  );
}

export function checkAndReport(): { found: number; output: string } {
  const files = getStagedFiles().filter((f) => !isTestFile(f));

  if (files.length === 0) {
    return { found: 0, output: "" };
  }

  const findings = scanFiles(files);

  if (findings.length === 0) {
    return { found: 0, output: "" };
  }

  let output = "\n⚠️  KEYBLIND: Possible secrets found in staged files:\n\n";
  for (const f of findings) {
    output += `  ${f.file}:${f.line}  [${f.pattern}]  ${f.match}\n`;
  }
  output += `\n  ${findings.length} potential secret(s) detected.\n`;
  output += "  If these are real secrets, use 'keyblind sandbox' or 'keyblind set'\n";
  output += "  to store them securely before committing.\n";
  output += "  To bypass: git commit --no-verify\n";

  return { found: findings.length, output };
}

// ── Repo-wide scanning (CI) ──────────────────────────────────────────────────

export function getTrackedFiles(dir: string = process.cwd()): string[] {
  try {
    const out = execFileSync("git", ["ls-files"], {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 10000,
    });
    return out.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function scanTrackedFiles(dir: string = process.cwd()): ScanFinding[] {
  const findings: ScanFinding[] = [];
  for (const rel of getTrackedFiles(dir).filter((f) => !isTestFile(f))) {
    try {
      scanContent(findings, rel, fs.readFileSync(path.join(dir, rel), "utf-8"));
    } catch {
      // Skip unreadable files
    }
  }
  return findings;
}

// Scans every version of every file in the repository's history. This spawns a
// `git show` per file per commit, so it is intentionally opt-in (`--all`) and
// capped to keep large histories from running forever.
export function scanRepoHistory(maxCommits: number = 500, dir: string = process.cwd()): ScanFinding[] {
  const findings: ScanFinding[] = [];

  let shas: string[];
  try {
    shas = execFileSync("git", ["rev-list", "--all"], {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 10000,
    }).trim().split("\n").filter(Boolean);
  } catch {
    return findings;
  }

  for (const sha of shas.slice(0, maxCommits)) {
    let files: string[];
    try {
      files = execFileSync("git", ["ls-tree", "-r", "--name-only", sha], {
        cwd: dir,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
        timeout: 10000,
      }).trim().split("\n").filter(Boolean);
    } catch {
      continue;
    }

    for (const file of files) {
      if (isTestFile(file)) continue;
      let content: string;
      try {
        content = execFileSync("git", ["show", `${sha}:${file}`], {
          cwd: dir,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "ignore"],
          timeout: 10000,
        });
      } catch {
        continue;
      }
      scanContent(findings, file, content, sha.slice(0, 7));
    }
  }

  return findings;
}

// Writes a GitHub Actions workflow that runs `keyblind scan-repo` on every
// push and pull request, failing the build if a secret is found. CI is the
// enforcement backstop for the (bypassable) pre-commit hook.
export function setupCi(dir: string = process.cwd()): string {
  const workflowsDir = path.join(dir, ".github", "workflows");
  fs.mkdirSync(workflowsDir, { recursive: true });
  const workflowPath = path.join(workflowsDir, "keyblind.yml");
  const yaml = `name: Keyblind secret scan

on: [push, pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npx --yes keyblind scan-repo
`;
  fs.writeFileSync(workflowPath, yaml, { mode: 0o644 });
  return workflowPath;
}
