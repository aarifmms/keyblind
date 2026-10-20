import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Unlike keychain.test.ts, node:child_process is intentionally NOT mocked here —
// this test exercises the real PowerShell ProtectedData path on Windows. It is
// skipped everywhere else, so the existing ubuntu/macos CI jobs are unaffected.
const state = vi.hoisted(() => ({ tmpDir: "" }));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    homedir: () => state.tmpDir,
    default: { ...actual.default, homedir: () => state.tmpDir },
  };
});

import { keychainAvailable, keychainGet, keychainSet, keychainDelete } from "../src/keychain.js";

beforeEach(() => {
  state.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "keyblind-dpapi-it-"));
});

afterEach(() => {
  fs.rmSync(state.tmpDir, { recursive: true, force: true });
});

describe.skipIf(process.platform !== "win32")("Windows DPAPI (real PowerShell)", () => {
  it("round-trips a value through ProtectedData and deletes it", () => {
    const account = `itest-${Date.now()}`;

    expect(keychainAvailable()).toBe(true);

    keychainSet(account, "dpapi-secret-value");
    expect(keychainGet(account)).toBe("dpapi-secret-value");

    // The wrapped key is stored as a DPAPI-protected blob, not plaintext.
    const dir = path.join(state.tmpDir, ".keyblind");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".dpapi"));
    expect(files.length).toBeGreaterThan(0);
    const blob = fs.readFileSync(path.join(dir, files[0]), "utf-8");
    expect(blob).not.toContain("dpapi-secret-value");

    keychainDelete(account);
    expect(keychainGet(account)).toBeNull();
  });
});
