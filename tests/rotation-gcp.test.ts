import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  execSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: mocks.execFileSync,
  execSync: mocks.execSync,
}));

import { gcpServiceAccountRotationProvider } from "../src/rotation/gcp.js";

beforeEach(() => {
  mocks.execFileSync.mockReset();
  mocks.execFileSync.mockImplementation((_cmd: string, args: string[]) => {
    if (args[0] === "iam" && args[3] === "create") {
      // `gcloud iam service-accounts keys create <file> ...` writes the key to the file.
      writeFileSync(
        args[4],
        JSON.stringify({ type: "service_account", private_key_id: "KEY123", client_email: args[6] }),
      );
      return "";
    }
    if (args[0] === "auth") return "ya29.fake-token";
    return "";
  });
});

describe("gcpServiceAccountRotationProvider", () => {
  it("creates a key and returns its JSON + private_key_id", async () => {
    const result = await gcpServiceAccountRotationProvider.create({ serviceAccountEmail: "svc@proj.iam.gserviceaccount.com" });

    expect(result.externalId).toBe("KEY123");
    expect(JSON.parse(result.value).private_key_id).toBe("KEY123");
    const args = mocks.execFileSync.mock.calls[0][1];
    expect(args.slice(0, 5)).toEqual(["iam", "service-accounts", "keys", "create", expect.stringContaining("key.json")]);
    expect(args[6]).toBe("svc@proj.iam.gserviceaccount.com");
  });

  it("throws when serviceAccountEmail is missing", async () => {
    await expect(gcpServiceAccountRotationProvider.create({})).rejects.toThrow(/serviceAccountEmail/);
  });

  it("verifies by requesting an application-default access token", async () => {
    const value = JSON.stringify({ private_key_id: "KEY123" });
    expect(await gcpServiceAccountRotationProvider.verify({}, value)).toBe(true);
    const call = mocks.execFileSync.mock.calls[0];
    expect(call[1]).toEqual(["auth", "application-default", "print-access-token"]);
    expect(call[2].env.GOOGLE_APPLICATION_CREDENTIALS).toContain("key.json");
  });

  it("returns false when token request fails", async () => {
    mocks.execFileSync.mockImplementation(() => {
      throw new Error("invalid key");
    });
    expect(await gcpServiceAccountRotationProvider.verify({}, "{}")).toBe(false);
  });

  it("revokes by deleting the key id", async () => {
    await gcpServiceAccountRotationProvider.revoke({ serviceAccountEmail: "svc@proj.iam.gserviceaccount.com" }, "KEY123");
    const args = mocks.execFileSync.mock.calls[0][1];
    expect(args).toEqual(["iam", "service-accounts", "keys", "delete", "KEY123", "--iam-account", "svc@proj.iam.gserviceaccount.com", "--quiet"]);
  });

  it("extracts the private_key_id from a stored value", () => {
    expect(gcpServiceAccountRotationProvider.extractExternalId(JSON.stringify({ private_key_id: "KEY123" }))).toBe("KEY123");
    expect(gcpServiceAccountRotationProvider.extractExternalId("not json")).toBe("");
  });
});
