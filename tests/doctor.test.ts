import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const state = vi.hoisted(() => ({ tmpDir: "" }));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    homedir: () => state.tmpDir,
    default: { ...actual.default, homedir: () => state.tmpDir },
  };
});

import { backupSafetyChecks, gitTrackedSensitiveFiles } from "../src/doctor.js";

beforeEach(() => {
  state.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "keyblind-doctor-"));
});

afterEach(() => {
  fs.rmSync(state.tmpDir, { recursive: true, force: true });
});

function findCheck(checks: { name: string; status: string }[], name: string) {
  return checks.find((c) => c.name === name);
}

describe("backup safety", () => {
  it("warns when the master key is in a plaintext file", () => {
    const vaultDir = path.join(state.tmpDir, ".keyblind");
    fs.mkdirSync(vaultDir, { recursive: true });
    fs.writeFileSync(path.join(vaultDir, ".keyblind.key"), "wrapped-key");

    const check = findCheck(backupSafetyChecks(), "Key storage");
    expect(check?.status).toBe("warn");
  });

  it("reports ok when there is no plaintext key file", () => {
    const vaultDir = path.join(state.tmpDir, ".keyblind");
    fs.mkdirSync(vaultDir, { recursive: true });

    const check = findCheck(backupSafetyChecks(), "Key storage");
    expect(check?.status).toBe("ok");
  });

  it("warns when the vault dir is inside a git working tree", () => {
    const vaultDir = path.join(state.tmpDir, ".keyblind");
    fs.mkdirSync(vaultDir, { recursive: true });
    fs.mkdirSync(path.join(state.tmpDir, ".git"));

    const check = findCheck(backupSafetyChecks(), "Vault in git repo");
    expect(check?.status).toBe("warn");
  });
});

describe("gitTrackedSensitiveFiles", () => {
  it("lists tracked vault.db and .keyblind.key files", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "keyblind-git-"));
    execFileSync("git", ["init", "-q"], { cwd: repo });
    fs.writeFileSync(path.join(repo, "vault.db"), "x");
    fs.writeFileSync(path.join(repo, ".keyblind.key"), "x");
    fs.writeFileSync(path.join(repo, "README.md"), "x");
    execFileSync("git", ["add", "vault.db", ".keyblind.key", "README.md"], { cwd: repo });

    const tracked = gitTrackedSensitiveFiles(repo).sort();
    expect(tracked).toEqual([".keyblind.key", "vault.db"]);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("returns empty when no sensitive files are tracked", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "keyblind-git-"));
    execFileSync("git", ["init", "-q"], { cwd: repo });
    fs.writeFileSync(path.join(repo, "README.md"), "x");
    execFileSync("git", ["add", "README.md"], { cwd: repo });

    expect(gitTrackedSensitiveFiles(repo)).toEqual([]);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("returns empty when not in a git repository", () => {
    expect(gitTrackedSensitiveFiles(state.tmpDir)).toEqual([]);
  });
});
