import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Agent Accountability ledger: an append-only, hash-chained, Ed25519-signed
// record of every action an agent takes, bound to a human sponsor. Tampering
// with any entry (or its order) breaks the chain and is detected by verify().

const GENESIS = crypto.createHash("sha256").update("keyblind-agent-ledger-genesis-v1").digest("hex");

let _db: Database.Database | null = null;
let _dbPath: string | null = null;

export interface AgentIdentity {
  id: string;
  name: string;
  sponsor: string;
  scope: string;
  publicKey: string;
  createdAt: string;
}

export interface RegistrationResult {
  identity: AgentIdentity;
  privateKey: string;
}

export interface LedgerEntry {
  seq: number;
  agentId: string;
  action: string;
  target: string;
  metadata: string;
  prevHash: string;
  hash: string;
  signature: string;
  timestamp: string;
}

export interface VerificationResult {
  valid: boolean;
  entries: number;
  brokenAt: number | null;
}

export function setLedgerPath(p: string): void {
  _dbPath = p;
  closeLedger();
}

export function closeLedger(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = _dbPath ?? path.join(os.homedir(), ".keyblind", "ledger.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  _db = new Database(dbPath);
  _db.pragma("foreign_keys = ON");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sponsor TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT '',
      public_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS ledger (
      seq INTEGER PRIMARY KEY,
      agent_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL DEFAULT '',
      metadata TEXT NOT NULL DEFAULT '{}',
      prev_hash TEXT NOT NULL,
      hash TEXT NOT NULL,
      signature TEXT NOT NULL,
      timestamp TEXT NOT NULL
    )
  `);
  _db.exec(`CREATE INDEX IF NOT EXISTS idx_ledger_agent ON ledger(agent_id)`);
  return _db;
}

function computeHash(seq: number, agentId: string, action: string, target: string, metadata: string, prevHash: string, timestamp: string): string {
  return crypto
    .createHash("sha256")
    .update([seq, agentId, action, target, metadata, prevHash, timestamp].join("|"))
    .digest("hex");
}

export function registerAgent(name: string, sponsor: string, scope = ""): RegistrationResult {
  const db = getDb();
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const id = crypto.randomUUID();
  const publicKeyB64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const privateKeyB64 = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  db.prepare("INSERT INTO agents (id, name, sponsor, scope, public_key) VALUES (?, ?, ?, ?, ?)").run(
    id, name, sponsor, scope, publicKeyB64,
  );
  const row = db.prepare("SELECT created_at FROM agents WHERE id = ?").get(id) as { created_at: string };
  return {
    identity: { id, name, sponsor, scope, publicKey: publicKeyB64, createdAt: row.created_at },
    privateKey: privateKeyB64,
  };
}

export function getAgent(id: string): AgentIdentity | null {
  const db = getDb();
  const row = db.prepare("SELECT id, name, sponsor, scope, public_key, created_at FROM agents WHERE id = ?").get(id) as
    | { id: string; name: string; sponsor: string; scope: string; public_key: string; created_at: string }
    | undefined;
  if (!row) return null;
  return { id: row.id, name: row.name, sponsor: row.sponsor, scope: row.scope, publicKey: row.public_key, createdAt: row.created_at };
}

export function listAgents(): AgentIdentity[] {
  const db = getDb();
  return (db.prepare("SELECT id, name, sponsor, scope, public_key, created_at FROM agents ORDER BY created_at").all() as
    { id: string; name: string; sponsor: string; scope: string; public_key: string; created_at: string }[]
  ).map((r) => ({ id: r.id, name: r.name, sponsor: r.sponsor, scope: r.scope, publicKey: r.public_key, createdAt: r.created_at }));
}

export function recordAction(agentId: string, privateKeyB64: string, action: string, target = "", metadata = "{}"): LedgerEntry {
  const db = getDb();
  const agent = getAgent(agentId);
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);

  const priv = crypto.createPrivateKey({ key: Buffer.from(privateKeyB64, "base64"), format: "der", type: "pkcs8" });
  const derivedPub = crypto.createPublicKey(priv).export({ type: "spki", format: "der" }).toString("base64");
  if (derivedPub !== agent.publicKey) throw new Error("Private key does not match agent identity");

  const prev = db.prepare("SELECT hash FROM ledger ORDER BY seq DESC LIMIT 1").get() as { hash: string } | undefined;
  const prevHash = prev?.hash ?? GENESIS;
  const seq = ((db.prepare("SELECT COALESCE(MAX(seq), 0) AS m FROM ledger").get() as { m: number }).m) + 1;
  const timestamp = new Date().toISOString();
  const hash = computeHash(seq, agentId, action, target, metadata, prevHash, timestamp);
  const signature = crypto.sign(null, Buffer.from(hash), priv).toString("base64");

  db.prepare(
    "INSERT INTO ledger (seq, agent_id, action, target, metadata, prev_hash, hash, signature, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(seq, agentId, action, target, metadata, prevHash, hash, signature, timestamp);

  return { seq, agentId, action, target, metadata, prevHash, hash, signature, timestamp };
}

export function verify(): VerificationResult {
  const db = getDb();
  const rows = db.prepare(
    "SELECT seq, agent_id AS agentId, action, target, metadata, prev_hash AS prevHash, hash, signature, timestamp FROM ledger ORDER BY seq",
  ).all() as LedgerEntry[];
  let prevHash = GENESIS;
  let entries = 0;
  for (const r of rows) {
    entries++;
    if (r.prevHash !== prevHash) return { valid: false, entries, brokenAt: r.seq };
    const hash = computeHash(r.seq, r.agentId, r.action, r.target, r.metadata, r.prevHash, r.timestamp);
    if (hash !== r.hash) return { valid: false, entries, brokenAt: r.seq };
    const agent = getAgent(r.agentId);
    if (!agent) return { valid: false, entries, brokenAt: r.seq };
    const pub = crypto.createPublicKey({ key: Buffer.from(agent.publicKey, "base64"), format: "der", type: "spki" });
    const ok = crypto.verify(null, Buffer.from(hash), pub, Buffer.from(r.signature, "base64"));
    if (!ok) return { valid: false, entries, brokenAt: r.seq };
    prevHash = r.hash;
  }
  return { valid: true, entries, brokenAt: null };
}

export function listEntries(agentId?: string): LedgerEntry[] {
  const db = getDb();
  const select = "SELECT seq, agent_id AS agentId, action, target, metadata, prev_hash AS prevHash, hash, signature, timestamp FROM ledger";
  const rows = agentId
    ? (db.prepare(`${select} WHERE agent_id = ? ORDER BY seq`).all(agentId) as LedgerEntry[])
    : (db.prepare(`${select} ORDER BY seq`).all() as LedgerEntry[]);
  return rows;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCompliance(format: "json" | "csv" = "json"): string {
  const db = getDb();
  const rows = db.prepare(
    "SELECT l.seq, l.agent_id, a.name AS agent_name, a.sponsor, l.action, l.target, l.metadata, l.timestamp, l.hash, l.signature FROM ledger l JOIN agents a ON a.id = l.agent_id ORDER BY l.seq",
  ).all() as { seq: number; agent_id: string; agent_name: string; sponsor: string; action: string; target: string; metadata: string; timestamp: string; hash: string; signature: string }[];

  if (format === "csv") {
    const header = ["seq", "agent_id", "agent_name", "sponsor", "action", "target", "metadata", "timestamp", "hash", "signature"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([r.seq, r.agent_id, r.agent_name, r.sponsor, r.action, r.target, r.metadata, r.timestamp, r.hash, r.signature].map(csvCell).join(","));
    }
    return lines.join("\n");
  }
  return JSON.stringify(rows, null, 2);
}
