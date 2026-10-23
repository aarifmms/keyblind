import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "keyblind-hosted-test-"));
process.env.TURSO_DATABASE_URL = "file:" + path.join(tmpDir, "org.db");

import { getOrCreateUser, createOrg, createGroup, addGroupMember, bindAgent, computeAgentScopes, listOrgsForUser, getOrgForUser, provisionSsoUser, inviteMember } from "./org";
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

describe("multi-org membership", () => {
  it("lists all orgs and scopes lookup to a specific org", async () => {
    const target = await getOrCreateUser("multi@corp.com");
    const orgA = await createOrg("Alpha", "alpha-multi", "owner@corp.com");
    const orgB = await createOrg("Beta", "beta-multi", "owner@corp.com");
    await inviteMember(orgA.id, "multi@corp.com");
    await inviteMember(orgB.id, "multi@corp.com");

    const orgs = await listOrgsForUser(target.id);
    expect(orgs).toHaveLength(2);
    expect(orgs.map((m) => m.org.slug).sort()).toEqual(["alpha-multi", "beta-multi"]);
    expect(orgs.every((m) => m.role === "member")).toBe(true);

    const scoped = await getOrgForUser(target.id, orgB.id);
    expect(scoped!.org.id).toBe(orgB.id);
    expect(scoped!.role).toBe("member");

    const def = await getOrgForUser(target.id);
    expect(def).not.toBeNull();
    expect(["alpha-multi", "beta-multi"]).toContain(def!.org.slug);
  });
});

describe("provisionSsoUser", () => {
  it("returns null when the provider has no org mapping", async () => {
    const user = await getOrCreateUser("noprov@corp.com");
    expect(await provisionSsoUser(user.id, "noprov@corp.com", [], {})).toBeNull();
  });

  it("joins an existing org by slug", async () => {
    const org = await createOrg("Existing", "existing-sso", "owner@corp.com");
    const user = await getOrCreateUser("joiner@corp.com");
    const result = await provisionSsoUser(user.id, "joiner@corp.com", [], { orgSlug: "existing-sso", autoProvision: true });
    expect(result).not.toBeNull();
    expect(result!.org.id).toBe(org.id);
    expect(result!.role).toBe("member");
  });

  it("auto-provisions a missing org and makes the creator owner", async () => {
    const user = await getOrCreateUser("creator@corp.com");
    const result = await provisionSsoUser(user.id, "creator@corp.com", [], { orgSlug: "fresh-sso", autoProvision: true });
    expect(result).not.toBeNull();
    expect(result!.org.slug).toBe("fresh-sso");
    expect(result!.role).toBe("owner");
  });

  it("returns null when auto-provisioning is off and the org is missing", async () => {
    const user = await getOrCreateUser("noprov2@corp.com");
    expect(await provisionSsoUser(user.id, "noprov2@corp.com", [], { orgSlug: "ghost-org", autoProvision: false })).toBeNull();
  });
});

describe("addGroupMember", () => {
  it("is idempotent across repeated logins", async () => {
    const user = await getOrCreateUser("idem@corp.com");
    const org = await createOrg("Idem", "idem-org", "idem@corp.com");
    const g = await createGroup(org.id, "prod-read", "read:prod-*");
    await addGroupMember(org.id, g.id, user.id);
    await expect(addGroupMember(org.id, g.id, user.id)).resolves.toBeUndefined();
  });
});
