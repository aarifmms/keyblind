import crypto from "node:crypto";
import { getDb, migrate } from "./db";
import { decryptOrgKey } from "./org-key";
import { canonicalize } from "./manifest";

// Org-issued short-lived access tokens. The hosted control plane holds the org
// private key, so it mints a token that local vaults verify offline against the
// org public key (already trusted out-of-band). A token carries a scope grant,
// a single-use jti, and a bounded expiry.

const FORMAT = "keyblind-agent-token-v1";
const DEFAULT_TTL_SECONDS = 300; // 5 minutes
const MAX_TTL_SECONDS = 300;

function signEd25519(payload: string, privateKeyB64: string): string {
  const priv = crypto.createPrivateKey({ key: Buffer.from(privateKeyB64, "base64"), format: "der", type: "pkcs8" });
  return crypto.sign(null, Buffer.from(payload, "utf8"), priv).toString("base64");
}

export async function mintAgentToken(orgId: string, agentId: string, scope: string, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<string> {
  await migrate();
  const db = getDb();
  const orgRow = await db.execute({
    sql: "SELECT id, public_key AS publicKey, enc_private_key AS encPrivateKey, enc_iv AS encIv, enc_tag AS encTag FROM orgs WHERE id = ?",
    args: [orgId],
  });
  if (orgRow.rows.length === 0) throw new Error("Org not found");
  const org = orgRow.rows[0];
  const privateKey = decryptOrgKey({
    ciphertext: String(org.encPrivateKey),
    iv: String(org.encIv),
    tag: String(org.encTag),
  });

  const ttl = Number.isFinite(ttlSeconds) && ttlSeconds > 0 && ttlSeconds <= MAX_TTL_SECONDS ? Math.floor(ttlSeconds) : DEFAULT_TTL_SECONDS;
  const iat = Math.floor(Date.now() / 1000);
  const doc = {
    format: FORMAT,
    org: { id: String(org.id), publicKey: String(org.publicKey) },
    agentId,
    scope,
    iat,
    exp: iat + ttl,
    jti: crypto.randomUUID(),
  };
  const signature = signEd25519(canonicalize(doc), privateKey);
  return JSON.stringify({ ...doc, signature });
}
