import { canonicalize, verifyPayload, listTrustedOrgs } from "./control-plane.js";
import { isAgentRevoked, scopeMatches, consumeNonce } from "./ledger.js";

// Org-issued short-lived access tokens (Model B). The hosted control plane
// (which holds the org private key) mints a token that the local vault verifies
// offline against the already-trusted org public key. The token carries a
// scope grant, a single-use jti, and a bounded expiry, so it cannot be replayed
// beyond its window and is revoked the moment the agent is denied centrally.

const FORMAT = "keyblind-agent-token-v1";
const SKEW_SECONDS = 30;
const MAX_TTL_SECONDS = 300; // 5 minutes

export interface AgentToken {
  format: string;
  org: { id: string; publicKey: string };
  agentId: string;
  scope: string;
  iat: number;
  exp: number;
  jti: string;
  signature: string;
}

// Parses and verifies a token (format, trusted org key, signature, expiry) but
// does not consume the jti. Throws on any failure so callers can surface the
// reason without a null-vs-error ambiguity.
export function verifyAgentToken(tokenJson: string): AgentToken {
  let parsed: unknown;
  try {
    parsed = JSON.parse(tokenJson);
  } catch {
    throw new Error("Invalid agent token: not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || (parsed as Record<string, unknown>).format !== FORMAT) {
    throw new Error(`Invalid agent token: unknown format`);
  }
  const { signature, ...doc } = parsed as Record<string, unknown>;
  if (typeof signature !== "string" || !signature) throw new Error("Invalid agent token: missing signature");

  const org = doc.org as { id?: string; publicKey?: string } | undefined;
  if (!org || typeof org.publicKey !== "string" || !org.publicKey) throw new Error("Invalid agent token: missing org public key");
  if (!listTrustedOrgs().includes(org.publicKey)) throw new Error("Untrusted org public key");
  if (!verifyPayload(canonicalize(doc), signature, org.publicKey)) throw new Error("Invalid agent token: signature verification failed");

  if (typeof doc.agentId !== "string" || !doc.agentId) throw new Error("Invalid agent token: missing agentId");
  if (typeof doc.scope !== "string") throw new Error("Invalid agent token: missing scope");
  if (typeof doc.jti !== "string" || !doc.jti) throw new Error("Invalid agent token: missing jti");

  const now = Math.floor(Date.now() / 1000);
  const exp = doc.exp as number;
  if (typeof exp !== "number" || !Number.isFinite(exp) || exp < now - SKEW_SECONDS) throw new Error("Agent token expired");
  if (exp > now + MAX_TTL_SECONDS) throw new Error("Agent token expiry too far in the future");

  return parsed as AgentToken;
}

function verifyAndConsume(tokenJson: string): AgentToken {
  const token = verifyAgentToken(tokenJson);
  if (isAgentRevoked(token.agentId)) throw new Error("Agent revoked");
  // jti is single-use, namespaced by org so two orgs cannot collide.
  if (!consumeNonce(`org:${token.org.id}`, token.jti)) throw new Error("Token already used");
  return token;
}

// The authorization entry point for read/write actions: verify + revoke +
// single-use jti + scope. Returns a deny reason or null to allow.
export function authorizeToken(tokenJson: string, action: "read" | "write", target: string): string | null {
  let token: AgentToken;
  try {
    token = verifyAndConsume(tokenJson);
  } catch (err) {
    return (err as Error).message;
  }
  if (!scopeMatches(token.scope, action, target)) return `Out of scope (token scope: "${token.scope || "(none)"}")`;
  return null;
}

// list_secrets with a token: verifies + consumes the token once, then filters
// the names to those the token's scope grants read access to.
export function filterReadableByToken(tokenJson: string, secrets: string[]): { error: string | null; secrets: string[] } {
  let token: AgentToken;
  try {
    token = verifyAndConsume(tokenJson);
  } catch (err) {
    return { error: (err as Error).message, secrets: [] };
  }
  return { error: null, secrets: secrets.filter((name) => scopeMatches(token.scope, "read", name)) };
}
