import crypto from "node:crypto";

export interface EncryptedKey {
  ciphertext: string;
  iv: string;
  tag: string;
}

function encKey(): Buffer {
  const secret =
    process.env.CONTROL_PLANE_KEY_ENC_KEY ||
    (process.env.NODE_ENV === "production" ? "" : "keyblind-dev-enc-key-change-in-production");
  if (!secret) throw new Error("CONTROL_PLANE_KEY_ENC_KEY must be set in production");
  return crypto.createHash("sha256").update(secret).digest();
}

// Generates the org's Ed25519 signing keypair. The public key is shared with
// member machines; the private key is AES-256-GCM-encrypted before storage so a
// DB leak alone does not expose the signing key.
export function generateOrgKey(): { publicKey: string; encrypted: EncryptedKey } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyB64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const privateKeyB64 = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(privateKeyB64, "utf8")), cipher.final()]);
  return {
    publicKey: publicKeyB64,
    encrypted: { ciphertext: ct.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") },
  };
}

export function decryptOrgKey(encrypted: EncryptedKey): string {
  const decipher = crypto.createDecipheriv("aes-256-gcm", encKey(), Buffer.from(encrypted.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
  const pt = Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, "base64")), decipher.final()]);
  return pt.toString("utf8");
}
