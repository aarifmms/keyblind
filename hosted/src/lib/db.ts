import { createClient, type Client } from "@libsql/client";

let _client: Client | null = null;

export function getDb(): Client {
  if (_client) return _client;
  const url = process.env.TURSO_DATABASE_URL || "file:./dev.db";
  _client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  return _client;
}

let _migrated: Promise<void> | null = null;

export function migrate(): Promise<void> {
  if (!_migrated) _migrated = runMigrate();
  return _migrated;
}

async function runMigrate(): Promise<void> {
  const db = getDb();
  const statements = [
    `CREATE TABLE IF NOT EXISTS orgs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      public_key TEXT NOT NULL,
      enc_private_key TEXT NOT NULL,
      enc_iv TEXT NOT NULL,
      enc_tag TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS org_members (
      org_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(org_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      name TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY(group_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS agent_bindings (
      agent_id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT,
      public_key TEXT,
      scope TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS revocations (
      org_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      revoked_by TEXT,
      revoked_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(org_id, agent_id)
    )`,
  ];
  await db.batch(statements, "write");
}
