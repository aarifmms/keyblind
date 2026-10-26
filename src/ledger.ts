import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Agent Accountability ledger: an append-only, hash-chained, Ed25519-signed
// record of every action an agent takes, bound to a human sponsor. Tampering
// with any entry (or its order) breaks the chain and is detected by verify().

const GENESIS = crypto.createHash("sha256").update("keyblind-agent-ledger-genesis-v1").digest("hex");

// Short-lived request credentials: a signed request carries a single-use nonce
// and an absolute expiry (epoch seconds). The expiry must fall within a bounded
// window so a captured signature can only be replayed for a few minutes at most.
const NONCE_SKEW_SECONDS = 30;
const NONCE_MAX_TTL_SECONDS = 300; // 5 minutes
const NONCE_PRUNE_SECONDS = NONCE_MAX_TTL_SECONDS + NONCE_SKEW_SECONDS;

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

export function getLedgerDb(): Database.Database {
  return getDb();
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
  _db.exec(`
    CREATE TABLE IF NOT EXISTS secret_policies (
      secret TEXT PRIMARY KEY,
      policy TEXT NOT NULL DEFAULT ''
    )
  `);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      value_encrypted BLOB,
      value_iv BLOB,
      value_auth_tag BLOB,
      metadata TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at TEXT NOT NULL DEFAULT (datetime('now')),
      decided_at TEXT,
      decided_by TEXT,
      prev_hash TEXT NOT NULL,
      hash TEXT NOT NULL
    )
  `);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS approval_required (
      secret TEXT PRIMARY KEY
    )
  `);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS revoked_agents (
      agent_id TEXT PRIMARY KEY,
      reason TEXT NOT NULL DEFAULT '',
      revoked_at TEXT NOT NULL DEFAULT (datetime('now')),
      source TEXT NOT NULL DEFAULT 'local'
    )
  `);
  // Migrate pre-Phase-2 revoked_agents tables (which lack the source column).
  const revokedCols = _db.prepare("PRAGMA table_info(revoked_agents)").all() as { name: string }[];
  if (!revokedCols.some((c) => c.name === "source")) {
    _db.exec("ALTER TABLE revoked_agents ADD COLUMN source TEXT NOT NULL DEFAULT 'local'");
  }
  _db.exec(`
    CREATE TABLE IF NOT EXISTS group_grants (
      org_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT '',
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(org_id, agent_id)
    )
  `);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS used_nonces (
      agent_id TEXT NOT NULL,
      nonce TEXT NOT NULL,
      used_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(agent_id, nonce)
    )
  `);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS org_sync_state (
      org_id TEXT PRIMARY KEY,
      last_synced_at INTEGER NOT NULL,
      version TEXT NOT NULL DEFAULT ''
    )
  `);
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

// ── Scope enforcement ────────────────────────────────────────────────────────
//
// An agent's `scope` is a declarative allow-list of what it may do. Grammar:
//   scope     := permission (whitespace | ',' | ';')* permission*
//   permission := "*" | action ":" glob
//   action    := "read" | "write" | "*"
//   glob      := "*" (all) | shell-style wildcard over secret names
//
// Examples: "*", "read:*", "read:prod-* write:prod-*", "read:invoices write:invoices".
// Empty scope ("") grants nothing — a signed request with no declared scope is denied.

function globMatch(pattern: string, target: string): boolean {
  let re = "^";
  for (const c of pattern) {
    if (c === "*") re += ".*";
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  re += "$";
  return new RegExp(re).test(target);
}

export function scopeMatches(scope: string, action: "read" | "write", target: string): boolean {
  for (const perm of scope.split(/[\s,;]+/)) {
    const p = perm.trim();
    if (!p) continue;
    if (p === "*") return true;
    const idx = p.indexOf(":");
    if (idx === -1) continue;
    const permAction = p.slice(0, idx);
    const pattern = p.slice(idx + 1);
    if (permAction !== action && permAction !== "*") continue;
    if (pattern === "*" || globMatch(pattern, target)) return true;
  }
  return false;
}

function requestPayload(action: string, target: string, nonce: string, exp: number): string {
  return `${action}:${target}:${nonce}:${exp}`;
}

// Signs a secret-access request with the agent's private key. The signature
// binds the action + target + nonce + expiry, so a captured signature cannot be
// replayed beyond the nonce's single use and the expiry's bounded window.
export function signRequest(privateKeyB64: string, action: string, target: string, nonce: string, exp: number): string {
  const priv = crypto.createPrivateKey({ key: Buffer.from(privateKeyB64, "base64"), format: "der", type: "pkcs8" });
  return crypto.sign(null, Buffer.from(requestPayload(action, target, nonce, exp)), priv).toString("base64");
}

// Verifies a signed secret-access request against the agent's stored public key.
export function verifyAgentSignature(agentId: string, action: string, target: string, nonce: string, exp: number, signatureB64: string): boolean {
  const agent = getAgent(agentId);
  if (!agent) return false;
  try {
    const pub = crypto.createPublicKey({ key: Buffer.from(agent.publicKey, "base64"), format: "der", type: "spki" });
    return crypto.verify(null, Buffer.from(requestPayload(action, target, nonce, exp)), pub, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

// Consumes a single-use nonce, returning false if it was already used. Rows
// older than the max TTL are pruned opportunistically so the table stays small
// while every accepted expiry still outlives its nonce.
export function consumeNonce(agentId: string, nonce: string): boolean {
  const db = getDb();
  const res = db
    .prepare("INSERT INTO used_nonces (agent_id, nonce) VALUES (?, ?) ON CONFLICT(agent_id, nonce) DO NOTHING")
    .run(agentId, nonce);
  db.prepare("DELETE FROM used_nonces WHERE used_at < datetime('now', ?)").run(`-${NONCE_PRUNE_SECONDS} seconds`);
  return res.changes > 0;
}

// Checks an agent's scope and returns a deny reason, or null if allowed.
// Verifies the signature before consulting the scope, so an invalid signature
// is indistinguishable from a valid-but-out-of-scope one at the call site.
// A per-secret policy (when set) is an additional gate layered on top of the
// agent's own scope: the agent must satisfy both.
export function authorizeAction(agentId: string, action: "read" | "write", target: string, nonce: string, exp: number, signatureB64: string): string | null {
  const agent = getAgent(agentId);
  if (!agent) return "Unknown agent";
  if (isAgentRevoked(agentId)) return "Agent revoked";
  if (!verifyAgentSignature(agentId, action, target, nonce, exp, signatureB64)) return "Invalid agent signature";
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(exp) || exp < now - NONCE_SKEW_SECONDS) return "Request expired";
  if (exp > now + NONCE_MAX_TTL_SECONDS) return "Request expiry too far in the future";
  if (!consumeNonce(agentId, nonce)) return "Nonce already used";
  const groupAllowed = getGroupScopes(agentId).some((g) => scopeMatches(g, action, target));
  if (!scopeMatches(agent.scope, action, target) && !groupAllowed) return `Out of scope (agent scope: "${agent.scope || "(none)"}")`;
  const policy = getSecretPolicy(target);
  if (policy !== "" && !policyMatches(policy, action, agent.name)) {
    return `Denied by per-secret policy for "${target}"`;
  }
  return null;
}

// ── Per-secret access policies ────────────────────────────────────────────────
//
// A policy is attached to a single secret and constrains *which agents* (matched
// by name) may act on it, independently of each agent's own broad scope. Grammar:
//   policy     := permission (whitespace | ',' | ';')* permission*
//   permission := "*" | action ":" glob
//   action     := "read" | "write" | "*"
//   glob       := shell-style wildcard over agent NAMES
//
// Examples: "*", "read:billing-* write:admin", "read:web-* write:*".
// An empty policy ("") means no per-secret restriction — fall back to agent scope.

export function policyMatches(policy: string, action: "read" | "write", agentName: string): boolean {
  for (const perm of policy.split(/[\s,;]+/)) {
    const p = perm.trim();
    if (!p) continue;
    if (p === "*") return true;
    const idx = p.indexOf(":");
    if (idx === -1) continue;
    const permAction = p.slice(0, idx);
    const pattern = p.slice(idx + 1);
    if (permAction !== action && permAction !== "*") continue;
    if (pattern === "*" || globMatch(pattern, agentName)) return true;
  }
  return false;
}

export function setSecretPolicy(secret: string, policy: string): void {
  const db = getDb();
  if (policy.trim() === "") {
    db.prepare("DELETE FROM secret_policies WHERE secret = ?").run(secret);
  } else {
    db.prepare("INSERT INTO secret_policies (secret, policy) VALUES (?, ?) ON CONFLICT(secret) DO UPDATE SET policy = excluded.policy").run(secret, policy);
  }
}

export function clearSecretPolicy(secret: string): void {
  const db = getDb();
  db.prepare("DELETE FROM secret_policies WHERE secret = ?").run(secret);
}

export function getSecretPolicy(secret: string): string {
  const db = getDb();
  const row = db.prepare("SELECT policy FROM secret_policies WHERE secret = ?").get(secret) as { policy: string } | undefined;
  return row?.policy ?? "";
}

export function listSecretPolicies(): { secret: string; policy: string }[] {
  const db = getDb();
  return db.prepare("SELECT secret, policy FROM secret_policies ORDER BY secret").all() as { secret: string; policy: string }[];
}

// Returns the subset of `secrets` this agent may read, considering both its
// scope and any per-secret policies. Used to filter `list_secrets` results.
export function filterReadableSecrets(agentId: string, secrets: string[]): string[] {
  const agent = getAgent(agentId);
  if (!agent) return [];
  const groupScopes = getGroupScopes(agentId);
  return secrets.filter((name) => {
    if (!scopeMatches(agent.scope, "read", name) && !groupScopes.some((g) => scopeMatches(g, "read", name))) return false;
    const policy = getSecretPolicy(name);
    if (policy !== "" && !policyMatches(policy, "read", agent.name)) return false;
    return true;
  });
}

// ── Central revocation ────────────────────────────────────────────────────────
//
// A signed deny list (exported/imported via the control plane) marks an agent
// as revoked. Revocation is enforced in authorizeAction above, before any scope
// or policy check, so a revoked agent is denied read and write regardless of
// what its scope would otherwise allow.

export function revokeAgent(agentId: string, reason = ""): void {
  const db = getDb();
  db.prepare("INSERT INTO revoked_agents (agent_id, reason) VALUES (?, ?) ON CONFLICT(agent_id) DO UPDATE SET reason = excluded.reason").run(agentId, reason);
}

export function unrevokeAgent(agentId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM revoked_agents WHERE agent_id = ?").run(agentId);
}

export function listRevokedAgents(): { agentId: string; reason: string; revokedAt: string }[] {
  const db = getDb();
  return db.prepare("SELECT agent_id AS agentId, reason, revoked_at AS revokedAt FROM revoked_agents ORDER BY revoked_at").all() as { agentId: string; reason: string; revokedAt: string }[];
}

export function isAgentRevoked(agentId: string): boolean {
  const db = getDb();
  return db.prepare("SELECT 1 FROM revoked_agents WHERE agent_id = ?").get(agentId) !== undefined;
}

// Reconciles the org's deny list into the local revocation table. Rows this org
// previously synced (source "org:<orgId>") that are absent from the incoming
// list are removed, so un-revoking an agent propagates. Local (source "local")
// revocations are untouched.
export function replaceOrgRevocations(orgId: string, entries: { agentId: string; reason?: string }[]): number {
  const db = getDb();
  const source = `org:${orgId}`;
  const upsert = db.prepare(
    "INSERT INTO revoked_agents (agent_id, reason, source) VALUES (?, ?, ?) ON CONFLICT(agent_id) DO UPDATE SET reason = excluded.reason, source = excluded.source",
  );
  const incoming = new Set<string>();
  for (const e of entries) {
    if (!e || typeof e.agentId !== "string") continue;
    incoming.add(e.agentId);
    upsert.run(e.agentId, typeof e.reason === "string" ? e.reason : "", source);
  }
  const del = db.prepare("DELETE FROM revoked_agents WHERE source = ? AND agent_id = ?");
  const existing = db.prepare("SELECT agent_id FROM revoked_agents WHERE source = ?").all(source) as { agent_id: string }[];
  for (const row of existing) {
    if (!incoming.has(row.agent_id)) del.run(source, row.agent_id);
  }
  return incoming.size;
}

// ── Group grants ──────────────────────────────────────────────────────────────
//
// A synced org manifest contributes per-agent group-derived scope. These grants
// are UNIONed with the agent's own local scope in authorizeAction, so a group
// can grant access a personal scope does not; only the deny list removes access.

export function getGroupScopes(agentId: string): string[] {
  const db = getDb();
  return (db.prepare("SELECT scope FROM group_grants WHERE agent_id = ?").all(agentId) as { scope: string }[]).map((r) => r.scope);
}

export function replaceOrgGrants(orgId: string, grants: { agentId: string; scope?: string }[]): number {
  const db = getDb();
  db.prepare("DELETE FROM group_grants WHERE org_id = ?").run(orgId);
  const insert = db.prepare("INSERT INTO group_grants (org_id, agent_id, scope) VALUES (?, ?, ?)");
  let n = 0;
  for (const g of grants) {
    if (!g || typeof g.agentId !== "string") continue;
    insert.run(orgId, g.agentId, typeof g.scope === "string" ? g.scope : "");
    n++;
  }
  return n;
}

export function listGroupGrants(): { orgId: string; agentId: string; scope: string; syncedAt: string }[] {
  const db = getDb();
  return db.prepare("SELECT org_id AS orgId, agent_id AS agentId, scope, synced_at AS syncedAt FROM group_grants ORDER BY org_id, agent_id").all() as { orgId: string; agentId: string; scope: string; syncedAt: string }[];
}

// ── Org sync state ────────────────────────────────────────────────────────────
//
// Tracks the last successful control-plane sync per org: the monotonic
// last-synced timestamp and the manifest version (ETag) seen, so the enforcement
// path can decide whether a re-sync is due and make conditional 304 requests.

export interface OrgSyncState {
  lastSyncedAt: number | null;
  version: string;
}

export function getOrgSyncState(orgId: string): OrgSyncState {
  const db = getDb();
  const row = db.prepare("SELECT last_synced_at AS lastSyncedAt, version FROM org_sync_state WHERE org_id = ?").get(orgId) as
    | { lastSyncedAt: number; version: string }
    | undefined;
  if (!row) return { lastSyncedAt: null, version: "" };
  return { lastSyncedAt: row.lastSyncedAt, version: row.version };
}

export function setOrgSyncState(orgId: string, version: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO org_sync_state (org_id, last_synced_at, version) VALUES (?, ?, ?) ON CONFLICT(org_id) DO UPDATE SET last_synced_at = excluded.last_synced_at, version = excluded.version",
  ).run(orgId, Date.now(), version);
}

// ── Mandatory enforcement flag ───────────────────────────────────────────────
//
// When enabled (a marker file exists at ~/.keyblind/.require-agent-scope), every
// secret-access MCP call must carry a valid signed agent identity; anonymous
// access is refused. Off by default so direct CLI / human use keeps working.

function ledgerHome(): string {
  return _dbPath ? path.dirname(_dbPath) : path.join(os.homedir(), ".keyblind");
}

function scopeMarkerPath(): string {
  return path.join(ledgerHome(), ".require-agent-scope");
}

export function isAgentScopeRequired(): boolean {
  return fs.existsSync(scopeMarkerPath());
}

export function setAgentScopeRequirement(enabled: boolean): void {
  if (enabled) {
    const dir = path.dirname(scopeMarkerPath());
    fs.mkdirSync(dir, { mode: 0o700, recursive: true });
    fs.writeFileSync(scopeMarkerPath(), "", { mode: 0o600 });
  } else {
    fs.rmSync(scopeMarkerPath(), { force: true });
  }
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
