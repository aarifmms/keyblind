import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  execSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: mocks.execFileSync,
  execSync: mocks.execSync,
}));

import { azureAppCredentialRotationProvider } from "../src/rotation/azure.js";

beforeEach(() => {
  mocks.execFileSync.mockReset();
  mocks.execFileSync.mockImplementation((_cmd: string, args: string[]) => {
    if (args[3] === "reset") return JSON.stringify({ password: "SECRET123" });
    if (args[3] === "list") return "KEYID123";
    return "";
  });
});

describe("azureAppCredentialRotationProvider", () => {
  it("creates a secret, looks up its keyId, and returns keyId:secret", async () => {
    const result = await azureAppCredentialRotationProvider.create({ appId: "APP123" });

    expect(result.externalId).toBe("KEYID123");
    expect(result.value).toBe("KEYID123:SECRET123");

    const resetArgs = mocks.execFileSync.mock.calls[0][1];
    expect(resetArgs.slice(0, 4)).toEqual(["ad", "app", "credential", "reset"]);
    expect(resetArgs).toContain("APP123");
    expect(resetArgs).toContain("--append");

    const listArgs = mocks.execFileSync.mock.calls[1][1];
    expect(listArgs.slice(0, 4)).toEqual(["ad", "app", "credential", "list"]);
  });

  it("throws when appId is missing", async () => {
    await expect(azureAppCredentialRotationProvider.create({})).rejects.toThrow(/appId/);
  });

  it("throws when reset returns no password", async () => {
    mocks.execFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args[3] === "reset") return "{}";
      if (args[3] === "list") return "KEYID123";
      return "";
    });
    await expect(azureAppCredentialRotationProvider.create({ appId: "APP123" })).rejects.toThrow(/password/);
  });

  it("verifies by logging in as a service principal", async () => {
    expect(await azureAppCredentialRotationProvider.verify({ appId: "APP123", tenant: "TENANT" }, "KEYID123:SECRET123")).toBe(true);
    const call = mocks.execFileSync.mock.calls[0];
    expect(call[1][0]).toBe("login");
    expect(call[1]).toContain("APP123");
    expect(call[1]).toContain("SECRET123");
    expect(call[2].env.AZURE_CONFIG_DIR).toBeTruthy();
  });

  it("returns false when login fails", async () => {
    mocks.execFileSync.mockImplementation(() => {
      throw new Error("invalid client secret");
    });
    expect(await azureAppCredentialRotationProvider.verify({ appId: "APP123" }, "KEYID123:SECRET123")).toBe(false);
  });

  it("returns false for a malformed value", async () => {
    expect(await azureAppCredentialRotationProvider.verify({ appId: "APP123" }, "justsecret")).toBe(false);
  });

  it("revokes by deleting the credential key id", async () => {
    await azureAppCredentialRotationProvider.revoke({ appId: "APP123" }, "KEYID123");
    expect(mocks.execFileSync.mock.calls[0][1]).toEqual(["ad", "app", "credential", "delete", "--id", "APP123", "--key-id", "KEYID123"]);
  });

  it("extracts the keyId from a stored value", () => {
    expect(azureAppCredentialRotationProvider.extractExternalId("KEYID123:SECRET123")).toBe("KEYID123");
    expect(azureAppCredentialRotationProvider.extractExternalId("KEYID123")).toBe("KEYID123");
  });
});
