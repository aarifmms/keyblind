import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Redirect os.homedir() to a temp dir so the vault never touches ~/.keyblind.
const state = vi.hoisted(() => ({ tmpDir: "" }));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const homedir = () => {
    if (!state.tmpDir) {
      state.tmpDir = path.join(fs.mkdtempSync(path.join(actual.tmpdir(), "keyblind-rot-")));
    }
    return state.tmpDir;
  };
  return { ...actual, homedir, default: { ...actual.default, homedir } };
});

import {
  initializeVault,
  storeSecret,
  resolveSecret,
  getDb,
  isInitialized,
  closeDb,
  listPendingRevocations,
  setRotationConfig,
  getRotationConfig,
  listRotationConfigs,
} from "../src/vault.js";
import { rotateProviderSecret, finalizePendingRevocations, type RotationProvider } from "../src/rotation.js";

class FakeProvider implements RotationProvider {
  name = "fake";
  verifyResult = true;
  createCalls = 0;
  verifyCalls = 0;
  revokeCalls: string[] = [];
  counter = 0;

  async create(_ctx: Record<string, string>) {
    this.createCalls++;
    this.counter++;
    return { value: `new-value-${this.counter}`, externalId: `ext-new-${this.counter}` };
  }

  async verify(_ctx: Record<string, string>, _value: string) {
    this.verifyCalls++;
    return this.verifyResult;
  }

  async revoke(_ctx: Record<string, string>, externalId: string) {
    this.revokeCalls.push(externalId);
  }

  extractExternalId(value: string): string {
    return value.split(":")[1] ?? value;
  }
}

beforeAll(() => {
  fs.mkdirSync(state.tmpDir, { recursive: true });
  if (!isInitialized()) initializeVault("test-passphrase");
});

afterAll(() => {
  closeDb();
  fs.rmSync(state.tmpDir, { recursive: true, force: true });
});

describe("rotateProviderSecret", () => {
  it("creates a new credential, stores it, and schedules revocation", async () => {
    const p = new FakeProvider();
    storeSecret("ROT_A", "old-secret:ext-old");

    const result = await rotateProviderSecret("ROT_A", p, { user: "alice" }, 300);

    expect(resolveSecret("ROT_A")).toBe("new-value-1");
    expect(result.oldExternalId).toBe("ext-old");
    expect(result.externalId).toBe("ext-new-1");
    expect(p.createCalls).toBe(1);
    expect(p.verifyCalls).toBe(1);

    const pending = listPendingRevocations();
    expect(pending).toHaveLength(1);
    expect(pending[0].secretName).toBe("ROT_A");
    expect(pending[0].provider).toBe("fake");
    expect(pending[0].oldExternalId).toBe("ext-old");
    expect(pending[0].status).toBe("pending");
  });

  it("rolls back and revokes the new credential when verification fails", async () => {
    const p = new FakeProvider();
    p.verifyResult = false;
    storeSecret("ROT_B", "old-secret:ext-old");

    await expect(rotateProviderSecret("ROT_B", p, {}, 300)).rejects.toThrow(/verification failed/i);

    expect(resolveSecret("ROT_B")).toBe("old-secret:ext-old");
    expect(p.revokeCalls).toContain("ext-new-1");
    expect(listPendingRevocations().filter((r) => r.secretName === "ROT_B")).toHaveLength(0);
  });

  it("throws when the secret does not exist", async () => {
    const p = new FakeProvider();
    await expect(rotateProviderSecret("ROT_MISSING", p, {}, 300)).rejects.toThrow(/not found/i);
  });
});

describe("finalizePendingRevocations", () => {
  it("revokes past-window revocations and leaves in-window ones pending", async () => {
    const p = new FakeProvider();
    storeSecret("ROT_DUE", "old:ext-due");
    await rotateProviderSecret("ROT_DUE", p, {}, 3600);
    storeSecret("ROT_NOTDUE", "old:ext-notdue");
    await rotateProviderSecret("ROT_NOTDUE", p, {}, 3600);
    setRotationConfig("ROT_DUE", "fake", { user: "a" });
    setRotationConfig("ROT_NOTDUE", "fake", { user: "a" });

    getDb()
      .prepare("UPDATE rotation_pending SET revoke_at = datetime('now', '-1 second') WHERE secret_name = ?")
      .run("ROT_DUE");

    const { revoked, failed } = await finalizePendingRevocations({ fake: p });

    expect(revoked).toBe(1);
    expect(failed).toBe(0);
    const all = listPendingRevocations();
    expect(all.find((r) => r.secretName === "ROT_DUE")!.status).toBe("revoked");
    expect(all.find((r) => r.secretName === "ROT_NOTDUE")!.status).toBe("pending");
  });

  it("marks a revocation failed when there is no provider or config", async () => {
    const p = new FakeProvider();
    storeSecret("ROT_ORPHAN", "old:ext-orphan");
    await rotateProviderSecret("ROT_ORPHAN", p, {}, 0);
    // no setRotationConfig → cannot resolve provider/context

    const { revoked, failed } = await finalizePendingRevocations({ fake: p });
    expect(failed).toBe(1);
    expect(listPendingRevocations().find((r) => r.secretName === "ROT_ORPHAN")!.status).toBe("failed");
    expect(revoked).toBe(0);
  });
});

describe("rotation config", () => {
  it("round-trips provider config", () => {
    setRotationConfig("ROT_CFG", "aws", { iamUserName: "svc" }, 120);
    const cfg = getRotationConfig("ROT_CFG");
    expect(cfg).not.toBeNull();
    expect(cfg!.provider).toBe("aws");
    expect(cfg!.config.iamUserName).toBe("svc");
    expect(cfg!.rollbackWindowSeconds).toBe(120);
    expect(listRotationConfigs().map((c) => c.secretName)).toContain("ROT_CFG");
  });

  it("returns null for a missing config", () => {
    expect(getRotationConfig("ROT_NOPE")).toBeNull();
  });
});
