import crypto from "node:crypto";
import { getDb, migrate } from "./db";
import { generateOrgKey } from "./org-key";

export type Role = "owner" | "admin" | "member";

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface OrgRow {
  id: string;
  name: string;
  slug: string;
  publicKey: string;
  createdAt: string;
}

export interface MemberRow {
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  joinedAt: string;
}

export interface GroupRow {
  id: string;
  name: string;
  scope: string;
}

export interface AgentRow {
  agentId: string;
  userId: string;
  name: string | null;
  publicKey: string | null;
  createdAt: string;
}

export interface RevocationRow {
  agentId: string;
  reason: string;
  revokedAt: string;
}

export async function getOrCreateUser(email: string, name?: string): Promise<UserRow> {
  await migrate();
  const db = getDb();
  const existing = await db.execute({ sql: "SELECT id, email, name, created_at AS createdAt FROM users WHERE email = ?", args: [email] });
  if (existing.rows.length > 0) {
    const r = existing.rows[0];
    return { id: String(r.id), email: String(r.email), name: r.name == null ? null : String(r.name), createdAt: String(r.createdAt) };
  }
  const id = crypto.randomUUID();
  await db.execute({ sql: "INSERT INTO users (id, email, name) VALUES (?, ?, ?)", args: [id, email, name ?? null] });
  return { id, email, name: name ?? null, createdAt: new Date().toISOString() };
}

export async function createOrg(name: string, slug: string, ownerEmail: string): Promise<OrgRow> {
  await migrate();
  const owner = await getOrCreateUser(ownerEmail);
  const { publicKey, encrypted } = generateOrgKey();
  const id = crypto.randomUUID();
  const db = getDb();
  await db.batch(
    [
      {
        sql: "INSERT INTO orgs (id, name, slug, public_key, enc_private_key, enc_iv, enc_tag) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [id, name, slug, publicKey, encrypted.ciphertext, encrypted.iv, encrypted.tag],
      },
      { sql: "INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, 'owner')", args: [id, owner.id] },
    ],
    "write",
  );
  return { id, name, slug, publicKey, createdAt: new Date().toISOString() };
}

export async function getOrgBySlug(slug: string): Promise<OrgRow | null> {
  await migrate();
  const db = getDb();
  const r = await db.execute({ sql: "SELECT id, name, slug, public_key AS publicKey, created_at AS createdAt FROM orgs WHERE slug = ?", args: [slug] });
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return { id: String(row.id), name: String(row.name), slug: String(row.slug), publicKey: String(row.publicKey), createdAt: String(row.createdAt) };
}

export async function getOrgForUser(userId: string): Promise<{ org: OrgRow; role: Role } | null> {
  await migrate();
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT o.id, o.name, o.slug, o.public_key AS publicKey, o.created_at AS createdAt, m.role
          FROM org_members m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = ? LIMIT 1`,
    args: [userId],
  });
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    org: { id: String(row.id), name: String(row.name), slug: String(row.slug), publicKey: String(row.publicKey), createdAt: String(row.createdAt) },
    role: String(row.role) as Role,
  };
}

async function getRole(userId: string, orgId: string): Promise<Role | null> {
  const db = getDb();
  const r = await db.execute({ sql: "SELECT role FROM org_members WHERE org_id = ? AND user_id = ?", args: [orgId, userId] });
  if (r.rows.length === 0) return null;
  return String(r.rows[0].role) as Role;
}

export async function assertRole(orgId: string, userId: string, allowed: Role[]): Promise<Role> {
  const role = await getRole(userId, orgId);
  if (!role || !allowed.includes(role)) throw new Error("Forbidden");
  return role;
}

export async function listMembers(orgId: string): Promise<MemberRow[]> {
  await migrate();
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT u.id AS userId, u.email, u.name, m.role, m.joined_at AS joinedAt
          FROM org_members m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY m.joined_at`,
    args: [orgId],
  });
  return r.rows.map((row) => ({
    userId: String(row.userId),
    email: String(row.email),
    name: row.name == null ? null : String(row.name),
    role: String(row.role) as Role,
    joinedAt: String(row.joinedAt),
  }));
}

export async function inviteMember(orgId: string, email: string, name?: string): Promise<MemberRow> {
  await migrate();
  const user = await getOrCreateUser(email, name);
  const db = getDb();
  await db.execute({
    sql: "INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, 'member') ON CONFLICT(org_id, user_id) DO NOTHING",
    args: [orgId, user.id],
  });
  const role = await getRole(user.id, orgId);
  return { userId: user.id, email: user.email, name: user.name, role: role ?? "member", joinedAt: new Date().toISOString() };
}

export async function setMemberRole(orgId: string, targetUserId: string, role: Role): Promise<void> {
  await migrate();
  const db = getDb();
  await db.execute({ sql: "UPDATE org_members SET role = ? WHERE org_id = ? AND user_id = ?", args: [role, orgId, targetUserId] });
}

export async function createGroup(orgId: string, name: string, scope: string): Promise<GroupRow> {
  await migrate();
  const id = crypto.randomUUID();
  const db = getDb();
  await db.execute({ sql: "INSERT INTO groups (id, org_id, name, scope) VALUES (?, ?, ?, ?)", args: [id, orgId, name, scope] });
  return { id, name, scope };
}

export async function listGroups(orgId: string): Promise<GroupRow[]> {
  await migrate();
  const db = getDb();
  const r = await db.execute({ sql: "SELECT id, name, scope FROM groups WHERE org_id = ? ORDER BY name", args: [orgId] });
  return r.rows.map((row) => ({ id: String(row.id), name: String(row.name), scope: String(row.scope) }));
}

export async function addGroupMember(orgId: string, groupId: string, userId: string): Promise<void> {
  await migrate();
  const db = getDb();
  await db.execute({
    sql: "INSERT INTO group_members (group_id, user_id) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM groups WHERE id = ? AND org_id = ?)",
    args: [groupId, userId, groupId, orgId],
  });
}

export async function removeGroupMember(orgId: string, groupId: string, userId: string): Promise<void> {
  await migrate();
  const db = getDb();
  await db.execute({ sql: "DELETE FROM group_members WHERE group_id = ? AND user_id = ? AND group_id IN (SELECT id FROM groups WHERE org_id = ?)", args: [groupId, userId, orgId] });
}

export async function bindAgent(orgId: string, userId: string, agentId: string, name?: string, publicKey?: string): Promise<void> {
  await migrate();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO agent_bindings (agent_id, org_id, user_id, name, public_key) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(agent_id) DO UPDATE SET org_id = excluded.org_id, user_id = excluded.user_id, name = excluded.name, public_key = excluded.public_key`,
    args: [agentId, orgId, userId, name ?? null, publicKey ?? null],
  });
}

export async function listAgents(orgId: string): Promise<AgentRow[]> {
  await migrate();
  const db = getDb();
  const r = await db.execute({ sql: "SELECT agent_id AS agentId, user_id AS userId, name, public_key AS publicKey, created_at AS createdAt FROM agent_bindings WHERE org_id = ? ORDER BY created_at", args: [orgId] });
  return r.rows.map((row) => ({
    agentId: String(row.agentId),
    userId: String(row.userId),
    name: row.name == null ? null : String(row.name),
    publicKey: row.publicKey == null ? null : String(row.publicKey),
    createdAt: String(row.createdAt),
  }));
}

export async function revokeAgent(orgId: string, agentId: string, reason: string, revokedBy: string): Promise<void> {
  await migrate();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO revocations (org_id, agent_id, reason, revoked_by) VALUES (?, ?, ?, ?)
          ON CONFLICT(org_id, agent_id) DO UPDATE SET reason = excluded.reason, revoked_by = excluded.revoked_by`,
    args: [orgId, agentId, reason, revokedBy],
  });
}

export async function unrevokeAgent(orgId: string, agentId: string): Promise<void> {
  await migrate();
  const db = getDb();
  await db.execute({ sql: "DELETE FROM revocations WHERE org_id = ? AND agent_id = ?", args: [orgId, agentId] });
}

export async function listRevocations(orgId: string): Promise<RevocationRow[]> {
  await migrate();
  const db = getDb();
  const r = await db.execute({ sql: "SELECT agent_id AS agentId, reason, revoked_at AS revokedAt FROM revocations WHERE org_id = ? ORDER BY revoked_at", args: [orgId] });
  return r.rows.map((row) => ({ agentId: String(row.agentId), reason: String(row.reason), revokedAt: String(row.revokedAt) }));
}

// Derives each agent's group scope: the union of scopes of every group its
// owning user belongs to. This is what the signed manifest distributes to local
// vaults for union-with-local-scope enforcement.
export async function computeAgentScopes(orgId: string): Promise<{ agentId: string; scope: string }[]> {
  await migrate();
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT ab.agent_id AS agentId, g.scope
          FROM agent_bindings ab
          JOIN group_members gm ON gm.user_id = ab.user_id
          JOIN groups g ON g.id = gm.group_id
          WHERE ab.org_id = ? AND g.org_id = ?`,
    args: [orgId, orgId],
  });
  const map = new Map<string, string[]>();
  for (const row of r.rows) {
    const agentId = String(row.agentId);
    const scope = String(row.scope || "").trim();
    if (!map.has(agentId)) map.set(agentId, []);
    if (scope) map.get(agentId)!.push(scope);
  }
  return Array.from(map.entries()).map(([agentId, scopes]) => ({ agentId, scope: scopes.join(" ") }));
}
