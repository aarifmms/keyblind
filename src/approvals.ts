import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { getLedgerDb } from "./ledger.js";
import { encrypt, decrypt, getKey, storeSecret, deleteSecret } from "./vault.js";
import { fireAlert } from "./alerts.js";

// Human-in-the-loop approval queue for agent-initiated writes. Requests are
// append-only and hash-chained (like the agent ledger) so any later edit or
// reorder is detectable. Queued values are encrypted with the vault key and
// never stored in plaintext.

const GENESIS = crypto.createHash("sha256").update("keyblind-approvals-genesis-v1").digest("hex");

export interface Approval {
  id: string;
  agentId: string;
  agentName: string;
  sponsor: string;
  action: string;
  target: string;
  metadata: string;
  status: "pending" | "approved" | "denied";
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

function approvalHome(): string {
  // Derive the marker location from the ledger DB path so a redirected ledger
  // (e.g. in tests) keeps its approval state alongside it.
  const name = getLedgerDb().name;
  return name ? path.dirname(name) : path.join(os.homedir(), ".keyblind");
}

function markerPath(): string {
  return path.join(approvalHome(), ".require-approval");
}

export function isApprovalRequired(): boolean {
  return fs.existsSync(markerPath());
}

export function setApprovalRequirement(enabled: boolean): void {
  if (enabled) {
    const dir = approvalHome();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { mode: 0o700, recursive: true });
    fs.writeFileSync(markerPath(), "", { mode: 0o600 });
  } else {
    fs.rmSync(markerPath(), { force: true });
  }
}

export function requireApprovalFor(secret: string): void {
  const db = getLedgerDb();
  db.prepare("INSERT INTO approval_required (secret) VALUES (?) ON CONFLICT(secret) DO NOTHING").run(secret);
}

export function unrequireApprovalFor(secret: string): void {
  const db = getLedgerDb();
  db.prepare("DELETE FROM approval_required WHERE secret = ?").run(secret);
}

export function listApprovalRequired(): string[] {
  const db = getLedgerDb();
  return (db.prepare("SELECT secret FROM approval_required ORDER BY secret").all() as { secret: string }[]).map((r) => r.secret);
}

export function approvalRequiredFor(target: string): boolean {
  if (isApprovalRequired()) return true;
  const db = getLedgerDb();
  const row = db.prepare("SELECT 1 FROM approval_required WHERE secret = ?").get(target);
  return row !== undefined;
}

function computeHash(id: string, agentId: string, action: string, target: string, requestedAt: string, prevHash: string): string {
  return crypto
    .createHash("sha256")
    .update([id, agentId, action, target, requestedAt, prevHash].join("|"))
    .digest("hex");
}

export function requestApproval(agentId: string, action: string, target: string, value?: string): { id: string; status: string } {
  const db = getLedgerDb();
  const id = crypto.randomUUID();
  const requestedAt = new Date().toISOString();
  const prev = db.prepare("SELECT hash FROM approvals ORDER BY requested_at DESC, id DESC LIMIT 1").get() as { hash: string } | undefined;
  const prevHash = prev?.hash ?? GENESIS;
  const hash = computeHash(id, agentId, action, target, requestedAt, prevHash);

  let enc: Buffer | null = null;
  let iv: Buffer | null = null;
  let authTag: Buffer | null = null;
  if (value !== undefined) {
    const { encrypted, iv: vIv, authTag: vAuthTag } = encrypt(value, getKey());
    enc = encrypted;
    iv = vIv;
    authTag = vAuthTag;
  }

  db.prepare(`
    INSERT INTO approvals (id, agent_id, action, target, value_encrypted, value_iv, value_auth_tag, status, requested_at, prev_hash, hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(id, agentId, action, target, enc, iv, authTag, requestedAt, prevHash, hash);

  void fireAlert("approval_requested", target, { agentId, action, approvalId: id });
  return { id, status: "pending" };
}

export function listApprovals(status?: string): Approval[] {
  const db = getLedgerDb();
  const base = `SELECT a.id, a.agent_id, a.action, a.target, a.metadata, a.status, a.requested_at, a.decided_at, a.decided_by,
                       ag.name AS agent_name, ag.sponsor
                FROM approvals a LEFT JOIN agents ag ON ag.id = a.agent_id`;
  const rows = status
    ? (db.prepare(`${base} WHERE a.status = ? ORDER BY a.requested_at DESC, a.id DESC`).all(status) as any[])
    : (db.prepare(`${base} ORDER BY a.requested_at DESC, a.id DESC`).all() as any[]);
  return rows.map((r) => ({
    id: r.id,
    agentId: r.agent_id,
    agentName: r.agent_name ?? r.agent_id,
    sponsor: r.sponsor ?? "",
    action: r.action,
    target: r.target,
    metadata: r.metadata,
    status: r.status,
    requestedAt: r.requested_at,
    decidedAt: r.decided_at,
    decidedBy: r.decided_by,
  }));
}

function getApprovalRow(id: string): { id: string; agent_id: string; action: string; target: string; value_encrypted: Buffer | null; value_iv: Buffer | null; value_auth_tag: Buffer | null; status: string } | undefined {
  const db = getLedgerDb();
  return db.prepare("SELECT id, agent_id, action, target, value_encrypted, value_iv, value_auth_tag, status FROM approvals WHERE id = ?").get(id) as any;
}

export function approveApproval(id: string, decidedBy: string): { id: string; action: string; target: string; status: string } {
  const db = getLedgerDb();
  const row = getApprovalRow(id);
  if (!row) throw new Error(`Approval ${id} not found`);
  if (row.status !== "pending") throw new Error(`Approval ${id} is already ${row.status}`);

  if (row.action === "store_secret") {
    if (!row.value_encrypted || !row.value_iv || !row.value_auth_tag) {
      throw new Error(`Approval ${id} has no stored value to apply`);
    }
    const value = decrypt(row.value_encrypted, row.value_iv, row.value_auth_tag, getKey());
    storeSecret(row.target, value);
  } else if (row.action === "delete_secret") {
    deleteSecret(row.target);
  } else {
    throw new Error(`Unknown approval action: ${row.action}`);
  }

  db.prepare("UPDATE approvals SET status = 'approved', decided_at = ?, decided_by = ? WHERE id = ?").run(new Date().toISOString(), decidedBy, id);
  return { id, action: row.action, target: row.target, status: "approved" };
}

export function denyApproval(id: string, decidedBy: string): { id: string; status: string } {
  const db = getLedgerDb();
  const row = getApprovalRow(id);
  if (!row) throw new Error(`Approval ${id} not found`);
  if (row.status !== "pending") throw new Error(`Approval ${id} is already ${row.status}`);

  db.prepare("UPDATE approvals SET status = 'denied', decided_at = ?, decided_by = ? WHERE id = ?").run(new Date().toISOString(), decidedBy, id);
  return { id, status: "denied" };
}

export function pendingApprovalCount(): number {
  const db = getLedgerDb();
  const row = db.prepare("SELECT COUNT(*) AS c FROM approvals WHERE status = 'pending'").get() as { c: number };
  return row.c;
}
