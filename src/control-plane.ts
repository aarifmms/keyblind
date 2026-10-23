import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getLedgerDb, listAgents, listEntries, verify, listSecretPolicies, revokeAgent, listRevokedAgents } from "./ledger.js";
import { getProjectName, listSecretInventory, listRotationNeeded } from "./vault.js";
import { listApprovals, listApprovalRequired } from "./approvals.js";

// Central control plane: a value-free, signed export of everything a security
// team needs for org-wide visibility, plus a signed deny list (revoked agents)
// that local vaults honor. The export contains NO secret values or ciphertext —
// names and rotation timestamps only — so it can be committed to a git repo or
// object store as the read-only shared view.
//
// Trust model: one Ed25519 org keypair. `initControlPlane` generates it on the
// admin's machine; member machines `trustOrg(pubkey)`. A deny list is honored
// only if its signature verifies against a trusted org public key.

const FORMAT = "keyblind-control-plane-v1";

function controlPlaneHome(): string {
  // Derive the key location from the ledger DB path so a redirected ledger
  // (e.g. in tests) keeps its control-plane state alongside it.
  const name = getLedgerDb().name;
  return name ? path.dirname(name) : path.join(os.homedir(), ".keyblind");
}

function orgKeyPath(): string {
  return path.join(controlPlaneHome(), "org-key.json");
}

function trustedOrgsPath(): string {
  return path.join(controlPlaneHome(), "trusted-orgs.json");
}

interface OrgKey {
  publicKey: string;
  privateKey: string;
  createdAt: string;
}

function readOrgKey(): OrgKey | null {
  try {
    return JSON.parse(fs.readFileSync(orgKeyPath(), "utf8")) as OrgKey;
  } catch {
    return null;
  }
}

export function initControlPlane(): { publicKey: string } {
  const existing = readOrgKey();
  if (existing) return { publicKey: existing.publicKey };

  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyB64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const privateKeyB64 = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");

  const dir = controlPlaneHome();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { mode: 0o700, recursive: true });
  fs.writeFileSync(orgKeyPath(), JSON.stringify({ publicKey: publicKeyB64, privateKey: privateKeyB64, createdAt: new Date().toISOString() }), { mode: 0o600 });

  return { publicKey: publicKeyB64 };
}

export function getOrgPublicKey(): string | null {
  return readOrgKey()?.publicKey ?? null;
}

function getOrgPrivateKey(): string | null {
  return readOrgKey()?.privateKey ?? null;
}

function readTrustedOrgs(): string[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(trustedOrgsPath(), "utf8")) as { publicKeys?: string[] };
    return Array.isArray(parsed.publicKeys) ? parsed.publicKeys : [];
  } catch {
    return [];
  }
}

function writeTrustedOrgs(publicKeys: string[]): void {
  const dir = controlPlaneHome();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { mode: 0o700, recursive: true });
  fs.writeFileSync(trustedOrgsPath(), JSON.stringify({ publicKeys }), { mode: 0o600 });
}

export function trustOrg(publicKeyB64: string): void {
  const keys = readTrustedOrgs();
  if (!keys.includes(publicKeyB64)) {
    keys.push(publicKeyB64);
    writeTrustedOrgs(keys);
  }
}

export function untrustOrg(publicKeyB64: string): void {
  writeTrustedOrgs(readTrustedOrgs().filter((k) => k !== publicKeyB64));
}

export function listTrustedOrgs(): string[] {
  return readTrustedOrgs();
}

function isTrustedOrg(publicKeyB64: string): boolean {
  return readTrustedOrgs().includes(publicKeyB64);
}

// Recursive, key-sorted JSON so that a signature is independent of key order
// and stable across re-serialization. The signer and verifier both call this on
// the document (minus the signature field).
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
}

function signPayload(payload: string, privateKeyB64: string): string {
  const priv = crypto.createPrivateKey({ key: Buffer.from(privateKeyB64, "base64"), format: "der", type: "pkcs8" });
  return crypto.sign(null, Buffer.from(payload, "utf8"), priv).toString("base64");
}

export function verifyPayload(payload: string, signatureB64: string, publicKeyB64: string): boolean {
  try {
    const pub = crypto.createPublicKey({ key: Buffer.from(publicKeyB64, "base64"), format: "der", type: "spki" });
    return crypto.verify(null, Buffer.from(payload, "utf8"), pub, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

function buildDocument() {
  return {
    format: FORMAT,
    project: getProjectName(),
    hostname: os.hostname(),
    exportedAt: new Date().toISOString(),
    orgPublicKey: getOrgPublicKey(),
    secretInventory: listSecretInventory(),
    rotationOverdue: listRotationNeeded(),
    agents: listAgents(),
    policies: listSecretPolicies(),
    approvalRequired: listApprovalRequired(),
    approvals: listApprovals(),
    revokedAgents: listRevokedAgents(),
    ledgerVerification: verify(),
    ledger: listEntries(),
  };
}

export function exportControlPlane(): string {
  const privateKey = getOrgPrivateKey();
  if (!privateKey) throw new Error("Control plane not initialized. Run: keyblind control-plane init");

  const doc = buildDocument();
  const signature = signPayload(canonicalize(doc), privateKey);
  return JSON.stringify({ ...doc, signature }, null, 2);
}

export function applyDenyList(bundleJson: string): { revoked: number } {
  let bundle: any;
  try {
    bundle = JSON.parse(bundleJson);
  } catch {
    throw new Error("Invalid control-plane bundle: not valid JSON");
  }

  if (bundle.format !== FORMAT) throw new Error(`Invalid control-plane bundle: unknown format "${bundle.format}"`);

  const { signature, ...doc } = bundle;
  if (typeof signature !== "string" || !signature) throw new Error("Invalid control-plane bundle: missing signature");
  if (typeof doc.orgPublicKey !== "string" || !doc.orgPublicKey) throw new Error("Invalid control-plane bundle: missing orgPublicKey");

  if (!isTrustedOrg(doc.orgPublicKey)) {
    throw new Error(`Untrusted org public key. Run: keyblind control-plane trust ${doc.orgPublicKey}`);
  }

  if (!verifyPayload(canonicalize(doc), signature, doc.orgPublicKey)) {
    throw new Error("Invalid control-plane bundle: signature verification failed");
  }

  const revoked = Array.isArray(doc.revokedAgents) ? doc.revokedAgents : [];
  for (const entry of revoked) {
    if (entry && typeof entry.agentId === "string") {
      revokeAgent(entry.agentId, typeof entry.reason === "string" ? entry.reason : "");
    }
  }
  return { revoked: revoked.length };
}
