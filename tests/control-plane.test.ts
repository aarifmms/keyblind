import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const state = vi.hoisted(() => ({ tmpDir: "" }));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const homedir = () => {
    if (!state.tmpDir) {
      state.tmpDir = path.join(fs.mkdtempSync(path.join(actual.tmpdir(), "control-plane-test-")));
    }
    return state.tmpDir;
  };
  return { ...actual, homedir, default: { ...actual.default, homedir } };
});

import { setLedgerPath, closeLedger, registerAgent, revokeAgent, unrevokeAgent, listRevokedAgents, isAgentRevoked, authorizeAction, signRequest } from "../src/ledger.js";
import { initializeVault, storeSecret, listSecretInventory, closeDb } from "../src/vault.js";
import { initControlPlane, getOrgPublicKey, trustOrg, untrustOrg, listTrustedOrgs, exportControlPlane, applyDenyList } from "../src/control-plane.js";

beforeAll(() => {
  fs.mkdirSync(state.tmpDir, { recursive: true });
  setLedgerPath(path.join(state.tmpDir, "ledger.db"));
  initializeVault("test-passphrase");
});

afterAll(() => {
  closeLedger();
  closeDb();
  fs.rmSync(state.tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  closeLedger();
  fs.rmSync(path.join(state.tmpDir, "ledger.db"), { force: true });
  fs.rmSync(path.join(state.tmpDir, "org-key.json"), { force: true });
  fs.rmSync(path.join(state.tmpDir, "trusted-orgs.json"), { force: true });
});

describe("org keypair", () => {
  it("generates and persists a keypair", () => {
    const { publicKey } = initControlPlane();
    expect(publicKey).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(getOrgPublicKey()).toBe(publicKey);
    expect(fs.existsSync(path.join(state.tmpDir, "org-key.json"))).toBe(true);
  });

  it("is idempotent", () => {
    const first = initControlPlane();
    const second = initControlPlane();
    expect(second.publicKey).toBe(first.publicKey);
  });
});

describe("trusted orgs", () => {
  it("adds, lists, and removes trusted keys", () => {
    expect(listTrustedOrgs()).toEqual([]);
    trustOrg("pubkey-1");
    trustOrg("pubkey-1");
    expect(listTrustedOrgs()).toEqual(["pubkey-1"]);
    trustOrg("pubkey-2");
    expect(listTrustedOrgs()).toEqual(["pubkey-1", "pubkey-2"]);
    untrustOrg("pubkey-1");
    expect(listTrustedOrgs()).toEqual(["pubkey-2"]);
  });
});

describe("secret inventory", () => {
  it("returns all secrets with age, never leaking values", () => {
    storeSecret("API_KEY", "super-secret-value");
    storeSecret("DB_PASSWORD", "another-secret");

    const inventory = listSecretInventory();
    const names = inventory.map((i) => i.name);
    expect(names).toContain("API_KEY");
    expect(names).toContain("DB_PASSWORD");

    const apiKey = inventory.find((i) => i.name === "API_KEY")!;
    expect(Object.keys(apiKey).sort()).toEqual(["ageDays", "name", "updatedAt"]);
    expect(apiKey.ageDays).toBeGreaterThanOrEqual(0);
    expect(typeof apiKey.updatedAt).toBe("string");

    expect(JSON.stringify(inventory)).not.toContain("super-secret-value");
    expect(JSON.stringify(inventory)).not.toContain("another-secret");
  });
});

describe("exportControlPlane", () => {
  it("produces a signed, value-free bundle", () => {
    initControlPlane();
    storeSecret("API_KEY", "hunter2-secret");
    registerAgent("demo-bot", "sponsor@corp.com", "read:*");

    const bundle = exportControlPlane();
    expect(bundle).not.toContain("hunter2-secret");

    const doc = JSON.parse(bundle);
    expect(doc.format).toBe("keyblind-control-plane-v1");
    expect(doc.secretInventory.some((s: any) => s.name === "API_KEY")).toBe(true);
    expect(doc.agents).toHaveLength(1);
    expect(Array.isArray(doc.ledger)).toBe(true);
    expect(Array.isArray(doc.approvals)).toBe(true);
    expect(Array.isArray(doc.revokedAgents)).toBe(true);
    expect(doc.ledgerVerification).toHaveProperty("valid");
    expect(typeof doc.signature).toBe("string");
    expect(doc.signature.length).toBeGreaterThan(0);
  });

  it("throws if not initialized", () => {
    expect(() => exportControlPlane()).toThrow(/not initialized/i);
  });
});

describe("revocation enforcement", () => {
  it("denies a revoked agent even with a valid scope and signature", () => {
    const { identity, privateKey } = registerAgent("bot", "sponsor@corp.com", "read:*");
    const sig = signRequest(privateKey, "read", "SOME_SECRET");

    expect(authorizeAction(identity.id, "read", "SOME_SECRET", sig)).toBeNull();

    revokeAgent(identity.id, "compromised");
    expect(isAgentRevoked(identity.id)).toBe(true);
    expect(authorizeAction(identity.id, "read", "SOME_SECRET", sig)).toBe("Agent revoked");

    unrevokeAgent(identity.id);
    expect(isAgentRevoked(identity.id)).toBe(false);
    expect(authorizeAction(identity.id, "read", "SOME_SECRET", sig)).toBeNull();
  });

  it("lists revoked agents", () => {
    const { identity } = registerAgent("bot", "sponsor@corp.com", "read:*");
    revokeAgent(identity.id, "leaked key");
    expect(listRevokedAgents()).toEqual([{ agentId: identity.id, reason: "leaked key", revokedAt: expect.any(String) }]);
  });
});

describe("applyDenyList", () => {
  it("refuses an untrusted org public key", () => {
    initControlPlane();
    const bundle = exportControlPlane();
    expect(() => applyDenyList(bundle)).toThrow(/untrusted org public key/i);
  });

  it("rejects a tampered signature", () => {
    initControlPlane();
    trustOrg(getOrgPublicKey()!);
    const bundle = JSON.parse(exportControlPlane());
    bundle.ledgerVerification.valid = false; // tamper with the signed content
    expect(() => applyDenyList(JSON.stringify(bundle))).toThrow(/signature verification failed/i);
  });

  it("round-trips a deny list through export -> apply", () => {
    const { publicKey } = initControlPlane();
    trustOrg(publicKey);

    const { identity } = registerAgent("bot", "sponsor@corp.com", "read:*");
    revokeAgent(identity.id, "compromised");

    const bundle = exportControlPlane();
    unrevokeAgent(identity.id);
    expect(isAgentRevoked(identity.id)).toBe(false);

    const result = applyDenyList(bundle);
    expect(result.revoked).toBe(1);
    expect(isAgentRevoked(identity.id)).toBe(true);
  });
});
