import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { setLedgerPath, closeLedger, registerAgent, revokeAgent } from "../src/ledger.js";
import { trustOrg, listTrustedOrgs, canonicalize } from "../src/control-plane.js";
import { verifyAgentToken, authorizeToken, filterReadableByToken } from "../src/agent-token.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-token-test-"));
setLedgerPath(path.join(tmp, "ledger.db"));

beforeEach(() => {
  closeLedger();
  fs.rmSync(path.join(tmp, "ledger.db"), { force: true });
  fs.rmSync(path.join(tmp, "trusted-orgs.json"), { force: true });
});

afterAll(() => {
  closeLedger();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function generateKeypair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
  };
}

function signDoc(doc: unknown, privateKeyB64: string): string {
  const priv = crypto.createPrivateKey({ key: Buffer.from(privateKeyB64, "base64"), format: "der", type: "pkcs8" });
  return crypto.sign(null, Buffer.from(canonicalize(doc), "utf8"), priv).toString("base64");
}

function mintToken(kp: { publicKey: string; privateKey: string }, opts: { agentId?: string; scope?: string; ttl?: number; orgId?: string } = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const doc = {
    format: "keyblind-agent-token-v1",
    org: { id: opts.orgId ?? "org-1", publicKey: kp.publicKey },
    agentId: opts.agentId ?? "agent-1",
    scope: opts.scope ?? "read:*",
    iat: now,
    exp: now + (opts.ttl ?? 300),
    jti: crypto.randomUUID(),
  };
  return JSON.stringify({ ...doc, signature: signDoc(doc, kp.privateKey) });
}

describe("org-issued agent tokens (Model B)", () => {
  it("verifies and authorizes a trusted org token", () => {
    const kp = generateKeypair();
    trustOrg(kp.publicKey);
    expect(listTrustedOrgs()).toEqual([kp.publicKey]);

    const token = mintToken(kp, { scope: "read:prod-*" });
    expect(verifyAgentToken(token).agentId).toBe("agent-1");
    expect(authorizeToken(token, "read", "prod-db")).toBeNull();
    expect(authorizeToken(mintToken(kp, { scope: "read:prod-*" }), "read", "dev-db")).toMatch(/Out of scope/);
  });

  it("rejects a replayed token (single-use jti)", () => {
    const kp = generateKeypair();
    trustOrg(kp.publicKey);
    const token = mintToken(kp);

    expect(authorizeToken(token, "read", "SECRET")).toBeNull();
    expect(authorizeToken(token, "read", "SECRET")).toBe("Token already used");
  });

  it("rejects an expired token and an over-far-future expiry", () => {
    const kp = generateKeypair();
    trustOrg(kp.publicKey);

    const expired = mintToken(kp, { ttl: -60 });
    expect(authorizeToken(expired, "read", "SECRET")).toBe("Agent token expired");

    const farFuture = mintToken(kp, { ttl: 3600 });
    expect(authorizeToken(farFuture, "read", "SECRET")).toBe("Agent token expiry too far in the future");
  });

  it("rejects a tampered signature", () => {
    const kp = generateKeypair();
    trustOrg(kp.publicKey);
    const parsed = JSON.parse(mintToken(kp));
    parsed.scope = "read:all-*"; // mutate after signing
    expect(authorizeToken(JSON.stringify(parsed), "read", "SECRET")).toBe("Invalid agent token: signature verification failed");
  });

  it("rejects an untrusted org public key", () => {
    const kp = generateKeypair();
    const token = mintToken(kp); // never trusted
    expect(authorizeToken(token, "read", "SECRET")).toBe("Untrusted org public key");
  });

  it("denies a token for a centrally revoked agent", () => {
    const kp = generateKeypair();
    trustOrg(kp.publicKey);
    const { identity } = registerAgent("bot", "sponsor@corp.com", "read:*");
    const token = mintToken(kp, { agentId: identity.id });

    expect(authorizeToken(token, "read", "SECRET")).toBeNull();

    revokeAgent(identity.id, "compromised");
    expect(authorizeToken(mintToken(kp, { agentId: identity.id }), "read", "SECRET")).toBe("Agent revoked");
  });

  it("filters list_secrets names by token scope", () => {
    const kp = generateKeypair();
    trustOrg(kp.publicKey);
    const token = mintToken(kp, { scope: "read:prod-*" });
    const result = filterReadableByToken(token, ["prod-db", "prod-api", "dev-db"]);
    expect(result.error).toBeNull();
    expect(result.secrets).toEqual(["prod-db", "prod-api"]);
  });
});
