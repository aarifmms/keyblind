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
      plan TEXT NOT NULL DEFAULT 'free',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      seat_limit INTEGER NOT NULL DEFAULT 3,
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
    `CREATE TABLE IF NOT EXISTS user_identities (
      issuer TEXT NOT NULL,
      sub TEXT NOT NULL,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(issuer, sub)
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      issuer TEXT NOT NULL,
      sub TEXT NOT NULL,
      sid TEXT,
      id_token_hint TEXT,
      refresh_token TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT,
      revoked_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_issuer_sub ON sessions(issuer, sub)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_issuer_sid ON sessions(issuer, sid)`,
  ];
  await db.batch(statements, "write");
  await ensureColumns();
}

// Adds columns introduced after the initial schema to already-existing databases.
// `CREATE TABLE IF NOT EXISTS` never alters an existing table, so column additions
// must be applied here, guarded by a pragma check so the ALTER is idempotent.
async function ensureColumns(): Promise<void> {
  const db = getDb();
  const additions: { table: string; column: string; ddl: string }[] = [
    { table: "orgs", column: "plan", ddl: "ALTER TABLE orgs ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'" },
    { table: "orgs", column: "stripe_customer_id", ddl: "ALTER TABLE orgs ADD COLUMN stripe_customer_id TEXT" },
    { table: "orgs", column: "stripe_subscription_id", ddl: "ALTER TABLE orgs ADD COLUMN stripe_subscription_id TEXT" },
    { table: "orgs", column: "seat_limit", ddl: "ALTER TABLE orgs ADD COLUMN seat_limit INTEGER NOT NULL DEFAULT 3" },
  ];
  for (const { table, column, ddl } of additions) {
    const info = await db.execute({ sql: `PRAGMA table_info(${table})`, args: [] });
    const exists = info.rows.some((r) => String(r.name) === column);
    if (!exists) await db.execute(ddl);
  }
}
