import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createCiBundle, parseCiBundle, renderEnvFile, setupCiInjection } from "../src/ci.js";

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "keyblind-ci-"));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  return repo;
}

describe("CI bundle", () => {
  it("round-trips secrets through encryption", () => {
    const bundle = createCiBundle("correct horse battery staple", [
      { name: "OPENAI_API_KEY", value: "sk-secret-123" },
      { name: "DATABASE_URL", value: "postgres://user:pass@host/db" },
    ]);
    expect(bundle).toContain("keyblind-ci-v1");

    const secrets = parseCiBundle(bundle, "correct horse battery staple");
    expect(secrets).toEqual([
      { name: "OPENAI_API_KEY", value: "sk-secret-123" },
      { name: "DATABASE_URL", value: "postgres://user:pass@host/db" },
    ]);
  });

  it("produces different ciphertext each export (random salt + IV)", () => {
    const secrets = [{ name: "A", value: "1" }];
    expect(createCiBundle("pw", secrets)).not.toBe(createCiBundle("pw", secrets));
  });

  it("rejects a wrong passphrase", () => {
    const bundle = createCiBundle("right-pass", [{ name: "A", value: "1" }]);
    expect(() => parseCiBundle(bundle, "wrong-pass")).toThrow(/wrong passphrase|corrupted/);
  });

  it("rejects tampered ciphertext", () => {
    const bundle = createCiBundle("pw", [{ name: "A", value: "1" }]);
    const obj = JSON.parse(bundle);
    const data = Buffer.from(obj.data, "base64");
    data[0] ^= 0xff;
    obj.data = data.toString("base64");
    expect(() => parseCiBundle(JSON.stringify(obj), "pw")).toThrow();
  });

  it("rejects non-JSON input", () => {
    expect(() => parseCiBundle("not json", "pw")).toThrow(/not valid JSON/);
  });
});

describe("renderEnvFile", () => {
  it("formats single-line values as NAME=value", () => {
    const out = renderEnvFile([
      { name: "API_KEY", value: "abc123" },
      { name: "URL", value: "https://x/y?z=1" },
    ]);
    expect(out).toBe("API_KEY=abc123\nURL=https://x/y?z=1\n");
  });

  it("uses heredoc syntax for multi-line values", () => {
    const out = renderEnvFile([{ name: "CERT", value: "line1\nline2\n" }]);
    expect(out).toMatch(/^CERT<<KEYBLIND_[0-9a-f]+$/m);
    expect(out).toContain("line1\nline2");
  });

  it("skips secrets with invalid names or null bytes", () => {
    const out = renderEnvFile([
      { name: "BAD=NAME", value: "x" },
      { name: "OK", value: "y" },
      { name: "NULL", value: "a\0b" },
    ]);
    expect(out).toBe("OK=y\n");
  });
});

describe("setupCiInjection", () => {
  it("writes a GitHub Actions workflow for injection", () => {
    const repo = makeRepo();
    const workflowPath = setupCiInjection(repo);
    expect(workflowPath).toBe(path.join(repo, ".github", "workflows", "keyblind-ci.yml"));
    expect(fs.existsSync(workflowPath)).toBe(true);
    const content = fs.readFileSync(workflowPath, "utf-8");
    expect(content).toContain("keyblind ci inject");
    expect(content).toContain("KEYBLIND_CI_BUNDLE");
    expect(content).toContain("GITHUB_ENV");
    fs.rmSync(repo, { recursive: true, force: true });
  });
});
