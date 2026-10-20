import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { scanFiles, scanTrackedFiles, scanRepoHistory, setupCi } from "../src/hook.js";

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "keyblind-scan-"));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repo });
  return repo;
}

function commitAll(repo: string, message: string): void {
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["commit", "-q", "-m", message], { cwd: repo });
}

describe("scanFiles", () => {
  it("detects a secret in a file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "keyblind-scan-"));
    const file = path.join(dir, "config.js");
    fs.writeFileSync(file, 'const key = "sk-abcdefghijklmnopqrstuvwxyz";\n');
    const findings = scanFiles([file]);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].pattern).toContain("OpenAI");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("skips comment lines", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "keyblind-scan-"));
    const file = path.join(dir, "x.js");
    fs.writeFileSync(file, '// sk-abcdefghijklmnopqrstuvwxyz\n');
    expect(scanFiles([file])).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("scanTrackedFiles", () => {
  it("scans tracked files and skips test files", () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "app.js"), 'const k = "sk-abcdefghijklmnopqrstuvwxyz";\n');
    fs.writeFileSync(path.join(repo, "app.test.js"), 'const k = "sk-abcdefghijklmnopqrstuvwxyz";\n');
    commitAll(repo, "add app");

    const findings = scanTrackedFiles(repo);
    expect(findings.map((f) => f.file)).toEqual(["app.js"]);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("returns empty when not in a git repository", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "keyblind-scan-"));
    expect(scanTrackedFiles(dir)).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("scanRepoHistory", () => {
  it("finds a secret that was committed and later removed", () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "app.js"), 'const k = "sk-abcdefghijklmnopqrstuvwxyz";\n');
    commitAll(repo, "add secret");
    fs.writeFileSync(path.join(repo, "app.js"), "const k = null;\n");
    commitAll(repo, "remove secret");

    const findings = scanRepoHistory(50, repo);
    const matches = findings.filter((f) => f.file === "app.js");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].commit).toBeTruthy();
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("returns empty for a clean history", () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "app.js"), "const k = null;\n");
    commitAll(repo, "clean");

    expect(scanRepoHistory(50, repo)).toEqual([]);
    fs.rmSync(repo, { recursive: true, force: true });
  });
});

describe("setupCi", () => {
  it("writes a GitHub Actions workflow", () => {
    const repo = makeRepo();
    const workflowPath = setupCi(repo);
    expect(workflowPath).toBe(path.join(repo, ".github", "workflows", "keyblind.yml"));
    expect(fs.existsSync(workflowPath)).toBe(true);
    const content = fs.readFileSync(workflowPath, "utf-8");
    expect(content).toContain("keyblind scan-repo");
    expect(content).toContain("pull_request");
    fs.rmSync(repo, { recursive: true, force: true });
  });
});
