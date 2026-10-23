import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getLedgerDb, replaceOrgGrants, replaceOrgRevocations } from "./ledger.js";
import { trustOrg, listTrustedOrgs, canonicalize, verifyPayload } from "./control-plane.js";

// Hosted control-plane sync: connect a local vault to a hosted org and pull its
// signed manifest (deny list + group-derived agent scopes). The manifest is
// Ed25519-signed by the org key, so a local vault only honors it after trusting
// the org public key (control-plane trust / connectOrg).

const FORMAT = "keyblind-control-plane-v2";

export interface OrgConnection {
  url: string;
  orgId: string;
  orgPublicKey: string;
}

function orgSyncHome(): string {
  const name = getLedgerDb().name;
  return name ? path.dirname(name) : path.join(os.homedir(), ".keyblind");
}

function connectionPath(): string {
  return path.join(orgSyncHome(), "connection.json");
}

export function getOrgConnection(): OrgConnection | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(connectionPath(), "utf8")) as OrgConnection;
    if (parsed && typeof parsed.url === "string" && typeof parsed.orgId === "string" && typeof parsed.orgPublicKey === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function connectOrg(url: string): Promise<OrgConnection> {
  const normalized = url.replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${normalized}/well-known`);
  } catch (err) {
    throw new Error(`Could not reach control plane at ${normalized}: ${(err as Error).message}`);
  }
  if (!res.ok) throw new Error(`Control plane at ${normalized} returned ${res.status}`);
  const info = (await res.json()) as { orgId?: string; name?: string; publicKey?: string };
  if (!info || typeof info.orgId !== "string" || typeof info.publicKey !== "string") {
    throw new Error(`Control plane at ${normalized} did not return org identity`);
  }
  trustOrg(info.publicKey);
  const conn: OrgConnection = { url: normalized, orgId: info.orgId, orgPublicKey: info.publicKey };
  const dir = orgSyncHome();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { mode: 0o700, recursive: true });
  fs.writeFileSync(connectionPath(), JSON.stringify(conn), { mode: 0o600 });
  return conn;
}

export function disconnectOrg(): void {
  fs.rmSync(connectionPath(), { force: true });
}

export async function syncOrg(): Promise<{ revoked: number; grants: number }> {
  const conn = getOrgConnection();
  if (!conn) throw new Error("Not connected to an org. Run: keyblind control-plane connect <url>");

  let res: Response;
  try {
    res = await fetch(`${conn.url}/manifest`);
  } catch (err) {
    throw new Error(`Could not reach control plane at ${conn.url}: ${(err as Error).message}`);
  }
  if (!res.ok) throw new Error(`Control plane at ${conn.url} returned ${res.status}`);

  let manifest: any;
  try {
    manifest = await res.json();
  } catch {
    throw new Error("Control plane returned an invalid manifest");
  }

  if (manifest?.format !== FORMAT) throw new Error(`Invalid manifest: unknown format "${manifest?.format}"`);
  const { signature, ...doc } = manifest;
  if (typeof signature !== "string" || !signature) throw new Error("Invalid manifest: missing signature");
  const org = doc.org as { id?: string; publicKey?: string } | undefined;
  if (!org || typeof org.publicKey !== "string" || !org.publicKey) throw new Error("Invalid manifest: missing org public key");
  if (org.publicKey !== conn.orgPublicKey) throw new Error("Invalid manifest: org public key does not match the connected org");
  if (!listTrustedOrgs().includes(org.publicKey)) throw new Error(`Untrusted org public key. Run: keyblind control-plane trust ${org.publicKey}`);
  if (!verifyPayload(canonicalize(doc), signature, org.publicKey)) throw new Error("Invalid manifest: signature verification failed");

  const denyList = Array.isArray(doc.denyList) ? doc.denyList : [];
  const agentScopes = Array.isArray(doc.agentScopes) ? doc.agentScopes : [];
  const revoked = replaceOrgRevocations(conn.orgId, denyList);
  const grants = replaceOrgGrants(conn.orgId, agentScopes);
  return { revoked, grants };
}
