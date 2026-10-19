import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  setLedgerPath,
  closeLedger,
  registerAgent,
  recordAction,
  verify,
  listAgents,
  listEntries,
  exportCompliance,
  scopeMatches,
  signRequest,
  verifyAgentSignature,
  authorizeAction,
  isAgentScopeRequired,
  setAgentScopeRequirement,
} from "../src/ledger.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-test-"));
const dbPath = path.join(tmp, "ledger.db");
setLedgerPath(dbPath);

beforeEach(() => {
  closeLedger();
  fs.rmSync(dbPath, { force: true });
});

afterAll(() => {
  closeLedger();
});

function rawDb(): Database.Database {
  return new Database(dbPath);
}

describe("agent ledger", () => {
  it("registers an agent bound to a human sponsor", () => {
    const { identity, privateKey } = registerAgent("billing-agent", "alice@corp.com", "read:invoices");
    expect(identity.name).toBe("billing-agent");
    expect(identity.sponsor).toBe("alice@corp.com");
    expect(identity.publicKey).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(privateKey).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(listAgents()).toHaveLength(1);
  });

  it("records a hash-chained, signed sequence", () => {
    const { identity, privateKey } = registerAgent("support-agent", "bob@corp.com");
    const e1 = recordAction(identity.id, privateKey, "resolve_secret", "STRIPE_API_KEY");
    const e2 = recordAction(identity.id, privateKey, "store_secret", "DATABASE_URL", '{"env":"prod"}');
    expect(e1.seq).toBe(1);
    expect(e2.seq).toBe(2);
    expect(e2.prevHash).toBe(e1.hash);
    expect(listEntries()).toHaveLength(2);
    expect(verify()).toEqual({ valid: true, entries: 2, brokenAt: null });
  });

  it("rejects a signing key that does not match the agent", () => {
    const a = registerAgent("agent-a", "sponsor@corp.com");
    const b = registerAgent("agent-b", "sponsor@corp.com");
    expect(() => recordAction(a.identity.id, b.privateKey, "forge", "X")).toThrow(/does not match/);
  });

  it("detects tampering with an entry", () => {
    const { identity, privateKey } = registerAgent("audit-agent", "carol@corp.com");
    recordAction(identity.id, privateKey, "resolve_secret", "DB_PASSWORD");
    recordAction(identity.id, privateKey, "delete_secret", "OLD_KEY");
    expect(verify().valid).toBe(true);

    const db = rawDb();
    db.prepare("UPDATE ledger SET action = 'unauthorized' WHERE seq = 1").run();
    db.close();

    const result = verify();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it("exports a compliance report with sponsor attribution", () => {
    const { identity, privateKey } = registerAgent("export-agent", "dana@corp.com");
    recordAction(identity.id, privateKey, "resolve_secret", "SERVICE_KEY");
    const csv = exportCompliance("csv");
    expect(csv).toContain("export-agent");
    expect(csv).toContain("dana@corp.com");
    expect(csv.split("\n")[0]).toContain("sponsor");
    const json = exportCompliance("json");
    expect(JSON.parse(json)).toHaveLength(1);
  });

  it("matches scope grammar", () => {
    expect(scopeMatches("*", "read", "anything")).toBe(true);
    expect(scopeMatches("read:*", "read", "DB_PASSWORD")).toBe(true);
    expect(scopeMatches("read:*", "write", "DB_PASSWORD")).toBe(false);
    expect(scopeMatches("read:invoices", "read", "invoices")).toBe(true);
    expect(scopeMatches("read:prod-*", "read", "prod-api-key")).toBe(true);
    expect(scopeMatches("read:prod-*", "read", "dev-api-key")).toBe(false);
    expect(scopeMatches("read:invoices write:invoices", "write", "invoices")).toBe(true);
    expect(scopeMatches("read:invoices write:invoices", "read", "payments")).toBe(false);
    expect(scopeMatches("", "read", "anything")).toBe(false);
    expect(scopeMatches("read:inv* read:pay", "read", "invoices")).toBe(true);
  });

  it("signs and verifies a request, rejecting tampering", () => {
    const { identity, privateKey } = registerAgent("scoped-agent", "eve@corp.com", "read:invoices");
    const sig = signRequest(privateKey, "read", "invoices");
    expect(verifyAgentSignature(identity.id, "read", "invoices", sig)).toBe(true);
    expect(verifyAgentSignature(identity.id, "read", "payments", sig)).toBe(false);
    expect(verifyAgentSignature(identity.id, "write", "invoices", sig)).toBe(false);
  });

  it("authorizes in-scope and denies out-of-scope actions", () => {
    const { identity, privateKey } = registerAgent("scoped-agent2", "frank@corp.com", "read:invoices");
    const okSig = signRequest(privateKey, "read", "invoices");
    expect(authorizeAction(identity.id, "read", "invoices", okSig)).toBeNull();

    const outSig = signRequest(privateKey, "read", "payments");
    expect(authorizeAction(identity.id, "read", "payments", outSig)).toMatch(/Out of scope/);

    expect(authorizeAction("nonexistent", "read", "invoices", okSig)).toBe("Unknown agent");

    const badSig = signRequest(privateKey, "read", "invoices").slice(0, -4) + "AAAA";
    expect(authorizeAction(identity.id, "read", "invoices", badSig)).toBe("Invalid agent signature");
  });

  it("toggles the mandatory enforcement flag", () => {
    expect(isAgentScopeRequired()).toBe(false);
    setAgentScopeRequirement(true);
    expect(isAgentScopeRequired()).toBe(true);
    setAgentScopeRequirement(false);
    expect(isAgentScopeRequired()).toBe(false);
  });
});
