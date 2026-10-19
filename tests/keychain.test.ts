import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const state = vi.hoisted(() => ({ tmpDir: "" }));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    homedir: () => state.tmpDir,
    default: { ...actual.default, homedir: () => state.tmpDir },
  };
});

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
import { keychainAvailable, keychainGet, keychainSet, keychainDelete } from "../src/keychain.js";

const execMock = vi.mocked(execFileSync);
const origPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
const origDisabled = process.env.KEYBLIND_DISABLE_KEYCHAIN;

function setPlatform(p: string): void {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
}

beforeEach(() => {
  state.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "keyblind-keychain-"));
  vi.clearAllMocks();
  delete process.env.KEYBLIND_DISABLE_KEYCHAIN;
});

afterEach(() => {
  Object.defineProperty(process, "platform", origPlatform);
  if (origDisabled === undefined) delete process.env.KEYBLIND_DISABLE_KEYCHAIN;
  else process.env.KEYBLIND_DISABLE_KEYCHAIN = origDisabled;
  fs.rmSync(state.tmpDir, { recursive: true, force: true });
});

describe("keychain", () => {
  it("is a no-op when KEYBLIND_DISABLE_KEYCHAIN=1", () => {
    process.env.KEYBLIND_DISABLE_KEYCHAIN = "1";
    expect(keychainAvailable()).toBe(false);
    expect(keychainGet("default")).toBeNull();
    expect(() => keychainSet("default", "x")).not.toThrow();
    expect(() => keychainDelete("default")).not.toThrow();
    expect(execMock).not.toHaveBeenCalled();
  });

  it("probes `security` and uses Keychain on macOS", () => {
    setPlatform("darwin");

    execMock.mockReturnValueOnce(Buffer.from(""));
    expect(keychainAvailable()).toBe(true);
    expect(execMock).toHaveBeenCalledWith("security", ["help"], expect.anything());

    execMock.mockReturnValueOnce("wrappedhex");
    expect(keychainGet("default")).toBe("wrappedhex");
    expect(execMock).toHaveBeenCalledWith(
      "security",
      ["find-generic-password", "-s", "keyblind", "-a", "default", "-w"],
      expect.anything(),
    );

    keychainSet("default", "abc");
    expect(execMock).toHaveBeenCalledWith(
      "security",
      ["add-generic-password", "-s", "keyblind", "-a", "default", "-w", "abc", "-U"],
      expect.anything(),
    );
  });

  it("uses secret-tool (libsecret) on Linux", () => {
    setPlatform("linux");

    execMock.mockReturnValueOnce(Buffer.from(""));
    expect(keychainAvailable()).toBe(true);
    expect(execMock).toHaveBeenCalledWith("secret-tool", ["--version"], expect.anything());

    execMock.mockReturnValueOnce("stored\n");
    expect(keychainGet("default")).toBe("stored");
    expect(execMock).toHaveBeenCalledWith(
      "secret-tool",
      ["lookup", "service", "keyblind", "account", "default"],
      expect.anything(),
    );

    keychainSet("default", "myvalue");
    expect(execMock).toHaveBeenCalledWith(
      "secret-tool",
      ["store", "--label=Keyblind", "service", "keyblind", "account", "default"],
      expect.objectContaining({ input: "myvalue" }),
    );
  });

  it("round-trips through DPAPI (PowerShell) on Windows", () => {
    setPlatform("win32");

    expect(keychainAvailable()).toBe(true); // no probe

    execMock.mockReturnValueOnce("base64blob");
    keychainSet("default", "secret-value");
    expect(execMock).toHaveBeenCalledWith(
      "powershell",
      expect.arrayContaining(["-NoProfile", "-NonInteractive", "-Command"]),
      expect.objectContaining({ input: "secret-value" }),
    );

    execMock.mockReturnValueOnce("secret-value");
    expect(keychainGet("default")).toBe("secret-value");
    expect(execMock).toHaveBeenLastCalledWith(
      "powershell",
      expect.arrayContaining(["-NoProfile", "-NonInteractive", "-Command"]),
      expect.objectContaining({ input: "base64blob" }),
    );
  });
});
