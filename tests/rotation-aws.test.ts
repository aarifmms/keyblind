import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  execSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: mocks.execFileSync,
  execSync: mocks.execSync,
}));

import { awsIamRotationProvider } from "../src/rotation/aws.js";

beforeEach(() => {
  mocks.execFileSync.mockReset();
  mocks.execFileSync.mockImplementation((_cmd: string, args: string[]) => {
    if (args[0] === "iam" && args[1] === "create-access-key") {
      return JSON.stringify({
        AccessKey: { AccessKeyId: "AKIATEST", SecretAccessKey: "SECRETTEST", Status: "Active" },
      });
    }
    if (args[0] === "sts") return "{}";
    return "";
  });
});

describe("awsIamRotationProvider", () => {
  it("creates an access key and returns id:secret as the value", async () => {
    const result = await awsIamRotationProvider.create({ iamUserName: "svc" });

    expect(result.externalId).toBe("AKIATEST");
    expect(result.value).toBe("AKIATEST:SECRETTEST");
    const call = mocks.execFileSync.mock.calls[0];
    expect(call[1]).toEqual(["iam", "create-access-key", "--user-name", "svc", "--output", "json"]);
  });

  it("throws when iamUserName is missing", async () => {
    await expect(awsIamRotationProvider.create({})).rejects.toThrow(/iamUserName/);
  });

  it("verifies by calling sts get-caller-identity with the new key", async () => {
    const ok = await awsIamRotationProvider.verify({ iamUserName: "svc" }, "AKIATEST:SECRETTEST");
    expect(ok).toBe(true);
    const call = mocks.execFileSync.mock.calls[0];
    expect(call[1]).toEqual(["sts", "get-caller-identity", "--output", "json"]);
    expect(call[2].env.AWS_ACCESS_KEY_ID).toBe("AKIATEST");
    expect(call[2].env.AWS_SECRET_ACCESS_KEY).toBe("SECRETTEST");
  });

  it("returns false when sts fails after the retry window", async () => {
    vi.useFakeTimers();
    try {
      mocks.execFileSync.mockImplementation(() => {
        throw new Error("InvalidClientTokenId");
      });
      const result = awsIamRotationProvider.verify({ iamUserName: "svc" }, "AKIATEST:SECRETTEST");
      await vi.runAllTimersAsync();
      expect(await result).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns false for a malformed value", async () => {
    expect(await awsIamRotationProvider.verify({ iamUserName: "svc" }, "justid")).toBe(false);
  });

  it("revokes by deactivating then deleting the key", async () => {
    await awsIamRotationProvider.revoke({ iamUserName: "svc" }, "AKIAOLD");
    const args = mocks.execFileSync.mock.calls.map((c) => c[1]);
    expect(args[0]).toEqual(["iam", "update-access-key", "--user-name", "svc", "--access-key-id", "AKIAOLD", "--status", "Inactive"]);
    expect(args[1]).toEqual(["iam", "delete-access-key", "--user-name", "svc", "--access-key-id", "AKIAOLD"]);
  });

  it("extracts the access key id from a stored value", () => {
    expect(awsIamRotationProvider.extractExternalId("AKIATEST:SECRETTEST")).toBe("AKIATEST");
    expect(awsIamRotationProvider.extractExternalId("AKIATEST")).toBe("AKIATEST");
  });
});
