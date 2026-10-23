import crypto from "node:crypto";
import { getDb, migrate } from "./db";
import { decryptOrgKey } from "./org-key";
import { listGroups, listRevocations, computeAgentScopes } from "./org";

const FORMAT = "keyblind-control-plane-v2";

// Recursive, key-sorted JSON so a signature is independent of key order. The
// signer and verifier both run this on the document (minus the signature field).
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
}

function signEd25519(payload: string, privateKeyB64: string): string {
  const priv = crypto.createPrivateKey({ key: Buffer.from(privateKeyB64, "base64"), format: "der", type: "pkcs8" });
  return crypto.sign(null, Buffer.from(payload, "utf8"), priv).toString("base64");
}

// Builds the signed, value-free org manifest: deny list + group-derived agent
// scopes. No secret values or ciphertext. Local vaults verify the signature
// against the org public key (trusted out-of-band) and apply the contents.
export async function buildManifest(orgId: string): Promise<string> {
  await migrate();
  const db = getDb();
  const orgRow = await db.execute({
    sql: "SELECT id, name, public_key AS publicKey, enc_private_key AS encPrivateKey, enc_iv AS encIv, enc_tag AS encTag FROM orgs WHERE id = ?",
    args: [orgId],
  });
  if (orgRow.rows.length === 0) throw new Error("Org not found");
  const org = orgRow.rows[0];
  const privateKey = decryptOrgKey({
    ciphertext: String(org.encPrivateKey),
    iv: String(org.encIv),
    tag: String(org.encTag),
  });

  const [denyList, groups, agentScopes] = await Promise.all([listRevocations(orgId), listGroups(orgId), computeAgentScopes(orgId)]);

  const doc = {
    format: FORMAT,
    org: { id: String(org.id), name: String(org.name), publicKey: String(org.publicKey) },
    exportedAt: new Date().toISOString(),
    denyList,
    groups,
    agentScopes,
  };
  const signature = signEd25519(canonicalize(doc), privateKey);
  return JSON.stringify({ ...doc, signature });
}
