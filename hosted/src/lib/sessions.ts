import crypto from "node:crypto";
import { getDb, migrate } from "./db";

export interface SessionRecord {
  id: string;
  userId: string;
  issuer: string;
  sub: string;
  sid: string | null;
  idTokenHint: string | null;
  refreshToken: string | null;
  revokedAt: string | null;
}

export async function createSession(input: {
  userId: string;
  issuer: string;
  sub: string;
  sid?: string;
  idTokenHint?: string;
  refreshToken?: string;
  expiresAt?: string;
}): Promise<string> {
  await migrate();
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO sessions (id, user_id, issuer, sub, sid, id_token_hint, refresh_token, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, input.userId, input.issuer, input.sub, input.sid ?? null, input.idTokenHint ?? null, input.refreshToken ?? null, input.expiresAt ?? null],
  });
  return id;
}

export async function getSession(id: string): Promise<SessionRecord | null> {
  await migrate();
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT id, user_id AS userId, issuer, sub, sid, id_token_hint AS idTokenHint,
                 refresh_token AS refreshToken, revoked_at AS revokedAt
          FROM sessions WHERE id = ?`,
    args: [id],
  });
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    id: String(row.id),
    userId: String(row.userId),
    issuer: String(row.issuer),
    sub: String(row.sub),
    sid: row.sid == null ? null : String(row.sid),
    idTokenHint: row.idTokenHint == null ? null : String(row.idTokenHint),
    refreshToken: row.refreshToken == null ? null : String(row.refreshToken),
    revokedAt: row.revokedAt == null ? null : String(row.revokedAt),
  };
}

export async function isSessionRevoked(id: string): Promise<boolean> {
  const session = await getSession(id);
  return session ? session.revokedAt !== null : false;
}

export async function revokeSession(id: string): Promise<void> {
  await migrate();
  const db = getDb();
  await db.execute({ sql: "UPDATE sessions SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL", args: [id] });
}

// Revokes every live session matching an IdP identity. For backchannel logout:
// the IdP asserts a `sub` and/or `sid`, and we revoke all sessions sharing it.
export async function revokeSessionsByIdp(issuer: string, sub?: string, sid?: string): Promise<number> {
  await migrate();
  const db = getDb();
  const conditions: string[] = ["issuer = ?"];
  const args: string[] = [issuer];
  if (sub) {
    conditions.push("sub = ?");
    args.push(sub);
  }
  if (sid) {
    conditions.push("sid = ?");
    args.push(sid);
  }
  const r = await db.execute({
    sql: `UPDATE sessions SET revoked_at = datetime('now') WHERE revoked_at IS NULL AND ${conditions.join(" AND ")}`,
    args,
  });
  return Number(r.rowsAffected ?? 0);
}
