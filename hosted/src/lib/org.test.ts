import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "keyblind-hosted-test-"));
process.env.TURSO_DATABASE_URL = "file:" + path.join(tmpDir, "org.db");

import { getOrCreateUser, createOrg, createGroup, addGroupMember, bindAgent, computeAgentScopes } from "./org";
import { buildManifest, canonicalize } from "./manifest";

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("computeAgentScopes", () => {
  it("unions each agent's group-derived scope", async () => {
    const user = await getOrCreateUser("owner@corp.com");
    const org = await createOrg("Acme", "acme", "owner@corp.com");
    const g1 = await createGroup(org.id, "prod-read", "read:prod-*");
    const g2 = await createGroup(org.id, "ci-write", "write:ci-*");
    await addGroupMember(org.id, g1.id, user.id);
    await addGroupMember(org.id, g2.id, user.id);
    await bindAgent(org.id, user.id, "agent-1", "Bot", "pubkey-1");

    const scopes = await computeAgentScopes(org.id);
    const entry = scopes.find((s) => s.agentId === "agent-1");
    expect(entry).toBeDefined();
    expect(entry!.scope.split(" ").sort()).toEqual(["read:prod-*", "write:ci-*"]);
  });

  it("returns no scope for an agent with no groups", async () => {
    const user = await getOrCreateUser("owner2@corp.com");
    const org = await createOrg("Beta", "beta", "owner2@corp.com");
    await bindAgent(org.id, user.id, "agent-2", "Bot", "pubkey-2");
    expect(await computeAgentScopes(org.id)).toEqual([]);
  });
});

describe("buildManifest", () => {
  it("signs the manifest so it verifies against the org public key", async () => {
    const user = await getOrCreateUser("owner3@corp.com");
    const org = await createOrg("Gamma", "gamma", "owner3@corp.com");
    await bindAgent(org.id, user.id, "agent-3", "Bot", "pubkey-3");

    const manifest = JSON.parse(await buildManifest(org.id));
    expect(manifest.format).toBe("keyblind-control-plane-v2");
    expect(manifest.org.publicKey).toBe(org.publicKey);

    const { signature, ...doc } = manifest;
    const pub = crypto.createPublicKey({ key: Buffer.from(org.publicKey, "base64"), format: "der", type: "spki" });
    expect(crypto.verify(null, Buffer.from(canonicalize(doc), "utf8"), pub, Buffer.from(signature, "base64"))).toBe(true);
  });

  it("does not cover a mutated document (tamper detected)", async () => {
    const user = await getOrCreateUser("owner4@corp.com");
    const org = await createOrg("Delta", "delta", "owner4@corp.com");
    const manifest = JSON.parse(await buildManifest(org.id));
    manifest.denyList.push({ agentId: "evil", reason: "injected" });

    const { signature, ...doc } = manifest;
    const pub = crypto.createPublicKey({ key: Buffer.from(org.publicKey, "base64"), format: "der", type: "spki" });
    expect(crypto.verify(null, Buffer.from(canonicalize(doc), "utf8"), pub, Buffer.from(signature, "base64"))).toBe(false);
  });
});
