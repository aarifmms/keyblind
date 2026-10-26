import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getLedgerDb, replaceOrgGrants, replaceOrgRevocations, getOrgSyncState, setOrgSyncState } from "./ledger.js";
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
  maxStalenessSeconds?: number;
  failClosed?: boolean;
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

// Revocation freshness policy: how stale a synced manifest may be before the
// enforcement path re-pulls it, and whether a failed re-sync denies access
// (fail-closed) or proceeds on last-known state (fail-open). Stored on the
// org connection; -1 disables auto re-sync entirely (manual `sync` only).
const DEFAULT_MAX_STALENESS_SECONDS = 60;

export interface RevocationPolicy {
  maxStalenessSeconds: number;
  failClosed: boolean;
}

function updateConnection(mutate: (conn: OrgConnection) => void): OrgConnection {
  const conn = getOrgConnection();
  if (!conn) throw new Error("Not connected to an org. Run: keyblind control-plane connect <url>");
  mutate(conn);
  fs.writeFileSync(connectionPath(), JSON.stringify(conn), { mode: 0o600 });
  return conn;
}

export function getRevocationPolicy(): RevocationPolicy {
  const conn = getOrgConnection();
  const env = process.env.KEYBLIND_REVOCATION_MAX_STALENESS;
  const parsedEnv = env !== undefined && env !== "" ? Number(env) : NaN;
  const maxStalenessSeconds = Number.isFinite(parsedEnv)
    ? parsedEnv
    : typeof conn?.maxStalenessSeconds === "number"
      ? conn.maxStalenessSeconds
      : DEFAULT_MAX_STALENESS_SECONDS;
  return { maxStalenessSeconds, failClosed: Boolean(conn?.failClosed) };
}

export function setRevocationStaleness(seconds: number): void {
  if (!Number.isInteger(seconds) || seconds < -1) throw new Error("Staleness must be an integer >= -1 seconds");
  updateConnection((conn) => { conn.maxStalenessSeconds = seconds; });
}

export function setRevocationFailClosed(enabled: boolean): void {
  updateConnection((conn) => { conn.failClosed = enabled; });
}

export async function syncOrg(): Promise<{ changed: boolean; version: string; revoked: number; grants: number }> {
  const conn = getOrgConnection();
  if (!conn) throw new Error("Not connected to an org. Run: keyblind control-plane connect <url>");

  const state = getOrgSyncState(conn.orgId);
  const headers: Record<string, string> = {};
  if (state.version) headers["If-None-Match"] = state.version;

  let res: Response;
  try {
    res = await fetch(`${conn.url}/manifest`, { headers });
  } catch (err) {
    throw new Error(`Could not reach control plane at ${conn.url}: ${(err as Error).message}`);
  }

  if (res.status === 304) {
    setOrgSyncState(conn.orgId, state.version);
    return { changed: false, version: state.version, revoked: 0, grants: 0 };
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
  const version = res.headers.get("etag") ?? "";
  setOrgSyncState(conn.orgId, version);
  return { changed: true, version, revoked, grants };
}

// Re-pulls the signed manifest if the last sync is older than the configured
// staleness window. Called on the enforcement path so a remote revocation takes
// effect within the window rather than waiting for a manual `control-plane sync`.
// A single in-flight sync is shared across concurrent callers. On failure it
// throws only in fail-closed mode; otherwise it logs and proceeds (fail-open).
let _inflight: Promise<void> | null = null;

export async function ensureFreshRevocation(): Promise<void> {
  const conn = getOrgConnection();
  if (!conn) return;
  const { maxStalenessSeconds, failClosed } = getRevocationPolicy();
  if (maxStalenessSeconds < 0) return;
  const state = getOrgSyncState(conn.orgId);
  const fresh = state.lastSyncedAt !== null && Date.now() - state.lastSyncedAt < maxStalenessSeconds * 1000;
  if (fresh) return;

  if (_inflight) {
    await _inflight;
    return;
  }

  const run = (async () => {
    try {
      await syncOrg();
    } catch (err) {
      if (failClosed) throw err;
      console.error(`[keyblind] control-plane sync failed (fail-open): ${(err as Error).message}`);
    }
  })();

  _inflight = run;
  try {
    await run;
  } finally {
    _inflight = null;
  }
}
