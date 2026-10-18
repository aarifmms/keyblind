import crypto from "node:crypto";

// Ed25519 public keys accepted for license verification, in priority order.
// Rotate the signing key without breaking existing licenses by appending the new
// public key via KEYBLIND_PUBLIC_KEYS (JSON array or comma-separated) or
// KEYBLIND_PUBLIC_KEY. The baked fallback is always tried last.
const FALLBACK_PUBLIC_KEY = "MCowBQYDK2VwAyEAaxu7ncsxw3rW0Sycd9iIVu4prMKbsjN9hZghJYI2LoY=";

function getPublicKeys(): string[] {
  const keys: string[] = [];

  const list = process.env.KEYBLIND_PUBLIC_KEYS;
  if (list) {
    try {
      const parsed = JSON.parse(list);
      if (Array.isArray(parsed)) keys.push(...parsed);
      else keys.push(...list.split(","));
    } catch {
      keys.push(...list.split(","));
    }
  }

  if (process.env.KEYBLIND_PUBLIC_KEY) keys.push(process.env.KEYBLIND_PUBLIC_KEY);
  keys.push(FALLBACK_PUBLIC_KEY);

  return keys.filter(Boolean).map((k) => k.trim());
}

export interface LicenseInfo {
  tier: "free" | "pro" | "team";
  email: string;
  exp: string; // YYYY-MM-DD
  iat: string; // YYYY-MM-DD
  id: string;
}

export function verifyLicenseKey(key: string): LicenseInfo | null {
  try {
    if (!key || !key.startsWith("keyblind.")) return null;

    const parts = key.slice("keyblind.".length).split(".");
    if (parts.length !== 2) return null;

    const payloadJson = Buffer.from(parts[0], "base64url").toString("utf8");
    const signature = Buffer.from(parts[1], "base64url");
    const payload: LicenseInfo = JSON.parse(payloadJson);

    // Validate required fields
    if (!payload.tier || !payload.email || !payload.exp || !payload.iat || !payload.id) return null;
    if (!["free", "pro", "team"].includes(payload.tier)) return null;

    // Check expiry
    const expDate = new Date(payload.exp + "T23:59:59Z");
    if (expDate < new Date()) return null;

    // Verify Ed25519 signature against any accepted public key
    const data = Buffer.from(JSON.stringify(payload));
    const valid = getPublicKeys().some((keyB64) => {
      try {
        const pubKey = crypto.createPublicKey({
          key: Buffer.from(keyB64, "base64"),
          format: "der",
          type: "spki",
        });
        return crypto.verify(null, data, pubKey, signature);
      } catch {
        return false;
      }
    });

    return valid ? payload : null;
  } catch {
    return null;
  }
}
