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
});
