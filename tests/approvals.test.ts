import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Redirect os.homedir so vault.ts creates its key file + database in a temp
// directory instead of touching the real ~/.keyblind. This must run before the
// modules below are imported, since vault.ts calls os.homedir() lazily but the
// mock must be installed first for that to land in the temp dir.
const state = vi.hoisted(() => ({ tmpDir: "" }));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const homedir = () => {
    if (!state.tmpDir) {
      state.tmpDir = path.join(fs.mkdtempSync(path.join(actual.tmpdir(), "approvals-test-")));
    }
    return state.tmpDir;
  };
  return { ...actual, homedir, default: { ...actual.default, homedir } };
});

import { setLedgerPath, closeLedger, registerAgent } from "../src/ledger.js";
import { initializeVault, storeSecret, resolveSecret, listSecrets, closeDb, getKey } from "../src/vault.js";
import {
  requestApproval,
  listApprovals,
  approveApproval,
  denyApproval,
  approvalRequiredFor,
  isApprovalRequired,
  setApprovalRequirement,
  requireApprovalFor,
  unrequireApprovalFor,
  listApprovalRequired,
  pendingApprovalCount,
} from "../src/approvals.js";
import { getLedgerDb } from "../src/ledger.js";

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
  setApprovalRequirement(false);
});

describe("approval queue", () => {
  it("encrypts the queued value at rest", () => {
    const { id } = requestApproval("agent-1", "store_secret", "API_KEY", "hunter2");
    const db = getLedgerDb();
    const row = db.prepare("SELECT value_encrypted, value_iv, value_auth_tag FROM approvals WHERE id = ?").get(id) as any;
    expect(row.value_encrypted).toBeTruthy();
    expect(row.value_iv).toBeTruthy();
    expect(row.value_auth_tag).toBeTruthy();
    // Ciphertext must not contain the plaintext.
    expect(row.value_encrypted.toString("utf8")).not.toContain("hunter2");
    expect(Buffer.from("hunter2").equals(row.value_encrypted)).toBe(false);
  });

  it("approving a store_secret applies the secret", () => {
    const { id } = requestApproval("agent-1", "store_secret", "API_KEY", "abc123");
    expect(listSecrets()).not.toContain("API_KEY");
    const result = approveApproval(id, "sponsor@corp.com");
    expect(result.status).toBe("approved");
    expect(listSecrets()).toContain("API_KEY");
    expect(resolveSecret("API_KEY")).toBe("abc123");
    expect(listApprovals()[0].status).toBe("approved");
    expect(listApprovals()[0].decidedBy).toBe("sponsor@corp.com");
  });

  it("approving a delete_secret deletes the secret", () => {
    storeSecret("OLD_KEY", "xyz");
    expect(listSecrets()).toContain("OLD_KEY");
    const { id } = requestApproval("agent-1", "delete_secret", "OLD_KEY");
    approveApproval(id, "sponsor@corp.com");
    expect(listSecrets()).not.toContain("OLD_KEY");
  });

  it("denying leaves state unchanged", () => {
    const { id } = requestApproval("agent-1", "store_secret", "DENY_KEY", "abc123");
    const result = denyApproval(id, "sponsor@corp.com");
    expect(result.status).toBe("denied");
    expect(listSecrets()).not.toContain("DENY_KEY");
    expect(listApprovals()[0].status).toBe("denied");
    expect(listApprovals()[0].decidedBy).toBe("sponsor@corp.com");
  });

  it("rejects re-deciding an already-resolved approval", () => {
    const { id } = requestApproval("agent-1", "store_secret", "REDECIDE_KEY", "abc123");
    approveApproval(id, "sponsor@corp.com");
    expect(() => approveApproval(id, "sponsor@corp.com")).toThrow(/already approved/);
    expect(() => denyApproval(id, "sponsor@corp.com")).toThrow(/already approved/);
  });

  it("rejects an unknown approval id", () => {
    expect(() => approveApproval("nope", "sponsor@corp.com")).toThrow(/not found/);
  });

  it("counts pending approvals", () => {
    expect(pendingApprovalCount()).toBe(0);
    requestApproval("agent-1", "store_secret", "A", "v");
    const { id } = requestApproval("agent-1", "delete_secret", "B");
    expect(pendingApprovalCount()).toBe(2);
    denyApproval(id, "sponsor@corp.com");
    expect(pendingApprovalCount()).toBe(1);
  });

  it("lists approvals filtered by status", () => {
    const { id } = requestApproval("agent-1", "store_secret", "A", "v");
    denyApproval(id, "sponsor@corp.com");
    requestApproval("agent-1", "store_secret", "B", "v");
    expect(listApprovals()).toHaveLength(2);
    expect(listApprovals("pending")).toHaveLength(1);
    expect(listApprovals("denied")).toHaveLength(1);
  });

  it("joins the agent name and sponsor", () => {
    const { identity } = registerAgent("demo-bot", "sponsor@corp.com", "write:*");
    const { id } = requestApproval(identity.id, "store_secret", "A", "v");
    const approval = listApprovals().find((a) => a.id === id)!;
    expect(approval.agentName).toBe("demo-bot");
    expect(approval.sponsor).toBe("sponsor@corp.com");
  });

  it("builds a contiguous hash chain", () => {
    requestApproval("agent-1", "store_secret", "A", "v");
    requestApproval("agent-1", "store_secret", "B", "v");
    const db = getLedgerDb();
    const rows = db.prepare("SELECT prev_hash, hash FROM approvals").all() as { prev_hash: string; hash: string }[];
    expect(rows).toHaveLength(2);

    const hashes = new Set(rows.map((r) => r.hash));
    expect(hashes.size).toBe(2);
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.hash))).toBe(true);

    // Exactly one row must point outside the set (the genesis constant); every
    // other row's prev_hash must reference a real row in the chain.
    const genesisRows = rows.filter((r) => !hashes.has(r.prev_hash));
    expect(genesisRows).toHaveLength(1);
    expect(rows.filter((r) => hashes.has(r.prev_hash))).toHaveLength(1);
  });
});

describe("approval gating", () => {
  it("reflects the global marker and per-secret flags", () => {
    expect(approvalRequiredFor("ANY")).toBe(false);
    expect(isApprovalRequired()).toBe(false);

    setApprovalRequirement(true);
    expect(isApprovalRequired()).toBe(true);
    expect(approvalRequiredFor("ANY")).toBe(true);
    setApprovalRequirement(false);
    expect(isApprovalRequired()).toBe(false);

    expect(approvalRequiredFor("DB_PASSWORD")).toBe(false);
    requireApprovalFor("DB_PASSWORD");
    expect(listApprovalRequired()).toEqual(["DB_PASSWORD"]);
    expect(approvalRequiredFor("DB_PASSWORD")).toBe(true);
    expect(approvalRequiredFor("OTHER")).toBe(false);
    unrequireApprovalFor("DB_PASSWORD");
    expect(listApprovalRequired()).toEqual([]);
    expect(approvalRequiredFor("DB_PASSWORD")).toBe(false);
  });

  it("requireApprovalFor is idempotent", () => {
    requireApprovalFor("DB_PASSWORD");
    requireApprovalFor("DB_PASSWORD");
    expect(listApprovalRequired()).toEqual(["DB_PASSWORD"]);
  });
});
