import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const state = vi.hoisted(() => ({ tmpDir: "" }));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const homedir = () => {
    if (!state.tmpDir) {
      state.tmpDir = path.join(fs.mkdtempSync(path.join(actual.tmpdir(), "org-sync-test-")));
    }
    return state.tmpDir;
  };
  return { ...actual, homedir, default: { ...actual.default, homedir } };
});

import {
  setLedgerPath, closeLedger, registerAgent, signRequest, authorizeAction, filterReadableSecrets,
  replaceOrgGrants, replaceOrgRevocations, getGroupScopes, listGroupGrants, isAgentRevoked, revokeAgent,
} from "../src/ledger.js";
import { trustOrg, listTrustedOrgs, canonicalize } from "../src/control-plane.js";
import { connectOrg, syncOrg, disconnectOrg, getOrgConnection } from "../src/org-sync.js";

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

function signedRequest(privateKey: string, action: string, target: string) {
  const nonce = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + 60;
  return { nonce, exp, signature: signRequest(privateKey, action, target, nonce, exp) };
}

function makeManifest(kp: { publicKey: string; privateKey: string }, opts: { orgId?: string; denyList?: unknown[]; agentScopes?: unknown[] } = {}) {
  const orgId = opts.orgId ?? "org-1";
  const doc = {
    format: "keyblind-control-plane-v2",
    org: { id: orgId, name: "Acme", publicKey: kp.publicKey },
    exportedAt: new Date().toISOString(),
    denyList: opts.denyList ?? [],
    groups: [],
    agentScopes: opts.agentScopes ?? [],
  };
  return JSON.stringify({ ...doc, signature: signDoc(doc, kp.privateKey) });
}

beforeAll(() => {
  fs.mkdirSync(state.tmpDir, { recursive: true });
  setLedgerPath(path.join(state.tmpDir, "ledger.db"));
});

afterAll(() => {
  closeLedger();
  fs.rmSync(state.tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  closeLedger();
  fs.rmSync(path.join(state.tmpDir, "ledger.db"), { force: true });
  fs.rmSync(path.join(state.tmpDir, "connection.json"), { force: true });
  fs.rmSync(path.join(state.tmpDir, "trusted-orgs.json"), { force: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("group grants enforcement", () => {
  it("unions group scope into authorizeAction (read granted, write denied)", () => {
    const { identity, privateKey } = registerAgent("bot", "sponsor@corp.com", "");
    replaceOrgGrants("org-1", [{ agentId: identity.id, scope: "read:prod-*" }]);

    const readSig = signedRequest(privateKey, "read", "prod-db");
    const writeSig = signedRequest(privateKey, "write", "prod-db");
    const otherReadSig = signedRequest(privateKey, "read", "dev-secret");

    expect(authorizeAction(identity.id, "read", "prod-db", readSig.nonce, readSig.exp, readSig.signature)).toBeNull();
    expect(authorizeAction(identity.id, "write", "prod-db", writeSig.nonce, writeSig.exp, writeSig.signature)).toBe("Out of scope (agent scope: \"(none)\")");
    expect(authorizeAction(identity.id, "read", "dev-secret", otherReadSig.nonce, otherReadSig.exp, otherReadSig.signature)).toBe("Out of scope (agent scope: \"(none)\")");
  });

  it("includes group-granted names in filterReadableSecrets", () => {
    const { identity } = registerAgent("bot", "sponsor@corp.com", "read:public-*");
    replaceOrgGrants("org-1", [{ agentId: identity.id, scope: "read:prod-*" }]);

    expect(filterReadableSecrets(identity.id, ["public-key", "prod-db", "dev-secret"]).sort())
      .toEqual(["prod-db", "public-key"]);
  });

  it("getGroupScopes and listGroupGrants reflect synced grants", () => {
    const { identity } = registerAgent("bot", "sponsor@corp.com", "");
    replaceOrgGrants("org-1", [{ agentId: identity.id, scope: "read:prod-*" }]);

    expect(getGroupScopes(identity.id)).toEqual(["read:prod-*"]);
    expect(listGroupGrants()).toEqual([
      { orgId: "org-1", agentId: identity.id, scope: "read:prod-*", syncedAt: expect.any(String) },
    ]);
  });

  it("replaceOrgGrants reconciles (removes grants absent from the new manifest)", () => {
    const a = registerAgent("a", "s@c.com", "");
    const b = registerAgent("b", "s@c.com", "");
    replaceOrgGrants("org-1", [
      { agentId: a.identity.id, scope: "read:a-*" },
      { agentId: b.identity.id, scope: "read:b-*" },
    ]);

    replaceOrgGrants("org-1", [{ agentId: a.identity.id, scope: "read:a-*" }]);

    expect(getGroupScopes(a.identity.id)).toEqual(["read:a-*"]);
    expect(getGroupScopes(b.identity.id)).toEqual([]);
  });
});

describe("org revocation reconciliation", () => {
  it("reconciles the org deny list while leaving local revocations untouched", () => {
    const a = registerAgent("a", "s@c.com", "");
    const b = registerAgent("b", "s@c.com", "");
    revokeAgent(b.identity.id, "local revoke");

    const revoked = replaceOrgRevocations("org-1", [{ agentId: a.identity.id, reason: "leaked" }]);
    expect(revoked).toBe(1);
    expect(isAgentRevoked(a.identity.id)).toBe(true);
    expect(isAgentRevoked(b.identity.id)).toBe(true); // local still revoked

    // New manifest drops agent a's revocation → un-revoked (reconciliation).
    replaceOrgRevocations("org-1", []);
    expect(isAgentRevoked(a.identity.id)).toBe(false);
    expect(isAgentRevoked(b.identity.id)).toBe(true); // local untouched
  });
});

describe("connectOrg", () => {
  it("fetches well-known, trusts the key, and persists the connection", async () => {
    const kp = generateKeypair();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/well-known")) {
        return new Response(JSON.stringify({ orgId: "org-1", name: "Acme", publicKey: kp.publicKey }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }));

    const conn = await connectOrg("https://cp.example/api/org/acme");
    expect(conn).toEqual({ url: "https://cp.example/api/org/acme", orgId: "org-1", orgPublicKey: kp.publicKey });
    expect(listTrustedOrgs()).toEqual([kp.publicKey]);
    expect(getOrgConnection()).toEqual(conn);
  });

  it("disconnect removes the connection", async () => {
    const kp = generateKeypair();
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      new Response(JSON.stringify({ orgId: "org-1", publicKey: kp.publicKey }), { status: 200 }),
    ));
    await connectOrg("https://cp.example/api/org/acme");
    disconnectOrg();
    expect(getOrgConnection()).toBeNull();
  });
});

describe("syncOrg", () => {
  function stubFetch(manifestJson: string) {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/manifest")) return new Response(manifestJson, { status: 200 });
      if (url.endsWith("/well-known")) return new Response(JSON.stringify({ orgId: "org-1", publicKey: "k" }), { status: 200 });
      return new Response("not found", { status: 404 });
    }));
  }

  it("applies deny list and group grants from a signed manifest", async () => {
    const kp = generateKeypair();
    const agent = registerAgent("bot", "sponsor@corp.com", "");
    const revokedAgent = registerAgent("bad", "sponsor@corp.com", "");

    const manifest = makeManifest(kp, {
      denyList: [{ agentId: revokedAgent.identity.id, reason: "compromised" }],
      agentScopes: [{ agentId: agent.identity.id, scope: "read:prod-*" }],
    });

    // Trust the org key out-of-band, then point the connection at it directly.
    trustOrg(kp.publicKey);
    fs.writeFileSync(
      path.join(state.tmpDir, "connection.json"),
      JSON.stringify({ url: "https://cp.example/api/org/acme", orgId: "org-1", orgPublicKey: kp.publicKey }),
    );
    stubFetch(manifest);

    const result = await syncOrg();
    expect(result).toEqual({ revoked: 1, grants: 1 });
    expect(isAgentRevoked(revokedAgent.identity.id)).toBe(true);
    expect(getGroupScopes(agent.identity.id)).toEqual(["read:prod-*"]);
  });

  it("rejects an untrusted org public key", async () => {
    const kp = generateKeypair();
    const manifest = makeManifest(kp);
    fs.writeFileSync(
      path.join(state.tmpDir, "connection.json"),
      JSON.stringify({ url: "https://cp.example/api/org/acme", orgId: "org-1", orgPublicKey: kp.publicKey }),
    );
    stubFetch(manifest);

    await expect(syncOrg()).rejects.toThrow(/untrusted org public key/i);
  });

  it("rejects a tampered manifest", async () => {
    const kp = generateKeypair();
    trustOrg(kp.publicKey);
    fs.writeFileSync(
      path.join(state.tmpDir, "connection.json"),
      JSON.stringify({ url: "https://cp.example/api/org/acme", orgId: "org-1", orgPublicKey: kp.publicKey }),
    );

    const tampered = JSON.parse(makeManifest(kp, { denyList: [{ agentId: "sneaky", reason: "x" }] }));
    tampered.denyList.push({ agentId: "evil", reason: "injected" }); // mutate after signing
    stubFetch(JSON.stringify(tampered));

    await expect(syncOrg()).rejects.toThrow(/signature verification failed/i);
  });

  it("throws when not connected", async () => {
    await expect(syncOrg()).rejects.toThrow(/not connected to an org/i);
  });
});
